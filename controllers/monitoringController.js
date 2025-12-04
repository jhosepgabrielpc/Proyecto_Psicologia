// controllers/monitoringController.js
// Panel de Monitoreo Clínico Avanzado

const db = require('../config/database');
const crypto = require('crypto'); // para enlaces de reunión de crisis

// -----------------------------------------------------------
// Helper: construir datos del radar a partir de tests PHQ-9
// -----------------------------------------------------------
function buildRadarFromTests(testsRows) {
    // Filtramos solo PHQ-9 (ajusta si tu tipo_test es distinto)
    const phqTests = testsRows.filter(t => {
        if (!t.tipo_test) return false;
        const tipo = String(t.tipo_test).toUpperCase();
        return tipo.includes('PHQ');
    });

    if (phqTests.length === 0) {
        return { labels: [], values: [] };
    }

    // Dimensiones del PHQ-9 agrupadas por ítems
    const PHQ_DIMENSIONS = {
        'Anhedonia / Interés': ['P1'],
        'Ánimo deprimido': ['P2'],
        'Sueño': ['P3'],
        'Energía / Fatiga': ['P4'],
        'Apetito': ['P5'],
        'Autoimagen / Culpa': ['P6'],
        'Concentración': ['P7'],
        'Ritmo psicomotor': ['P8'],
        'Ideación': ['P9']
    };

    const totals = {};
    const counts = {};

    Object.keys(PHQ_DIMENSIONS).forEach(dim => {
        totals[dim] = 0;
        counts[dim] = 0;
    });

    phqTests.forEach(test => {
        let answers = {};

        try {
            if (typeof test.respuestas_json === 'string') {
                answers = test.respuestas_json
                    ? JSON.parse(test.respuestas_json)
                    : {};
            } else if (test.respuestas_json) {
                // Si ya viene como objeto desde DB
                answers = test.respuestas_json;
            }
        } catch (e) {
            // Si hay error de parseo, ignoramos este test para el radar
            return;
        }

        Object.entries(PHQ_DIMENSIONS).forEach(([dim, keys]) => {
            keys.forEach(k => {
                let raw = answers[k];

                if (raw === undefined && typeof k === 'string') {
                    raw = answers[k.toLowerCase()];
                }
                if (raw === undefined && typeof k === 'string') {
                    raw = answers[k.toUpperCase()];
                }

                const val = Number(raw);
                if (!Number.isNaN(val)) {
                    totals[dim] += val;
                    counts[dim] += 1;
                }
            });
        });
    });

    const labels = [];
    const values = [];

    Object.keys(PHQ_DIMENSIONS).forEach(dim => {
        if (counts[dim] > 0) {
            const avg = totals[dim] / counts[dim]; // 0-3 típico PHQ-9
            labels.push(dim);
            values.push(Number(avg.toFixed(2)));
        }
    });

    return { labels, values };
}

// -----------------------------------------------------------
// Helper: cargar datos de un paciente concreto
// -----------------------------------------------------------
async function loadPatientMonitoringData(patientId, daysWindow) {
    const days = [7, 30].includes(daysWindow) ? daysWindow : 7;
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);

    // Checkins (ánimo + sueño)
    const checkinsRes = await db.query(
        `
        SELECT 
            id_checkin,
            id_paciente,
            fecha_hora,
            valencia,
            horas_sueno,
            emocion_principal,
            notas
        FROM checkins_emocionales
        WHERE id_paciente = $1
          AND fecha_hora >= $2
        ORDER BY fecha_hora DESC
        `,
        [patientId, fromDate]
    );

    // Tests psicológicos (PHQ-9, GAD-7, etc.)
    const testsRes = await db.query(
        `
        SELECT 
            id_resultado,
            tipo_test,
            puntaje_total,
            nivel_severidad AS severidad,
            fecha_realizacion,
            respuestas_json
        FROM resultados_tests
        WHERE id_paciente = $1
        ORDER BY fecha_realizacion DESC
        `,
        [patientId]
    );

    // 🔹 Parsear respuestas_json aquí (para que en EJS NO haya try/catch)
    const testsRows = testsRes.rows.map(row => {
        let parsed = null;

        try {
            if (typeof row.respuestas_json === 'string') {
                parsed = row.respuestas_json
                    ? JSON.parse(row.respuestas_json)
                    : null;
            } else if (row.respuestas_json) {
                parsed = row.respuestas_json;
            }
        } catch (e) {
            parsed = null;
        }

        return {
            ...row,
            respuestas_json: parsed
        };
    });

    // Radar PHQ-9 usando las respuestas ya parseadas
    const { labels, values } = buildRadarFromTests(testsRows);

    return {
        checkins: checkinsRes.rows,
        tests: testsRows,       // <- ya con respuestas_json como OBJETO o null
        radarLabels: labels,
        radarValues: values
    };
}

// -----------------------------------------------------------
// Mensaje de apoyo generado localmente (sin GPT)
// -----------------------------------------------------------
function buildSupportMessageFromMood(lastCheckin) {
    if (!lastCheckin) {
        return 'Bienvenido/a. Este espacio es para ti: tómate un momento para respirar, revisar cómo te has sentido y recordar que pedir ayuda siempre es una decisión valiente.';
    }

    const val = Number(lastCheckin.valencia ?? 3);
    const emo = String(lastCheckin.emocion_principal || '').toLowerCase();

    // Muy bajo / crisis
    if (
        val <= 2 ||
        emo.includes('pánico') ||
        emo.includes('panico') ||
        emo.includes('triste') ||
        emo.includes('ansioso') ||
        emo.includes('ansiosa')
    ) {
        return 'Gracias por entrar hoy, incluso sintiéndote así. No estás solo/a: este panel está pensado para que puedas expresar lo que sientes y recibir apoyo. Puedes usar tus registros para contarle a tu terapeuta con más claridad cómo han sido tus días y, si lo necesitas, pide ayuda en este momento.';
    }

    // Medio / estable
    if (val === 3 || emo.includes('cansado') || emo.includes('cansada')) {
        return 'Has hecho un buen trabajo manteniéndote al tanto de cómo te sientes. Aunque haya días pesados, cada registro es un paso para conocerte mejor y tomar decisiones más cuidadosas contigo mismo/a. Sigue usando este espacio como una herramienta para cuidarte.';
    }

    // Alto / positivo
    return 'Se nota que estás atravesando un momento más estable, y eso también merece ser reconocido. Aprovecha este estado para reforzar hábitos que te ayudan y para seguir construyendo tu bienestar. Este panel está aquí para acompañarte en los días buenos y en los días difíciles.';
}

// -----------------------------------------------------------
// GET /dashboard/monitoring
// -----------------------------------------------------------
const getMonitoringView = async (req, res) => {
    const user = req.session.user;
    if (!user) {
        return res.redirect('/auth/login');
    }

    const daysParam = parseInt(req.query.days, 10);
    const currentFilter =
        !Number.isNaN(daysParam) && [7, 30].includes(daysParam)
            ? daysParam
            : 7;

    const msg = req.query.msg || null;

    let patientsList = [];
    let viewingPatient = null;
    let checkins = [];
    let tests = [];
    let radarLabels = [];
    let radarValues = [];
    let supportMessage = null;

    const kpis = {
        total: 0,
        criticos: 0,
        sueno_bajo: 0,
        estables: 0
    };

    try {
        // 1) PACIENTE: solo ve su propio monitoreo
        if (user.nombre_rol === 'Paciente') {
            const pRes = await db.query(
                `
                SELECT 
                    p.id_paciente,
                    u.nombre,
                    u.apellido,
                    u.email
                FROM Pacientes p
                JOIN Usuarios u ON p.id_usuario = u.id_usuario
                WHERE p.id_usuario = $1
                `,
                [user.id_usuario]
            );

            if (!pRes.rows.length) {
                return res.render('dashboard/monitoring', {
                    title: 'Monitoreo Clínico Avanzado',
                    user,
                    kpis,
                    patientsList: [],
                    viewingPatient: null,
                    checkins: [],
                    tests: [],
                    radarLabels: [],
                    radarValues: [],
                    currentFilter,
                    msg,
                    supportMessage: buildSupportMessageFromMood(null)
                });
            }

            viewingPatient = pRes.rows[0];

            const data = await loadPatientMonitoringData(
                viewingPatient.id_paciente,
                currentFilter
            );

            checkins = data.checkins;
            tests = data.tests;
            radarLabels = data.radarLabels;
            radarValues = data.radarValues;

            const lastCheckin = checkins[0] || null;
            supportMessage = buildSupportMessageFromMood(lastCheckin);
        } else {
            // 2) TERAPEUTA / ADMIN:
            //    a) Vista global (lista + KPIs)
            //    b) Detalle opcional de un paciente

            // a) Lista de pacientes visibles para este usuario
            let patientsQuery = `
                SELECT 
                    p.id_paciente,
                    u.nombre,
                    u.apellido,
                    u.email
                FROM Pacientes p
                JOIN Usuarios u ON p.id_usuario = u.id_usuario
            `;
            const params = [];

            if (user.nombre_rol === 'Terapeuta') {
                patientsQuery += `
                    JOIN Terapeutas t ON p.id_terapeuta = t.id_terapeuta
                    WHERE t.id_usuario = $1
                `;
                params.push(user.id_usuario);
            }

            patientsQuery += ' ORDER BY u.apellido ASC, u.nombre ASC';

            const patientsRes = await db.query(patientsQuery, params);
            const tempList = [];

            for (const row of patientsRes.rows) {
                const lastCheckRes = await db.query(
                    `
                    SELECT 
                        fecha_hora,
                        valencia,
                        horas_sueno,
                        emocion_principal,
                        notas
                    FROM checkins_emocionales
                    WHERE id_paciente = $1
                    ORDER BY fecha_hora DESC
                    LIMIT 1
                    `,
                    [row.id_paciente]
                );

                const last = lastCheckRes.rows[0];

                let ultima_valencia = null;
                let ultimo_sueno = null;
                let ultima_emocion = null;
                let ultimas_notas = null;
                let ultimo_checkin = null;

                kpis.total += 1;

                if (last) {
                    ultima_valencia = Number(last.valencia);
                    ultimo_sueno = last.horas_sueno;
                    ultima_emocion = last.emocion_principal;
                    ultimas_notas = last.notas;
                    ultimo_checkin = last.fecha_hora;

                    if (ultima_valencia <= 2) {
                        kpis.criticos += 1;
                    }
                    if ((ultimo_sueno || 0) < 6) {
                        kpis.sueno_bajo += 1;
                    }
                    if (ultima_valencia >= 3) {
                        kpis.estables += 1;
                    }
                }

                tempList.push({
                    ...row,
                    ultima_valencia,
                    ultimo_sueno,
                    ultima_emocion,
                    ultimas_notas,
                    ultimo_checkin
                });
            }

            patientsList = tempList;

            // b) Detalle de un paciente concreto (param ?patient=)
            const patientParam = parseInt(req.query.patient, 10);
            if (!Number.isNaN(patientParam)) {
                const pRes = await db.query(
                    `
                    SELECT 
                        p.id_paciente,
                        u.nombre,
                        u.apellido,
                        u.email
                    FROM Pacientes p
                    JOIN Usuarios u ON p.id_usuario = u.id_usuario
                    WHERE p.id_paciente = $1
                    `,
                    [patientParam]
                );

                if (pRes.rows.length) {
                    viewingPatient = pRes.rows[0];

                    const data = await loadPatientMonitoringData(
                        viewingPatient.id_paciente,
                        currentFilter
                    );

                    checkins = data.checkins;
                    tests = data.tests;
                    radarLabels = data.radarLabels;
                    radarValues = data.radarValues;
                }
            }

            // Mensaje de apoyo para terapeuta/admin (si está viendo un paciente concreto)
            const lastCheckin = checkins[0] || null;
            supportMessage = buildSupportMessageFromMood(lastCheckin);
        }

        return res.render('dashboard/monitoring', {
            title: 'Monitoreo Clínico Avanzado',
            user,
            kpis,
            patientsList,
            viewingPatient,
            checkins,
            tests,
            radarLabels,
            radarValues,
            currentFilter,
            msg,
            supportMessage
        });
    } catch (error) {
        console.error('Error en getMonitoringView:', error);
        return res.status(500).render('error', {
            title: 'Error',
            message: 'Error al cargar el panel de monitoreo.',
            error,
            user
        });
    }
};

// -----------------------------------------------------------
// POST /dashboard/monitoring/checkin  (paciente registra)
// -----------------------------------------------------------
const createCheckin = async (req, res) => {
    const user = req.session.user;
    if (!user) return res.redirect('/auth/login');

    const { valencia, horas_sueno, emocion, notas } = req.body;

    // Normalizamos números para evitar NaN raros
    const valenciaNum = Number(valencia);
    const horasNum = Number(horas_sueno);

    try {
        const pRes = await db.query(
            'SELECT id_paciente FROM Pacientes WHERE id_usuario = $1',
            [user.id_usuario]
        );

        if (!pRes.rows.length) {
            return res.redirect('/dashboard/monitoring');
        }

        const patientId = pRes.rows[0].id_paciente;

        await db.query(
            `
            INSERT INTO checkins_emocionales
                (id_paciente, fecha_hora, valencia, horas_sueno, emocion_principal, notas)
            VALUES
                ($1, NOW(), $2, $3, $4, $5)
            `,
            [
                patientId,
                Number.isNaN(valenciaNum) ? null : valenciaNum,
                Number.isNaN(horasNum) ? null : horasNum,
                emocion || null,
                notas || null
            ]
        );

        return res.redirect('/dashboard/monitoring');
    } catch (error) {
        console.error('Error creando checkin:', error);
        return res.redirect('/dashboard/monitoring');
    }
};

// -----------------------------------------------------------
// POST /dashboard/monitoring/panic  (botón SOS del paciente)
// Cita de crisis con prioridad absoluta + reprogramación
// -----------------------------------------------------------
const triggerPanic = async (req, res) => {
    const user = req.session.user;
    if (!user) {
        return res.status(401).json({ ok: false, message: 'No autenticado' });
    }

    // Solo tiene sentido para pacientes
    if (user.nombre_rol !== 'Paciente') {
        return res.status(403).json({
            ok: false,
            message: 'Solo pacientes pueden usar el botón de pánico.'
        });
    }

    const modalidadRaw = (req.body.modalidad || '').toString().toLowerCase();
    const modalidad =
        modalidadRaw === 'presencial'
            ? 'Presencial'
            : 'Virtual'; // por defecto Virtual

    const crisisDurationMinutes = 60;

    try {
        await db.query('BEGIN');

        // 1) Datos de paciente + terapeuta asignado
        const pRes = await db.query(
            `
            SELECT 
                p.id_paciente,
                p.id_terapeuta,
                u.id_usuario AS id_usuario_paciente,
                u.nombre AS pac_nombre,
                u.apellido AS pac_apellido
            FROM Pacientes p
            JOIN Usuarios u ON p.id_usuario = u.id_usuario
            WHERE p.id_usuario = $1
            `,
            [user.id_usuario]
        );

        if (!pRes.rows.length) {
            await db.query('ROLLBACK');
            return res
                .status(400)
                .json({ ok: false, message: 'Paciente no encontrado' });
        }

        const patientRow = pRes.rows[0];

        if (!patientRow.id_terapeuta) {
            await db.query('ROLLBACK');
            return res.status(400).json({
                ok: false,
                message: 'Paciente sin terapeuta asignado'
            });
        }

        const tRes = await db.query(
            `
            SELECT 
                t.id_terapeuta,
                u.id_usuario AS id_usuario_terapeuta,
                u.nombre AS ter_nombre,
                u.apellido AS ter_apellido
            FROM Terapeutas t
            JOIN Usuarios u ON t.id_usuario = u.id_usuario
            WHERE t.id_terapeuta = $1
            `,
            [patientRow.id_terapeuta]
        );

        if (!tRes.rows.length) {
            await db.query('ROLLBACK');
            return res.status(400).json({
                ok: false,
                message: 'Terapeuta asignado no encontrado'
            });
        }

        const therapistRow = tRes.rows[0];

        const now = new Date();
        // Virtual: ahora mismo + 5min; Presencial: +30 min
        const startDateTime =
            modalidad === 'Virtual'
                ? new Date(now.getTime() + 5 * 60 * 1000)
                : new Date(now.getTime() + 30 * 60 * 1000);

        const endDateTime = new Date(
            startDateTime.getTime() + crisisDurationMinutes * 60 * 1000
        );

        // 2) Registrar checkin extremo
        await db.query(
            `
            INSERT INTO checkins_emocionales
                (id_paciente, fecha_hora, valencia, horas_sueno, emocion_principal, notas)
            VALUES
                ($1, NOW(), 1, 0, 'Pánico / SOS', 'Botón SOS activado por el paciente.')
            `,
            [patientRow.id_paciente]
        );

        // 3) Crear incidencia clínica crítica
        await db.query(
            `
            INSERT INTO incidencias_clinicas
                (id_paciente, reporte_inicial, nivel_gravedad, estado, fecha_creacion)
            VALUES
                ($1, $2, 'CRITICA', 'ABIERTO', NOW())
            `,
            [
                patientRow.id_paciente,
                'Botón SOS activado desde el panel de monitoreo. Atender caso con máxima prioridad.'
            ]
        );

        // 4) Detectar citas cruzadas del terapeuta en la franja de crisis
        const overlapRes = await db.query(
            `
            SELECT 
                c.id_cita,
                c.id_paciente,
                c.fecha_hora_inicio,
                c.fecha_hora_fin,
                c.modalidad,
                p.id_paciente AS paciente_afectado,
                up.id_usuario AS id_usuario_paciente_afectado,
                up.nombre AS pac_afectado_nombre,
                up.apellido AS pac_afectado_apellido
            FROM Citas c
            JOIN Pacientes p ON c.id_paciente = p.id_paciente
            JOIN Usuarios up ON p.id_usuario = up.id_usuario
            WHERE c.id_terapeuta = $1
              AND c.estado = 'Programada'
              AND tsrange(c.fecha_hora_inicio, c.fecha_hora_fin) && tsrange($2, $3)
            `,
            [therapistRow.id_terapeuta, startDateTime, endDateTime]
        );

        // Helper para buscar un nuevo slot para reprogramar
        async function buscarNuevoSlotMismoDia(duracionMs) {
            // Buscamos a partir del final de la crisis, en bloques de 30min, hasta +4h
            let candidateStart = new Date(endDateTime.getTime() + 30 * 60 * 1000);
            const limit = new Date(
                endDateTime.getTime() + 4 * 60 * 60 * 1000
            ); // +4h

            while (candidateStart < limit) {
                const candidateEnd = new Date(
                    candidateStart.getTime() + duracionMs
                );
                const conflict = await db.query(
                    `
                    SELECT 1 
                    FROM Citas 
                    WHERE id_terapeuta = $1
                      AND estado = 'Programada'
                      AND tsrange(fecha_hora_inicio, fecha_hora_fin) && tsrange($2, $3)
                    LIMIT 1
                    `,
                    [therapistRow.id_terapeuta, candidateStart, candidateEnd]
                );

                if (conflict.rows.length === 0) {
                    return { start: candidateStart, end: candidateEnd };
                }

                candidateStart = new Date(
                    candidateStart.getTime() + 30 * 60 * 1000
                );
            }

            return null;
        }

        // 5) Cancelar/reprogramar citas cruzadas y avisar por chat
        for (const cita of overlapRes.rows) {
            const originalStart = new Date(cita.fecha_hora_inicio);
            const originalEnd = new Date(cita.fecha_hora_fin);
            const durMs = originalEnd.getTime() - originalStart.getTime();

            const nuevoSlot = await buscarNuevoSlotMismoDia(durMs);

            let mensajeChat;
            let detalleReprog = '';

            if (nuevoSlot) {
                // Marcamos la cita original como cancelada por crisis
                await db.query(
                    `
                    UPDATE Citas
                    SET estado = 'Cancelada',
                        notas_admin = COALESCE(notas_admin, '') 
                            || ' [Reprogramada automáticamente por atención de crisis]'
                    WHERE id_cita = $1
                    `,
                    [cita.id_cita]
                );

                // Creamos nueva cita reprogramada
                const insertReprog = await db.query(
                    `
                    INSERT INTO Citas (
                        id_paciente, id_terapeuta,
                        fecha_hora_inicio, fecha_hora_fin,
                        modalidad, estado, enlace_reunion, notas_admin, fecha_creacion
                    )
                    VALUES ($1, $2, $3, $4, $5, 'Programada', $6, $7, NOW())
                    RETURNING id_cita
                    `,
                    [
                        cita.id_paciente,
                        therapistRow.id_terapeuta,
                        nuevoSlot.start,
                        nuevoSlot.end,
                        cita.modalidad,
                        cita.modalidad === 'Virtual'
                            ? `https://meet.jit.si/MindCare-${crypto
                                  .randomBytes(4)
                                  .toString('hex')}`
                            : null,
                        '[REPROGRAMADA] Cita movida automáticamente por prioridad de emergencia.'
                    ]
                );

                const nuevaFechaTexto = nuevoSlot.start.toLocaleString('es-BO', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                });

                // Si algún día quieres usar el id de la nueva cita:
                // const nuevaCitaId = insertReprog.rows[0].id_cita;

                detalleReprog = `Tu cita ha sido movida a ${nuevaFechaTexto}.`;
                mensajeChat =
                    `Hola, ${cita.pac_afectado_nombre}. ` +
                    `Por una atención de emergencia, tu cita programada se ha reprogramado automáticamente. ` +
                    `${detalleReprog} Gracias por tu comprensión.`;
            } else {
                // No se encontró slot cercano -> solo cancelamos y avisamos
                await db.query(
                    `
                    UPDATE Citas
                    SET estado = 'Cancelada',
                        notas_admin = COALESCE(notas_admin, '') 
                            || ' [Cancelada automáticamente por atención de crisis. Reprogramar manualmente.]'
                    WHERE id_cita = $1
                    `,
                    [cita.id_cita]
                );

                mensajeChat =
                    `Hola, ${cita.pac_afectado_nombre}. ` +
                    'Por una atención de emergencia, tu cita programada ha sido cancelada. ' +
                    'Tu terapeuta se pondrá en contacto contigo para reprogramar una nueva fecha. ' +
                    'Gracias por tu comprensión.';
            }

            // Enviar mensaje por el chat seguro
            await db.query(
                `
                INSERT INTO Mensajes_Seguros
                    (id_remitente, id_destinatario, contenido, fecha_envio, leido)
                VALUES
                    ($1, $2, $3, NOW(), false)
                `,
                [
                    therapistRow.id_usuario_terapeuta,
                    cita.id_usuario_paciente_afectado,
                    mensajeChat
                ]
            );
        }

        // 6) Crear la cita de crisis con prioridad
        let crisisLink = null;
        if (modalidad === 'Virtual') {
            const code = crypto.randomBytes(4).toString('hex');
            crisisLink = `https://meet.jit.si/MindCare-CRISIS-${code}`;
        }

        const crisisInsert = await db.query(
            `
            INSERT INTO Citas (
                id_paciente, id_terapeuta,
                fecha_hora_inicio, fecha_hora_fin,
                modalidad, estado, enlace_reunion, notas_admin, fecha_creacion
            )
            VALUES ($1, $2, $3, $4, $5, 'Programada', $6, $7, NOW())
            RETURNING id_cita
            `,
            [
                patientRow.id_paciente,
                therapistRow.id_terapeuta,
                startDateTime,
                endDateTime,
                modalidad,
                crisisLink,
                '[CRISIS] Cita generada automáticamente por botón de pánico.'
            ]
        );

        const crisisId = crisisInsert.rows[0].id_cita;

        // 7) Notificaciones básicas
        await db.query(
            `
            INSERT INTO Notificaciones (id_usuario, tipo, mensaje, enlace_accion, fecha_creacion, leido)
            VALUES 
                ($1, 'cita_crisis', '⚠️ Nueva cita de crisis activada', '/dashboard/appointments', NOW(), false),
                ($2, 'cita_crisis', '⚠️ Tu cita de emergencia ha sido agendada', '/dashboard/monitoring', NOW(), false)
            `,
            [therapistRow.id_usuario_terapeuta, patientRow.id_usuario_paciente]
        );

        await db.query('COMMIT');

        return res.json({
            ok: true,
            cita: {
                id_cita: crisisId,
                modalidad,
                inicio: startDateTime,
                fin: endDateTime,
                enlace: crisisLink
            }
        });
    } catch (error) {
        console.error('Error en triggerPanic:', error);
        try {
            await db.query('ROLLBACK');
        } catch (e) {
            // ignore
        }
        return res
            .status(500)
            .json({ ok: false, message: 'Error interno en botón de pánico.' });
    }
};

module.exports = {
    getMonitoringView,
    createCheckin,
    triggerPanic
};

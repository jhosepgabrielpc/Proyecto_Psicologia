// controllers/appointmentController.js
const db = require('../config/database');
const crypto = require('crypto');

// ====================================================================
// 1. VISTA PRINCIPAL (DASHBOARD) - CON FILTROS DE SEGURIDAD 🔒
// ====================================================================
const getAppointmentsDashboard = async (req, res) => {
    const userId = req.session.user.id_usuario;
    const role = req.session.user.nombre_rol;

    // Para mostrar mensajes tipo ?msg=success_created / error_overlap, etc.
    const msg = req.query.msg || null;

    try {
        let patientsQuery = `
            SELECT p.id_paciente, u.nombre, u.apellido 
            FROM Pacientes p 
            JOIN Usuarios u ON p.id_usuario = u.id_usuario 
            WHERE u.estado = true
        `;
        let patientsParams = [];

        let statsQuery = '';
        let todayQuery = `
            SELECT c.*, 
                   up.nombre as pac_nombre, up.apellido as pac_apellido,
                   ut.nombre as doc_nombre, ut.apellido as doc_apellido
            FROM Citas c
            JOIN Pacientes p ON c.id_paciente = p.id_paciente
            JOIN Usuarios up ON p.id_usuario = up.id_usuario
            JOIN Terapeutas t ON c.id_terapeuta = t.id_terapeuta
            JOIN Usuarios ut ON t.id_usuario = ut.id_usuario
            WHERE c.fecha_hora_inicio::date = CURRENT_DATE 
              AND c.estado = 'Programada'
        `;
        let queryParams = [];

        // --- APLICAR FILTROS SEGÚN ROL ---
        if (role === 'Paciente') {
            // 1. Lista de pacientes: Solo él mismo
            patientsQuery += ' AND p.id_usuario = $1';
            patientsParams = [userId];

            // 2. KPIs: Solo sus citas
            statsQuery = `
                SELECT 
                    (SELECT COUNT(*) 
                     FROM Citas c 
                     JOIN Pacientes p ON c.id_paciente = p.id_paciente 
                     WHERE p.id_usuario = $1 
                       AND c.estado = 'Programada' 
                       AND c.fecha_hora_inicio >= NOW()) as citas_futuras,
                    (SELECT COUNT(*) 
                     FROM Citas c 
                     JOIN Pacientes p ON c.id_paciente = p.id_paciente 
                     WHERE p.id_usuario = $1 
                       AND c.estado = 'Completada' 
                       AND c.fecha_hora_inicio >= DATE_TRUNC('month', NOW())) as completadas_mes
            `;

            // 3. Agenda Hoy: Solo sus citas
            todayQuery += ' AND p.id_usuario = $1';
            queryParams = [userId];

        } else if (role === 'Terapeuta') {
            // 1. Lista de pacientes: todos (para poder agendar libremente)

            // 2. KPIs: Solo sus citas como terapeuta
            statsQuery = `
                SELECT 
                    (SELECT COUNT(*) 
                     FROM Citas c 
                     JOIN Terapeutas t ON c.id_terapeuta = t.id_terapeuta 
                     WHERE t.id_usuario = $1 
                       AND c.estado = 'Programada' 
                       AND c.fecha_hora_inicio >= NOW()) as citas_futuras,
                    (SELECT COUNT(*) 
                     FROM Citas c 
                     JOIN Terapeutas t ON c.id_terapeuta = t.id_terapeuta 
                     WHERE t.id_usuario = $1 
                       AND c.estado = 'Completada' 
                       AND c.fecha_hora_inicio >= DATE_TRUNC('month', NOW())) as completadas_mes
            `;

            // 3. Agenda Hoy: Solo sus citas
            todayQuery += ' AND t.id_usuario = $1';
            queryParams = [userId];

        } else {
            // ADMIN: ven todo
            statsQuery = `
                SELECT 
                    (SELECT COUNT(*) 
                     FROM Citas 
                     WHERE estado = 'Programada' 
                       AND fecha_hora_inicio >= NOW()) as citas_futuras,
                    (SELECT COUNT(*) 
                     FROM Citas 
                     WHERE estado = 'Completada' 
                       AND fecha_hora_inicio >= DATE_TRUNC('month', NOW())) as completadas_mes
            `;
            // todayQuery ya ve todas las citas de hoy
        }

        // --- EJECUCIÓN DE CONSULTAS ---

        // A. Listas para Selectores
        const patientsRes = await db.query(
            patientsQuery + ' ORDER BY u.apellido',
            patientsParams
        );

        const therapistsRes = await db.query(`
            SELECT t.id_terapeuta, u.nombre, u.apellido, t.especialidad 
            FROM Terapeutas t 
            JOIN Usuarios u ON t.id_usuario = u.id_usuario 
            WHERE u.estado = true 
            ORDER BY u.apellido
        `);

        // B. KPIs
        const statsRes = await db.query(
            statsQuery,
            (role === 'Paciente' || role === 'Terapeuta') ? [userId] : []
        );

        // C. Agenda de Hoy
        todayQuery += ' ORDER BY c.fecha_hora_inicio ASC';
        const todayRes = await db.query(todayQuery, queryParams);

        // D. Solicitudes (solo Admin — antes GestorCitas/Admin)
        let requestsRes = { rows: [] };
        if (role === 'Admin') {
            requestsRes = await db.query(
                `
                SELECT m.id_mensaje, m.contenido, m.fecha_envio, u.nombre as remitente
                FROM Mensajes_Seguros m
                JOIN Usuarios u ON m.id_remitente = u.id_usuario
                WHERE m.id_destinatario = $1 
                  AND m.contenido LIKE '%SOLICITUD%'
                  AND m.leido = false
                ORDER BY m.fecha_envio DESC
                `,
                [userId]
            );
        }

        res.render('dashboard/appointments', {
            title: 'Gestión de Citas',
            user: req.session.user,
            patients: patientsRes.rows,
            therapists: therapistsRes.rows,
            stats: statsRes.rows[0] || { citas_futuras: 0, completadas_mes: 0 },
            todayAppointments: todayRes.rows,
            pendingRequests: requestsRes.rows,
            msg
        });

    } catch (error) {
        console.error('Error dashboard citas:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Fallo en sistema de citas',
            error,
            user: req.session.user
        });
    }
};

// ====================================================================
// 2. API CALENDARIO (FILTRADA POR SEGURIDAD) 🎨
// ====================================================================
const getCalendarEvents = async (req, res) => {
    const userId = req.session.user.id_usuario;
    const role = req.session.user.nombre_rol;

    try {
        let query = `
            SELECT c.id_cita, c.fecha_hora_inicio, c.fecha_hora_fin, c.estado, c.modalidad,
                   up.nombre || ' ' || up.apellido as paciente_nombre,
                   ut.nombre || ' ' || ut.apellido as terapeuta_nombre,
                   c.enlace_reunion, c.notas_admin
            FROM Citas c
            JOIN Pacientes p ON c.id_paciente = p.id_paciente
            JOIN Usuarios up ON p.id_usuario = up.id_usuario
            JOIN Terapeutas t ON c.id_terapeuta = t.id_terapeuta
            JOIN Usuarios ut ON t.id_usuario = ut.id_usuario
            WHERE c.estado != 'Cancelada'
        `;

        const params = [];

        // FILTRADO ESTRICTO
        if (role === 'Terapeuta') {
            query += ' AND t.id_usuario = $1';
            params.push(userId);
        } else if (role === 'Paciente') {
            query += ' AND p.id_usuario = $1';
            params.push(userId);
        }

        const result = await db.query(query, params);

        const events = result.rows.map(cita => {
            const esCrisis = cita.notas_admin && cita.notas_admin.includes('[CRISIS]');

            let backgroundColor;
            if (esCrisis) {
                backgroundColor = '#dc2626'; // rojo para crisis
            } else if (cita.estado === 'Completada') {
                backgroundColor = '#94a3b8'; // gris para completadas
            } else {
                backgroundColor = (cita.modalidad === 'Virtual' ? '#6366f1' : '#10b981');
            }

            return {
                id: cita.id_cita,
                title: role === 'Paciente'
                    ? `Dr(a). ${cita.terapeuta_nombre}`
                    : `${cita.paciente_nombre}`,
                start: cita.fecha_hora_inicio,
                end: cita.fecha_hora_fin,
                backgroundColor,
                borderColor: 'transparent',
                extendedProps: {
                    doctor: cita.terapeuta_nombre,
                    patient: cita.paciente_nombre,
                    status: cita.estado,
                    modality: cita.modalidad,
                    link: cita.enlace_reunion,
                    notes: cita.notas_admin || '',
                    esCrisis
                }
            };
        });

        res.json(events);
    } catch (error) {
        console.error('Error API Calendario:', error);
        res.status(500).json([]);
    }
};

// ====================================================================
// 3. CREAR CITA (con transacción real) 🧱
// ====================================================================
const createAppointment = async (req, res) => {
    const { id_paciente, id_terapeuta, fecha, hora, duracion, modalidad, notas } = req.body;
    const role = req.session.user.nombre_rol;
    const userId = req.session.user.id_usuario;

    const client = await db.pool.connect();

    try {
        await client.query('BEGIN');

        let pacienteIdFinal = id_paciente;

        // Si el que crea es Paciente, forzamos su propio id_paciente
        if (role === 'Paciente') {
            const pRes = await client.query(
                'SELECT id_paciente FROM Pacientes WHERE id_usuario = $1',
                [userId]
            );
            if (!pRes.rows.length) {
                await client.query('ROLLBACK');
                return res.redirect('/dashboard/appointments?msg=error_paciente');
            }
            pacienteIdFinal = pRes.rows[0].id_paciente.toString();
        }

        const durationMinutes = parseInt(duracion, 10);
        if (!fecha || !hora || Number.isNaN(durationMinutes) || !id_terapeuta || !pacienteIdFinal) {
            await client.query('ROLLBACK');
            return res.redirect('/dashboard/appointments?msg=error_data');
        }

        const startDateTime = new Date(`${fecha}T${hora}:00`);
        const endDateTime = new Date(startDateTime.getTime() + durationMinutes * 60000);

        // Validación fecha pasada (doble validación: front + back)
        const now = new Date();
        if (startDateTime.getTime() < now.getTime()) {
            await client.query('ROLLBACK');
            return res.redirect('/dashboard/appointments?msg=error_past');
        }

        // Validación de superposición (terapeuta ocupado)
        const overlapCheck = await client.query(
            `
            SELECT id_cita 
            FROM Citas 
            WHERE id_terapeuta = $1 
              AND estado = 'Programada'
              AND tsrange(fecha_hora_inicio, fecha_hora_fin) && tsrange($2, $3)
            `,
            [id_terapeuta, startDateTime, endDateTime]
        );

        if (overlapCheck.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.redirect('/dashboard/appointments?msg=error_overlap');
        }

        // Enlace virtual si aplica
        let meetingLink = null;
        if (modalidad === 'Virtual') {
            const code = crypto.randomBytes(4).toString('hex');
            meetingLink = `https://meet.jit.si/MindCare-${code}`;
        }

        const insertQuery = `
            INSERT INTO Citas (
                id_paciente, id_terapeuta, 
                fecha_hora_inicio, fecha_hora_fin, 
                modalidad, estado, enlace_reunion, notas_admin, fecha_creacion
            )
            VALUES ($1, $2, $3, $4, $5, 'Programada', $6, $7, NOW())
        `;

        await client.query(insertQuery, [
            pacienteIdFinal,
            id_terapeuta,
            startDateTime,
            endDateTime,
            modalidad,
            meetingLink,
            notas
        ]);

        // Notificaciones
        const tInfo = await client.query(
            'SELECT id_usuario FROM Terapeutas WHERE id_terapeuta = $1',
            [id_terapeuta]
        );
        const pInfo = await client.query(
            'SELECT id_usuario FROM Pacientes WHERE id_paciente = $1',
            [pacienteIdFinal]
        );

        if (tInfo.rows.length > 0) {
            await client.query(
                `
                INSERT INTO Notificaciones (id_usuario, tipo, mensaje, enlace_accion, fecha_creacion, leido) 
                VALUES ($1, 'cita_nueva', '📅 Nueva Cita Agendada', '/dashboard/clinical', NOW(), false)
                `,
                [tInfo.rows[0].id_usuario]
            );
        }
        if (pInfo.rows.length > 0) {
            await client.query(
                `
                INSERT INTO Notificaciones (id_usuario, tipo, mensaje, enlace_accion, fecha_creacion, leido) 
                VALUES ($1, 'cita_confirmada', '✅ Cita Confirmada', '/dashboard/patient', NOW(), false)
                `,
                [pInfo.rows[0].id_usuario]
            );
        }

        await client.query('COMMIT');
        res.redirect('/dashboard/appointments?msg=success_created');
    } catch (error) {
        try {
            await client.query('ROLLBACK');
        } catch (_) {
            // ignore rollback error
        }
        console.error('Error creando cita:', error);
        res.redirect('/dashboard/appointments?msg=error_server');
    } finally {
        client.release();
    }
};

// ====================================================================
// 4. CANCELAR CITA (con control de permisos) 🛡️
// ====================================================================
const cancelAppointment = async (req, res) => {
    const { id_cita, motivo } = req.body;
    const userId = req.session.user.id_usuario;
    const role = req.session.user.nombre_rol;

    const client = await db.pool.connect();

    try {
        await client.query('BEGIN');

        const citaRes = await client.query(
            `
            SELECT c.*, t.id_usuario as t_user, p.id_usuario as p_user 
            FROM Citas c
            JOIN Terapeutas t ON c.id_terapeuta = t.id_terapeuta
            JOIN Pacientes p ON c.id_paciente = p.id_paciente
            WHERE c.id_cita = $1
            `,
            [id_cita]
        );

        if (citaRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.redirect('/dashboard/appointments?msg=error');
        }

        const cita = citaRes.rows[0];

        // Permisos:
        const isAdmin = role === 'Admin';
        const isTherapistOwner = role === 'Terapeuta' && cita.t_user === userId;
        const isPatientOwner = role === 'Paciente' && cita.p_user === userId;

        if (!isAdmin && !isTherapistOwner && !isPatientOwner) {
            await client.query('ROLLBACK');
            return res.redirect('/dashboard/appointments?msg=error_forbidden');
        }

        await client.query(
            `
            UPDATE Citas 
            SET estado = 'Cancelada', 
                notas_admin = COALESCE(notas_admin, '') || ' [Cancelada: ' || $1::text || ']' 
            WHERE id_cita = $2
            `,
            [motivo, id_cita]
        );

        // Notificación a terapeuta
        await client.query(
            `
            INSERT INTO Notificaciones (id_usuario, tipo, mensaje, enlace_accion, fecha_creacion, leido) 
            VALUES ($1, 'cita_cancelada', '⛔ Cita Cancelada: ' || $2, '#', NOW(), false)
            `,
            [cita.t_user, motivo]
        );

        // Notificación a paciente
        await client.query(
            `
            INSERT INTO Notificaciones (id_usuario, tipo, mensaje, enlace_accion, fecha_creacion, leido) 
            VALUES ($1, 'cita_cancelada', '⛔ Cita Cancelada: ' || $2, '#', NOW(), false)
            `,
            [cita.p_user, motivo]
        );

        await client.query('COMMIT');
        res.redirect('/dashboard/appointments?msg=success_cancelled');
    } catch (error) {
        try {
            await client.query('ROLLBACK');
        } catch (_) {
            // ignore
        }
        console.error('Error cancelando:', error);
        res.redirect('/dashboard/appointments?msg=error');
    } finally {
        client.release();
    }
};

// ====================================================================
// 5. GUARDAR NOTA CLÍNICA DE SESIÓN 🧠
// ====================================================================
const saveSessionNotes = async (req, res) => {
    const {
        id_cita,
        motivo_sesion,
        resumen_sesion,
        intervenciones,
        nivel_riesgo,
        acuerdos,
        plan_proxima
    } = req.body;

    if (!id_cita) {
        return res.redirect('/dashboard/appointments?msg=error_notes');
    }

    try {
        // intervenciones puede venir como string o array
        let intervencionesTexto = '';
        if (Array.isArray(intervenciones)) {
            intervencionesTexto = intervenciones.join(', ');
        } else if (typeof intervenciones === 'string') {
            intervencionesTexto = intervenciones;
        }

        const bloques = [
            motivo_sesion ? `Motivo principal: ${motivo_sesion}` : null,
            resumen_sesion ? `Resumen clínico: ${resumen_sesion}` : null,
            intervencionesTexto ? `Intervenciones realizadas: ${intervencionesTexto}` : null,
            nivel_riesgo ? `Nivel de riesgo clínico: ${nivel_riesgo}` : null,
            acuerdos ? `Acuerdos y tareas: ${acuerdos}` : null,
            plan_proxima ? `Plan para próxima sesión: ${plan_proxima}` : null
        ].filter(Boolean);

        const cuerpoNota = bloques.join('\n');

        await db.query(
            `
            UPDATE Citas
            SET notas_admin = COALESCE(notas_admin, '') 
                || E'\n\n--- Nota de sesión (' 
                || TO_CHAR(NOW(), 'DD/MM/YYYY HH24:MI') 
                || E') ---\n' 
                || $2,
                estado = CASE 
                            WHEN estado = 'Programada' THEN 'Completada' 
                            ELSE estado 
                         END
            WHERE id_cita = $1
            `,
            [id_cita, cuerpoNota]
        );

        return res.redirect('/dashboard/appointments?msg=success_notes');
    } catch (error) {
        console.error('Error guardando nota de sesión:', error);
        return res.redirect('/dashboard/appointments?msg=error_notes');
    }
};

module.exports = {
    getAppointmentsDashboard,
    getCalendarEvents,
    createAppointment,
    cancelAppointment,
    saveSessionNotes
};

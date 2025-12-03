const db = require('../config/database');
const crypto = require('crypto');

// ====================================================================
// 1. DASHBOARD DE MONITOREO (CORE DEL SISTEMA)
// ====================================================================
const getMonitoringDashboard = async (req, res) => {
    const userId = req.session.user.id_usuario;
    const role = req.session.user.nombre_rol;
    
    // Filtros (Solo usados por profesionales)
    const targetQueryId = req.query.patient ? req.query.patient : null;
    const daysFilter = req.query.days ? parseInt(req.query.days) : 7;

    try {
        let patientIdToFetch = null;
        let patientsList = [];
        let jimmyId = null; 
        
        let kpis = { total: 0, criticos: 0, sueno_bajo: 0, estables: 0 };

        // 1. Buscar a Jimmy (Gestor Crisis) para el botón de pánico
        const jimmyRes = await db.query("SELECT id_usuario FROM Usuarios u JOIN Roles r ON u.id_rol = r.id_rol WHERE r.nombre_rol = 'GestorComunicacion' LIMIT 1");
        if (jimmyRes.rows.length > 0) jimmyId = jimmyRes.rows[0].id_usuario;

        // =========================================================
        // 2. LÓGICA DE SEGURIDAD AUTOMÁTICA Y ROLES
        // =========================================================
        if (role === 'Paciente') {
            // A. El paciente SIEMPRE ve sus propios datos. Ignoramos la URL.
            const pRes = await db.query('SELECT id_paciente FROM Pacientes WHERE id_usuario = $1', [userId]);
            
            if (pRes.rows.length > 0) {
                patientIdToFetch = pRes.rows[0].id_paciente;
            } else {
                return res.render('error', { 
                    title: 'Perfil Incompleto', 
                    message: 'Tu usuario no tiene un historial clínico asociado.',
                    user: req.session.user 
                });
            }
        } 
        else {
            // Lógica para Terapeutas/Admin (Ver otros pacientes)
            if (targetQueryId) patientIdToFetch = targetQueryId;

            // Lista lateral de pacientes
            let queryBase = `
                SELECT p.id_paciente, u.nombre, u.apellido, u.email, u.foto_perfil,
                       (SELECT valencia FROM checkins_emocionales WHERE id_paciente = p.id_paciente ORDER BY fecha_hora DESC LIMIT 1) as ultima_valencia,
                       (SELECT fecha_hora FROM checkins_emocionales WHERE id_paciente = p.id_paciente ORDER BY fecha_hora DESC LIMIT 1) as ultimo_checkin
                FROM Pacientes p
                JOIN Usuarios u ON p.id_usuario = u.id_usuario
            `;
            
            let params = [];
            if (role === 'Terapeuta') {
                const tRes = await db.query('SELECT id_terapeuta FROM Terapeutas WHERE id_usuario = $1', [userId]);
                if (tRes.rows.length > 0) {
                    queryBase += ` WHERE p.id_terapeuta = $1`;
                    params = [tRes.rows[0].id_terapeuta];
                }
            }
            queryBase += ` ORDER BY ultimo_checkin DESC NULLS LAST`;
            const listRes = await db.query(queryBase, params);
            patientsList = listRes.rows;
            
            // KPIs
            kpis.total = patientsList.length;
            patientsList.forEach(p => {
                if (p.ultima_valencia && p.ultima_valencia <= 2) kpis.criticos++;
            });
        }

        // =========================================================
        // 3. OBTENER DATOS (GRÁFICAS Y EVOLUCIÓN)
        // =========================================================
        let checkins = [];
        let testResults = [];
        let patientData = null;

        if (patientIdToFetch) {
            // A. Historial de Check-ins (Limitado por días)
            const checkinsRes = await db.query(`SELECT * FROM checkins_emocionales WHERE id_paciente = $1 ORDER BY fecha_hora DESC LIMIT $2`, [patientIdToFetch, daysFilter]);
            checkins = checkinsRes.rows;

            // B. Últimos Tests (CORRECCIÓN: Usamos Resultados_Tests)
            // Hacemos alias (AS) para que la vista siga funcionando sin cambios
            const testsRes = await db.query(`
                SELECT id_resultado, puntaje_total, nivel_severidad as interpretacion_automatica, 
                       fecha_realizacion as fecha_completacion, tipo_test as nombre_escala
                FROM Resultados_Tests 
                WHERE id_paciente = $1 
                ORDER BY fecha_realizacion DESC LIMIT 5`, 
                [patientIdToFetch]
            );
            testResults = testsRes.rows;

            // C. Datos Personales
            const infoRes = await db.query(`SELECT u.nombre, u.apellido, u.foto_perfil, u.email, p.id_paciente FROM Pacientes p JOIN Usuarios u ON p.id_usuario = u.id_usuario WHERE p.id_paciente = $1`, [patientIdToFetch]);
            if(infoRes.rows.length > 0) patientData = infoRes.rows[0];
        }

        res.render('dashboard/monitoring', {
            title: 'Centro de Monitoreo',
            user: req.session.user,
            checkins: checkins,
            tests: testResults,
            viewingPatient: patientData,
            patientsList: patientsList,
            currentFilter: daysFilter,
            kpis: kpis,
            jimmyId: jimmyId
        });

    } catch (error) {
        console.error('Error Dashboard Monitor:', error);
        res.status(500).render('error', { title: 'Error', message: 'Error interno de monitoreo', error: error, user: req.session.user });
    }
};

// ====================================================================
// 2. GUARDAR CHECK-IN (AUTOMATIZACIÓN TOTAL)
// ====================================================================
const saveCheckin = async (req, res) => {
    const userId = req.session.user.id_usuario;
    const { valencia, activacion, emocion, notas, horas_sueno } = req.body;

    if (!valencia || !emocion) return res.redirect('/dashboard/monitoring?msg=error_missing_fields');

    try {
        await db.query('BEGIN');

        // 1. Obtener datos clave del paciente y su equipo médico
        const pRes = await db.query(`
            SELECT p.id_paciente, p.id_terapeuta, u.nombre || ' ' || u.apellido as nombre_completo 
            FROM Pacientes p 
            JOIN Usuarios u ON p.id_usuario = u.id_usuario 
            WHERE p.id_usuario = $1`, [userId]);
            
        if (pRes.rows.length === 0) throw new Error('Usuario no registrado como paciente.');
        const { id_paciente, id_terapeuta, nombre_completo } = pRes.rows[0];

        const v = parseInt(valencia);
        const esCritico = v <= 2; // Umbral de crisis
        const sleepVal = horas_sueno ? parseInt(horas_sueno) : 0;

        // 2. Insertar el Check-in (Bitácora del Paciente)
        await db.query(`
            INSERT INTO checkins_emocionales (id_paciente, valencia, activacion, emocion_principal, notas, requiere_atencion, horas_sueno, fecha_hora)
            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
            [id_paciente, v, activacion || 3, emocion, notas, esCritico, sleepVal]
        );

        // 3. CEREBRO AUTÓNOMO: Gestión de Crisis sin intervención humana
        if (esCritico) {
            console.log(`🚨 CRISIS DETECTADA: ${nombre_completo} (Valencia: ${v})`);

            // A. Crear Incidencia Clínica (Estado: AUTOMATICA)
            const reporteAuto = `🚨 ALERTA AUTOMÁTICA\nMotivo: Baja Valencia Emocional (${v}/5) - ${emocion}\nSueño: ${sleepVal}h\nNota del Paciente: "${notas}"\n\nAcción del Sistema: Notificación inmediata enviada a Terapeuta y Gestión de Citas.`;

            await db.query(`
                INSERT INTO incidencias_clinicas (id_paciente, nivel_gravedad, reporte_inicial, estado) 
                VALUES ($1, 'CRITICA', $2, 'AUTOMATICA')`, 
                [id_paciente, reporteAuto]
            );
            
            // B. Notificar al Terapeuta (Prioridad 1)
            if (id_terapeuta) {
                const tUser = await db.query('SELECT id_usuario FROM Terapeutas WHERE id_terapeuta = $1', [id_terapeuta]);
                if(tUser.rows.length > 0) {
                    await db.query(`
                        INSERT INTO Notificaciones (id_usuario, tipo, mensaje, enlace_accion, fecha_creacion) 
                        VALUES ($1, 'alerta_medica', '🚨 ATENCIÓN: ${nombre_completo} reporta crisis emocional (${v}/5). Revisar expediente.', '/reports/patient/${id_paciente}/view', NOW())`, 
                        [tUser.rows[0].id_usuario]
                    );
                }
            }

            // C. Notificar a Alan (Gestor Citas) para priorizar agenda
            const alanRes = await db.query("SELECT u.id_usuario FROM Usuarios u JOIN Roles r ON u.id_rol = r.id_rol WHERE r.nombre_rol = 'GestorCitas' LIMIT 1");
            if (alanRes.rows.length > 0) {
                 await db.query(`
                    INSERT INTO Notificaciones (id_usuario, tipo, mensaje, enlace_accion, fecha_creacion) 
                    VALUES ($1, 'alerta_medica', '📅 URGENTE: ${nombre_completo} requiere cita prioritaria por crisis.', '/dashboard/appointments', NOW())`, 
                    [alanRes.rows[0].id_usuario]
                );
            }
        }

        await db.query('COMMIT');
        
        // Redirección con "Semáforo" (El frontend mostrará el modal según el msg)
        let redirectUrl = '/dashboard/monitoring?msg=checkin_saved';
        if (esCritico) redirectUrl = '/dashboard/monitoring?msg=alert_triggered_automatic';
        
        res.redirect(redirectUrl);

    } catch (error) {
        await db.query('ROLLBACK');
        console.error('Error saving checkin:', error);
        res.redirect('/dashboard/monitoring?msg=error');
    }
};

// ====================================================================
// 3. BOTÓN DE PÁNICO (S.O.S. TOTAL)
// ====================================================================
// ====================================================================
// 3. BOTÓN DE PÁNICO (S.O.S. TOTAL) - VERSIÓN UX COMPLETA
// ====================================================================
const triggerPanic = async (req, res) => {
    const userId = req.session.user.id_usuario;

    try {
        await db.query('BEGIN');

        // 1) Obtener paciente + terapeuta
        const pRes = await db.query(`
            SELECT 
                p.id_paciente, 
                p.id_terapeuta, 
                u.nombre || ' ' || u.apellido AS nombre
            FROM Pacientes p 
            JOIN Usuarios u ON p.id_usuario = u.id_usuario 
            WHERE p.id_usuario = $1
        `, [userId]);

        if (pRes.rows.length === 0) {
            await db.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                message: 'No se encontró tu expediente de paciente.'
            });
        }

        const { id_paciente, id_terapeuta, nombre } = pRes.rows[0];
        const ahora = new Date();

        // 2) Registrar INCIDENCIA CLÍNICA de pánico
        const reportePanico = '🆘 BOTÓN S.O.S. ACTIVADO POR EL PACIENTE (alerta de pánico).';
        await db.query(`
            INSERT INTO incidencias_clinicas (id_paciente, nivel_gravedad, reporte_inicial, estado, fecha_creacion)
            VALUES ($1, 'PÁNICO', $2, 'ESCALADO', NOW())
        `, [id_paciente, reportePanico]);

        // 3) Crear también un CHECK-IN crítico para que aparezca en el radar
        await db.query(`
            INSERT INTO checkins_emocionales (
                id_paciente, valencia, activacion, emocion_principal, 
                notas, requiere_atencion, horas_sueno, fecha_hora
            )
            VALUES ($1, 1, 5, 'Pánico / SOS',
                    '🆘 BOTÓN S.O.S. ACTIVADO POR EL PACIENTE.',
                    true, 0, NOW())
        `, [id_paciente]);

        // 4) Intentar crear CITA DE CRISIS automática (30 min después)
        let crisisCreated = false;

        if (id_terapeuta) {
            const start = new Date(ahora.getTime() + 30 * 60000); // +30 min
            const end = new Date(start.getTime() + 30 * 60000);   // cita de 30 min

            // Comprobar si el terapeuta está libre en ese rango
            const overlapRes = await db.query(`
                SELECT 1 
                FROM Citas 
                WHERE id_terapeuta = $1
                  AND estado = 'Programada'
                  AND tsrange(fecha_hora_inicio, fecha_hora_fin)
                      && tsrange($2, $3)
            `, [id_terapeuta, start, end]);

            if (overlapRes.rows.length === 0) {
                await db.query(`
                    INSERT INTO Citas (
                        id_paciente, id_terapeuta,
                        fecha_hora_inicio, fecha_hora_fin,
                        modalidad, estado, enlace_reunion,
                        notas_admin, fecha_creacion
                    )
                    VALUES (
                        $1, $2, $3, $4,
                        'Virtual', 'Programada', NULL,
                        '[CRISIS] Cita generada automáticamente por alerta de pánico.',
                        NOW()
                    )
                `, [id_paciente, id_terapeuta, start, end]);

                crisisCreated = true;
            }
        }

        // 5) Notificar a Jimmy (Gestor de Comunicación)
        const jimmyRes = await db.query(`
            SELECT u.id_usuario 
            FROM Usuarios u
            JOIN Roles r ON u.id_rol = r.id_rol 
            WHERE r.nombre_rol = 'GestorComunicacion'
            LIMIT 1
        `);

        if (jimmyRes.rows.length > 0) {
            await db.query(`
                INSERT INTO Notificaciones (
                    id_usuario, tipo, mensaje, enlace_accion, fecha_creacion
                )
                VALUES (
                    $1, 'alerta_panico',
                    '🆘 SOS: ${nombre} ACTIVÓ EL BOTÓN DE PÁNICO',
                    '/dashboard/manager', NOW()
                )
            `, [jimmyRes.rows[0].id_usuario]);
        }

        // 6) Notificar a Terapeuta
        if (id_terapeuta) {
            const tUser = await db.query(
                'SELECT id_usuario FROM Terapeutas WHERE id_terapeuta = $1',
                [id_terapeuta]
            );

            if (tUser.rows.length > 0) {
                await db.query(`
                    INSERT INTO Notificaciones (
                        id_usuario, tipo, mensaje, enlace_accion, fecha_creacion
                    )
                    VALUES (
                        $1, 'alerta_panico',
                        '🆘 Tu paciente ${nombre} activó el BOTÓN DE PÁNICO',
                        '/reports/patient/${id_paciente}/view',
                        NOW()
                    )
                `, [tUser.rows[0].id_usuario]);
            }
        }

        await db.query('COMMIT');

        // 7) Respuesta JSON limpia para el front
        return res.json({
            success: true,
            crisisCreated,
            message: crisisCreated
                ? 'Alerta enviada y cita de crisis creada automáticamente.'
                : 'Alerta enviada. Tu terapeuta ha sido notificado.'
        });

    } catch (error) {
        await db.query('ROLLBACK');
        console.error('Error en triggerPanic:', error);
        return res.status(500).json({
            success: false,
            message: 'Error interno al enviar la alerta.'
        });
    }
};



// Mantenemos esta función por compatibilidad, pero ya no es la vía principal
const createIncident = async (req, res) => {
    res.redirect('/dashboard/monitoring');
};

module.exports = {
    getMonitoringDashboard,
    saveCheckin,
    createIncident,
    triggerPanic
};
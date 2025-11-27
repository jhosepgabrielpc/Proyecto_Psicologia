const db = require('../config/database');
const crypto = require('crypto');

// ====================================================================
// 1. DASHBOARD DE GESTIÓN (VISTA PRINCIPAL DE ALAN)
// ====================================================================
const getAppointmentsDashboard = async (req, res) => {
    const userId = req.session.user.id_usuario;

    try {
        // A. Listas para Selectores
        const patientsRes = await db.query("SELECT id_paciente, u.nombre, u.apellido FROM Pacientes p JOIN Usuarios u ON p.id_usuario = u.id_usuario WHERE u.estado = true ORDER BY u.apellido");
        const therapistsRes = await db.query("SELECT id_terapeuta, u.nombre, u.apellido, t.especialidad FROM Terapeutas t JOIN Usuarios u ON t.id_usuario = u.id_usuario WHERE u.estado = true ORDER BY u.apellido");

        // B. KPIs (CORREGIDO: Usamos ::date para incluir todas las citas de hoy sin importar la hora)
        const statsRes = await db.query(`
            SELECT 
                (SELECT COUNT(*) FROM Citas 
                 WHERE estado = 'Programada' 
                 AND fecha_hora_inicio::date >= CURRENT_DATE) as citas_futuras,
                 
                (SELECT COUNT(*) FROM Citas 
                 WHERE estado = 'Completada' 
                 AND fecha_hora_inicio >= DATE_TRUNC('month', NOW())) as completadas_mes,
                 
                (SELECT COUNT(*) FROM Citas 
                 WHERE estado = 'Cancelada' 
                 AND fecha_hora_inicio >= DATE_TRUNC('month', NOW())) as canceladas_mes
        `);

        // C. Citas de Hoy (Agenda del Día)
        const todayRes = await db.query(`
            SELECT c.*, 
                   up.nombre as pac_nombre, up.apellido as pac_apellido,
                   ut.nombre as doc_nombre, ut.apellido as doc_apellido
            FROM Citas c
            JOIN Pacientes p ON c.id_paciente = p.id_paciente
            JOIN Usuarios up ON p.id_usuario = up.id_usuario
            JOIN Terapeutas t ON c.id_terapeuta = t.id_terapeuta
            JOIN Usuarios ut ON t.id_usuario = ut.id_usuario
            WHERE c.fecha_hora_inicio::date = CURRENT_DATE 
            AND c.estado != 'Cancelada'
            ORDER BY c.fecha_hora_inicio ASC
        `);

        // D. Solicitudes de Jimmy
        const requestsRes = await db.query(`
            SELECT m.id_mensaje, m.contenido, m.fecha_envio, u.nombre as remitente
            FROM Mensajes_Seguros m
            JOIN Usuarios u ON m.id_remitente = u.id_usuario
            WHERE m.id_destinatario = $1 
            AND m.contenido LIKE '%SOLICITUD%'
            AND m.leido = false
            ORDER BY m.fecha_envio DESC
        `, [userId]);

        res.render('dashboard/appointments', {
            title: 'Gestión de Citas',
            user: req.session.user,
            patients: patientsRes.rows,
            therapists: therapistsRes.rows,
            stats: statsRes.rows[0],
            todayAppointments: todayRes.rows,
            pendingRequests: requestsRes.rows
        });

    } catch (error) {
        console.error('Error dashboard citas:', error);
        res.status(500).render('error', { title: 'Error', message: 'Error de sistema', error, user: req.session.user });
    }
};

// ====================================================================
// 2. API CALENDARIO
// ====================================================================
const getCalendarEvents = async (req, res) => {
    const { start, end } = req.query;
    try {
        const result = await db.query(`
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
        `);

        const events = result.rows.map(cita => ({
            id: cita.id_cita,
            title: `${cita.paciente_nombre} (${cita.terapeuta_nombre})`,
            start: cita.fecha_hora_inicio, 
            end: cita.fecha_hora_fin,
            backgroundColor: cita.modalidad === 'Virtual' ? '#6366f1' : '#10b981',
            borderColor: 'transparent',
            extendedProps: {
                doctor: cita.terapeuta_nombre,
                patient: cita.paciente_nombre,
                status: cita.estado,
                modality: cita.modalidad,
                link: cita.enlace_reunion,
                notes: cita.notas_admin
            }
        }));

        res.json(events);
    } catch (error) {
        console.error('Error API:', error);
        res.status(500).json([]);
    }
};

// ====================================================================
// 3. CREAR CITA
// ====================================================================
const createAppointment = async (req, res) => {
    const { id_paciente, id_terapeuta, fecha, hora, duracion, modalidad, notas } = req.body;

    try {
        await db.query('BEGIN');

        // Construimos timestamp explícito
        const startString = `${fecha} ${hora}:00`;

        // Validación de Superposición
        const overlapCheck = await db.query(`
            SELECT id_cita FROM Citas 
            WHERE id_terapeuta = $1 
            AND estado = 'Programada'
            AND tsrange(fecha_hora_inicio, fecha_hora_fin) && tsrange(
                TO_TIMESTAMP($2 || ' ' || $3, 'YYYY-MM-DD HH24:MI'), 
                (TO_TIMESTAMP($2 || ' ' || $3, 'YYYY-MM-DD HH24:MI') + ($4 || ' minutes')::interval)
            )
        `, [id_terapeuta, fecha, hora, duracion]);

        if (overlapCheck.rows.length > 0) {
            await db.query('ROLLBACK');
            return res.redirect('/dashboard/appointments?msg=error_overlap');
        }

        // Link Jitsi
        let meetingLink = null;
        if (modalidad === 'Virtual') {
            const code = crypto.randomBytes(4).toString('hex');
            meetingLink = `https://meet.jit.si/MindCare-${code}`;
        }

        // Insertar
        const insertQuery = `
            INSERT INTO Citas (
                id_paciente, id_terapeuta, 
                fecha_hora_inicio, 
                fecha_hora_fin, 
                modalidad, enlace_reunion, notas_admin, estado, fecha_creacion
            )
            VALUES (
                $1, $2, 
                TO_TIMESTAMP($3 || ' ' || $4, 'YYYY-MM-DD HH24:MI'), 
                (TO_TIMESTAMP($3 || ' ' || $4, 'YYYY-MM-DD HH24:MI') + ($5 || ' minutes')::interval), 
                $6, $7, $8, 'Programada', NOW()
            )
            RETURNING id_cita
        `;

        const insertRes = await db.query(insertQuery, [id_paciente, id_terapeuta, fecha, hora, duracion, modalidad, meetingLink, notas]);
        const newCitaId = insertRes.rows[0].id_cita;

        // Notificaciones
        const tInfo = await db.query('SELECT id_usuario FROM Terapeutas WHERE id_terapeuta = $1', [id_terapeuta]);
        const pInfo = await db.query('SELECT id_usuario FROM Pacientes WHERE id_paciente = $1', [id_paciente]);

        if(tInfo.rows.length > 0) {
             await db.query(`INSERT INTO Notificaciones (id_usuario, tipo, mensaje, enlace_accion, fecha_creacion, leido) VALUES ($1, 'cita_nueva', '📅 Nueva Cita Agendada', '/dashboard/therapist', NOW(), false)`, [tInfo.rows[0].id_usuario]);
        }
        if(pInfo.rows.length > 0) {
             await db.query(`INSERT INTO Notificaciones (id_usuario, tipo, mensaje, enlace_accion, fecha_creacion, leido) VALUES ($1, 'cita_confirmada', '✅ Cita Confirmada', '/dashboard/patient', NOW(), false)`, [pInfo.rows[0].id_usuario]);
        }

        await db.query('COMMIT');
        res.redirect('/dashboard/appointments?msg=success_created');

    } catch (error) {
        await db.query('ROLLBACK');
        console.error('Error creando cita:', error);
        res.redirect('/dashboard/appointments?msg=error_server');
    }
};

// ====================================================================
// 4. CANCELAR CITA
// ====================================================================
const cancelAppointment = async (req, res) => {
    const { id_cita, motivo } = req.body;
    try {
        await db.query('BEGIN');

        // Obtener datos para notificar
        const citaRes = await db.query(`
            SELECT c.*, t.id_usuario as t_user, p.id_usuario as p_user 
            FROM Citas c
            JOIN Terapeutas t ON c.id_terapeuta = t.id_terapeuta
            JOIN Pacientes p ON c.id_paciente = p.id_paciente
            WHERE id_cita = $1
        `, [id_cita]);

        if(citaRes.rows.length > 0) {
            const cita = citaRes.rows[0];
            
            // Actualizar estado
            await db.query(`UPDATE Citas SET estado = 'Cancelada', notas_admin = notas_admin || ' [Cancelada: ' || $2 || ']' WHERE id_cita = $1`, [id_cita, motivo]);

            // Notificar
            await db.query(`INSERT INTO Notificaciones (id_usuario, tipo, mensaje, enlace_accion, fecha_creacion) VALUES ($1, 'cita_cancelada', '⛔ Cita Cancelada: ' || $2, '#', NOW())`, [cita.t_user, motivo]);
            await db.query(`INSERT INTO Notificaciones (id_usuario, tipo, mensaje, enlace_accion, fecha_creacion) VALUES ($1, 'cita_cancelada', '⛔ Cita Cancelada: ' || $2, '#', NOW())`, [cita.p_user, motivo]);
        }

        await db.query('COMMIT');
        res.redirect('/dashboard/appointments?msg=success_cancelled');
    } catch (error) {
        await db.query('ROLLBACK');
        console.error('Error cancelando:', error);
        res.redirect('/dashboard/appointments?msg=error');
    }
};

module.exports = { getAppointmentsDashboard, getCalendarEvents, createAppointment, cancelAppointment };
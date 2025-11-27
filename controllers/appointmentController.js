const db = require('../config/database');
const crypto = require('crypto');

// ====================================================================
// 1. VISTA PRINCIPAL (DASHBOARD)
// ====================================================================
const getAppointmentsDashboard = async (req, res) => {
    const userId = req.session.user.id_usuario;

    try {
        // A. Listas para el Modal (Pacientes y Terapeutas Activos)
        const patientsRes = await db.query("SELECT id_paciente, u.nombre, u.apellido FROM Pacientes p JOIN Usuarios u ON p.id_usuario = u.id_usuario WHERE u.estado = true ORDER BY u.apellido");
        const therapistsRes = await db.query("SELECT id_terapeuta, u.nombre, u.apellido, t.especialidad FROM Terapeutas t JOIN Usuarios u ON t.id_usuario = u.id_usuario WHERE u.estado = true ORDER BY u.apellido");

        // B. KPIs Rápidos
        const statsRes = await db.query(`
            SELECT 
                (SELECT COUNT(*) FROM Citas WHERE estado = 'Programada' AND fecha_hora_inicio >= NOW()) as citas_futuras,
                (SELECT COUNT(*) FROM Citas WHERE estado = 'Completada' AND fecha_hora_inicio >= DATE_TRUNC('month', NOW())) as completadas_mes,
                (SELECT COUNT(*) FROM Citas WHERE estado = 'Cancelada' AND fecha_hora_inicio >= DATE_TRUNC('month', NOW())) as canceladas_mes
        `);

        // C. Agenda Lateral (Solo citas de HOY)
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
            AND c.estado = 'Programada'
            ORDER BY c.fecha_hora_inicio ASC
        `);

        // D. Solicitudes Pendientes (Mensajería)
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
            stats: statsRes.rows[0] || { citas_futuras: 0, completadas_mes: 0, canceladas_mes: 0 },
            todayAppointments: todayRes.rows,
            pendingRequests: requestsRes.rows
        });

    } catch (error) {
        console.error('Error dashboard citas:', error);
        res.status(500).render('error', { title: 'Error', message: 'Fallo en sistema de citas', error, user: req.session.user });
    }
};

// ====================================================================
// 2. API CALENDARIO (DIBUJA LOS RECUADROS) 🎨
// ====================================================================
const getCalendarEvents = async (req, res) => {
    const userId = req.session.user.id_usuario;
    const role = req.session.user.nombre_rol;

    try {
        // Base de la consulta
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
        
        let params = [];

        // Filtrado por Rol (Seguridad)
        if (role === 'Terapeuta') {
            query += ` AND t.id_usuario = $1`;
            params.push(userId);
        } else if (role === 'Paciente') {
            query += ` AND p.id_usuario = $1`;
            params.push(userId);
        }
        // Gestores ven todo

        const result = await db.query(query, params);

        // Mapeo para FullCalendar
        const events = result.rows.map(cita => ({
            id: cita.id_cita,
            title: role === 'Paciente' ? `Dr. ${cita.terapeuta_nombre}` : `${cita.paciente_nombre}`,
            start: cita.fecha_hora_inicio, 
            end: cita.fecha_hora_fin,
            // Lógica de colores: Virtual (Indigo), Presencial (Verde), Completada (Gris)
            backgroundColor: cita.estado === 'Completada' ? '#94a3b8' : (cita.modalidad === 'Virtual' ? '#6366f1' : '#10b981'),
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
        console.error('Error API Calendario:', error);
        res.status(500).json([]);
    }
};

// ====================================================================
// 3. CREAR CITA (LÓGICA CORREGIDA Y BLINDADA) ✅
// ====================================================================
const createAppointment = async (req, res) => {
    const { id_paciente, id_terapeuta, fecha, hora, duracion, modalidad, notas } = req.body;

    try {
        await db.query('BEGIN');

        // 1. CÁLCULO DE FECHAS EN JS (Más seguro que SQL directo)
        // Formato fecha: YYYY-MM-DD, hora: HH:MM
        const startDateTime = new Date(`${fecha}T${hora}:00`); 
        const durationMinutes = parseInt(duracion);
        const endDateTime = new Date(startDateTime.getTime() + durationMinutes * 60000);

        // 2. VALIDACIÓN DE SUPERPOSICIÓN (Overlap)
        // Usamos tsrange de PostgreSQL para verificar choques de horario exactos
        const overlapCheck = await db.query(`
            SELECT id_cita FROM Citas 
            WHERE id_terapeuta = $1 
            AND estado = 'Programada'
            AND tsrange(fecha_hora_inicio, fecha_hora_fin) && tsrange($2, $3)
        `, [id_terapeuta, startDateTime, endDateTime]);

        if (overlapCheck.rows.length > 0) {
            await db.query('ROLLBACK');
            return res.redirect('/dashboard/appointments?msg=error_overlap');
        }

        // 3. GENERAR ENLACE VIRTUAL (Si aplica)
        let meetingLink = null;
        if (modalidad === 'Virtual') {
            const code = crypto.randomBytes(4).toString('hex');
            meetingLink = `https://meet.jit.si/MindCare-${code}`;
        }

        // 4. INSERTAR CITA
        const insertQuery = `
            INSERT INTO Citas (
                id_paciente, id_terapeuta, 
                fecha_hora_inicio, fecha_hora_fin, 
                modalidad, estado, enlace_reunion, notas_admin, fecha_creacion
            )
            VALUES ($1, $2, $3, $4, $5, 'Programada', $6, $7, NOW())
            RETURNING id_cita
        `;

        const insertRes = await db.query(insertQuery, [
            id_paciente, 
            id_terapeuta, 
            startDateTime, 
            endDateTime, 
            modalidad, 
            meetingLink, 
            notas
        ]);

        // 5. NOTIFICACIONES AUTOMÁTICAS
        const tInfo = await db.query('SELECT id_usuario FROM Terapeutas WHERE id_terapeuta = $1', [id_terapeuta]);
        const pInfo = await db.query('SELECT id_usuario FROM Pacientes WHERE id_paciente = $1', [id_paciente]);

        if(tInfo.rows.length > 0) {
             await db.query(`INSERT INTO Notificaciones (id_usuario, tipo, mensaje, enlace_accion, fecha_creacion, leido) VALUES ($1, 'cita_nueva', '📅 Nueva Cita Agendada', '/dashboard/clinical', NOW(), false)`, [tInfo.rows[0].id_usuario]);
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
// 4. CANCELAR CITA (ELIMINAR DEL CALENDARIO)
// ====================================================================
const cancelAppointment = async (req, res) => {
    const { id_cita, motivo } = req.body;
    try {
        await db.query('BEGIN');

        // Obtener datos para notificar antes de cancelar
        const citaRes = await db.query(`
            SELECT c.*, t.id_usuario as t_user, p.id_usuario as p_user 
            FROM Citas c
            JOIN Terapeutas t ON c.id_terapeuta = t.id_terapeuta
            JOIN Pacientes p ON c.id_paciente = p.id_paciente
            WHERE id_cita = $1
        `, [id_cita]);

        if(citaRes.rows.length > 0) {
            const cita = citaRes.rows[0];
            
            // Actualizar estado a Cancelada (desaparece de la vista por defecto)
            await db.query(`
                UPDATE Citas 
                SET estado = 'Cancelada', 
                    notas_admin = CONCAT(notas_admin, ' [Cancelada: ', $1::text, ']') 
                WHERE id_cita = $2
            `, [motivo, id_cita]);

            // Notificar a ambos
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
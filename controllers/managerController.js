const db = require('../config/database');

// ====================================================================
// DASHBOARD CENTRAL DE GESTIÓN (PARA JIMMY)
// ====================================================================
const getManagerDashboard = async (req, res) => {
    const userId = req.session.user.id_usuario;

    try {
        // 1. KPIs GLOBALES
        // Contamos alertas activas, pacientes totales y mensajes sin leer
        const statsQuery = `
            SELECT 
                (SELECT COUNT(*) FROM Pacientes) as total_pacientes,
                (SELECT COUNT(*) FROM checkins_emocionales WHERE valencia <= 2 AND fecha_hora >= NOW() - INTERVAL '24 HOURS') as crisis_24h,
                (SELECT COUNT(*) FROM Terapeutas) as total_terapeutas,
                (SELECT COUNT(*) FROM Mensajes_Seguros WHERE id_destinatario = $1 AND leido = false) as msgs_pendientes
        `;
        const statsRes = await db.query(statsQuery, [userId]);
        const stats = statsRes.rows[0];

        // 2. FEED DE ALERTAS EN TIEMPO REAL (El núcleo del trabajo de Jimmy)
        // Traemos pacientes que reportaron malestar en las últimas 48 horas
        // Y hacemos JOIN con su Terapeuta para que Jimmy sepa a quién contactar.
        const alertsQuery = `
            SELECT 
                c.id_checkin,
                c.fecha_hora,
                c.valencia,
                c.emocion_principal,
                c.notas,
                c.horas_sueno,
                -- Datos Paciente
                p.id_paciente,
                up.nombre as pac_nombre,
                up.apellido as pac_apellido,
                up.foto_perfil as pac_foto,
                -- Datos Terapeuta Asignado
                t.id_terapeuta,
                ut.id_usuario as id_usuario_terapeuta,
                ut.nombre as doc_nombre,
                ut.apellido as doc_apellido,
                ut.email as doc_email
            FROM checkins_emocionales c
            JOIN Pacientes p ON c.id_paciente = p.id_paciente
            JOIN Usuarios up ON p.id_usuario = up.id_usuario
            LEFT JOIN Terapeutas t ON p.id_terapeuta = t.id_terapeuta
            LEFT JOIN Usuarios ut ON t.id_usuario = ut.id_usuario
            WHERE c.valencia <= 2 
            ORDER BY c.fecha_hora DESC
            LIMIT 20
        `;
        const alertsRes = await db.query(alertsQuery);

        // 3. TERAPEUTAS DISPONIBLES (Para contacto rápido)
        const docsQuery = `
            SELECT u.id_usuario, u.nombre, u.apellido, u.email, u.foto_perfil, t.especialidad,
                   (SELECT COUNT(*) FROM Pacientes WHERE id_terapeuta = t.id_terapeuta) as carga_pacientes
            FROM Terapeutas t
            JOIN Usuarios u ON t.id_usuario = u.id_usuario
            WHERE u.estado = true
            ORDER BY carga_pacientes DESC
        `;
        const docsRes = await db.query(docsQuery);

        // Renderizar la vista maestra
        res.render('dashboard/manager', {
            title: 'Centro de Comando - MindCare',
            user: req.session.user,
            stats: stats,
            alerts: alertsRes.rows,
            doctors: docsRes.rows
        });

    } catch (error) {
        console.error('Error en Manager Dashboard:', error);
        res.status(500).render('error', { 
            title: 'Error de Sistema', 
            message: 'No se pudo cargar el panel de gestión.', 
            error, 
            user: req.session.user 
        });
    }
};

// ====================================================================
// ACCIÓN: MARCAR ALERTA COMO GESTIONADA (Opcional para el futuro)
// ====================================================================
const resolveAlert = async (req, res) => {
    // Aquí podrías lógica para marcar check-ins como "Revisados" en BD
    // Por ahora redirigimos
    res.redirect('/dashboard/manager');
};

module.exports = {
    getManagerDashboard,
    resolveAlert
};
const db = require('../config/database');

// ====================================================================
// 1. DASHBOARD DE JIMMY (Ver alertas de Jhosep)
// ====================================================================
const getManagerDashboard = async (req, res) => {
    const userId = req.session.user.id_usuario;

    try {
        // KPIs
        const statsRes = await db.query(`
            SELECT 
                (SELECT COUNT(*) FROM incidencias_clinicas WHERE estado = 'PENDIENTE') as pendientes,
                (SELECT COUNT(*) FROM incidencias_clinicas WHERE estado = 'ESCALADO') as gestionados,
                (SELECT COUNT(*) FROM Terapeutas) as equipo_medico
        `);
        
        // Bandeja de Entrada (Alertas de Jhosep)
        const inboxQuery = `
            SELECT 
                i.id_incidencia, i.reporte_inicial, i.fecha_creacion,
                p.id_paciente, u.nombre, u.apellido, u.email, u.foto_perfil,
                t.id_usuario as id_terapeuta_user, -- Para contactar al Doctor
                doc.nombre as doc_nombre, doc.apellido as doc_apellido
            FROM incidencias_clinicas i
            JOIN Pacientes p ON i.id_paciente = p.id_paciente
            JOIN Usuarios u ON p.id_usuario = u.id_usuario
            LEFT JOIN Terapeutas t ON p.id_terapeuta = t.id_terapeuta
            LEFT JOIN Usuarios doc ON t.id_usuario = doc.id_usuario
            WHERE i.estado = 'PENDIENTE'
            ORDER BY i.fecha_creacion DESC
        `;
        const inboxRes = await db.query(inboxQuery);

        res.render('dashboard/manager', {
            title: 'Gestión de Crisis',
            user: req.session.user,
            stats: statsRes.rows[0],
            incidents: inboxRes.rows
        });

    } catch (error) {
        console.error(error);
        res.status(500).render('error', { title: 'Error', message: 'Error en panel', error, user: req.session.user });
    }
};

// ====================================================================
// 2. ESCALAR INCIDENCIA (EL FLUJO CORRECTO)
//    JIMMY -> DR (Informe Clínico)
//    JIMMY -> ALAN (Solicitud de Cita)
// ====================================================================
const escalateIncident = async (req, res) => {
    const { id_incidencia, id_terapeuta_user, reporte_paciente, nombre_paciente } = req.body;
    const jimmyId = req.session.user.id_usuario;

    try {
        await db.query('BEGIN');

        // A. BUSCAR A ALAN (Gestor de Citas)
        // Buscamos por rol 'GestorCitas' O por nombre 'Alan'
        const alanRes = await db.query(`
            SELECT u.id_usuario FROM Usuarios u 
            JOIN Roles r ON u.id_rol = r.id_rol 
            WHERE r.nombre_rol = 'GestorCitas' OR u.nombre ILIKE '%Alan%' 
            LIMIT 1
        `);
        const alanId = alanRes.rows.length > 0 ? alanRes.rows[0].id_usuario : null;

        // B. MENSAJE 1: AL TERAPEUTA (Contexto Clínico Completo)
        if (id_terapeuta_user) {
            const msgDoctor = `🚨 DERIVACIÓN URGENTE\nColega, Monitoreo ha detectado indicadores de riesgo.\n\n${reporte_paciente}\n\nSe ha notificado a Gestión de Citas (Alan) para agendar prioridad.`;
            await db.query(`INSERT INTO Mensajes_Seguros (id_remitente, id_destinatario, contenido, leido, fecha_envio) VALUES ($1, $2, $3, false, NOW())`, 
            [jimmyId, id_terapeuta_user, msgDoctor]);
        }

        // C. MENSAJE 2: A ALAN (Solicitud Logística)
        if (alanId) {
            const msgAlan = `📅 SOLICITUD DE CITA PRIORITARIA\nPaciente: ${nombre_paciente}\nMotivo: Alerta de Monitoreo (Riesgo detectado).\n\nPor favor, coordine con el terapeuta asignado para abrir un espacio en la agenda lo antes posible.`;
            await db.query(`INSERT INTO Mensajes_Seguros (id_remitente, id_destinatario, contenido, leido, fecha_envio) VALUES ($1, $2, $3, false, NOW())`, 
            [jimmyId, alanId, msgAlan]);
        }

        // D. CERRAR LA INCIDENCIA
        await db.query(`UPDATE incidencias_clinicas SET estado = 'ESCALADO', fecha_resolucion = NOW() WHERE id_incidencia = $1`, [id_incidencia]);

        await db.query('COMMIT');
        res.redirect('/dashboard/manager?msg=escalated_success');

    } catch (error) {
        await db.query('ROLLBACK');
        console.error('Error escalando:', error);
        res.redirect('/dashboard/manager?msg=error');
    }
};

module.exports = {
    getManagerDashboard,
    escalateIncident
};
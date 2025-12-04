// controllers/managerController.js

const db = require('../config/database');

// ====================================================================
// 1. DASHBOARD DE GESTIÓN (Jimmy / Manager de Crisis)
// ====================================================================
const getManagerDashboard = async (req, res) => {
    const user = req.session.user;

    if (!user) {
        return res.redirect('/auth/login?msg=auth_required');
    }

    try {
        // KPIs + Bandeja en paralelo
        const [statsRes, inboxRes] = await Promise.all([
            db.query(
                `
                SELECT 
                    (SELECT COUNT(*) FROM incidencias_clinicas WHERE estado = 'PENDIENTE')  AS pendientes,
                    (SELECT COUNT(*) FROM incidencias_clinicas WHERE estado = 'ESCALADO')   AS gestionados,
                    (SELECT COUNT(*) FROM Terapeutas)                                      AS equipo_medico
                `
            ),
            db.query(
                `
                SELECT 
                    i.id_incidencia,
                    i.reporte_inicial,
                    i.fecha_creacion,
                    i.estado,
                    i.nivel_gravedad,

                    p.id_paciente,
                    u.nombre,
                    u.apellido,
                    u.email,
                    u.foto_perfil,

                    t.id_usuario           AS id_terapeuta_user,
                    doc.nombre             AS doc_nombre,
                    doc.apellido           AS doc_apellido
                FROM incidencias_clinicas i
                JOIN Pacientes p     ON i.id_paciente   = p.id_paciente
                JOIN Usuarios u      ON p.id_usuario    = u.id_usuario
                LEFT JOIN Terapeutas t ON p.id_terapeuta = t.id_terapeuta
                LEFT JOIN Usuarios doc ON t.id_usuario   = doc.id_usuario
                WHERE i.estado = 'PENDIENTE'
                ORDER BY i.fecha_creacion DESC
                `
            )
        ]);

        const stats = statsRes.rows[0] || {
            pendientes: 0,
            gestionados: 0,
            equipo_medico: 0
        };

        return res.render('dashboard/manager', {
            title: 'Gestión de Crisis',
            user,
            stats,
            incidents: inboxRes.rows
        });
    } catch (error) {
        console.error('Error en panel de gestión de crisis:', error);
        return res.status(500).render('error', {
            title: 'Error en panel de gestión',
            message:
                'Ha ocurrido un error al cargar el panel de gestión de crisis. Intenta nuevamente más tarde.',
            error,
            user: req.session.user
        });
    }
};

// ====================================================================
// 2. ESCALAR INCIDENCIA (Jimmy coordina con Terapeuta + Alan)
// ====================================================================
const escalateIncident = async (req, res) => {
    const {
        id_incidencia,
        id_terapeuta_user,
        reporte_paciente,
        nombre_paciente
    } = req.body;

    const managerUser = req.session.user;
    if (!managerUser) {
        return res.redirect('/auth/login?msg=auth_required');
    }

    const incidenciaId = parseInt(id_incidencia, 10);
    const terapeutaUserId = id_terapeuta_user
        ? parseInt(id_terapeuta_user, 10)
        : null;

    if (Number.isNaN(incidenciaId)) {
        return res
            .status(400)
            .redirect('/dashboard/manager?msg=invalid_incident_id');
    }

    try {
        await db.transaction(async (client) => {
            // A. BUSCAR A ALAN (Gestor de Citas)
            const alanRes = await client.query(
                `
                SELECT u.id_usuario
                FROM Usuarios u
                JOIN Roles r ON u.id_rol = r.id_rol
                WHERE r.nombre_rol = 'GestorCitas'
                   OR u.nombre ILIKE '%Alan%'
                LIMIT 1
                `
            );
            const alanId =
                alanRes.rows.length > 0
                    ? alanRes.rows[0].id_usuario
                    : null;

            const resumenPaciente =
                reporte_paciente ||
                'Alerta generada desde el módulo de monitoreo. Revisar situación clínica del paciente.';

            const nombrePacienteSeguro =
                nombre_paciente && nombre_paciente.trim().length > 0
                    ? nombre_paciente
                    : 'Paciente en monitoreo';

            // B. MENSAJE 1: AL TERAPEUTA (Contexto Clínico Completo)
            if (!Number.isNaN(terapeutaUserId) && terapeutaUserId) {
                const msgDoctor = [
                    '🚨 DERIVACIÓN URGENTE (Gestión de Crisis)',
                    '',
                    'Desde el módulo de monitoreo se han detectado indicadores de riesgo clínico relevantes.',
                    '',
                    `Paciente: ${nombrePacienteSeguro}`,
                    '',
                    'Resumen de la situación reportada:',
                    resumenPaciente,
                    '',
                    'Se ha notificado al área de Gestión de Citas para priorizar una nueva sesión o ajuste en la agenda.'
                ].join('\n');

                await client.query(
                    `
                    INSERT INTO Mensajes_Seguros 
                        (id_remitente, id_destinatario, contenido, leido, fecha_envio)
                    VALUES ($1, $2, $3, false, NOW())
                    `,
                    [managerUser.id_usuario, terapeutaUserId, msgDoctor]
                );
            }

            // C. MENSAJE 2: A ALAN (Logística / Agenda)
            if (alanId) {
                const msgAlan = [
                    '📅 SOLICITUD DE CITA PRIORITARIA',
                    '',
                    `Paciente: ${nombrePacienteSeguro}`,
                    '',
                    'Motivo: Alerta de riesgo detectada por el módulo de Monitoreo Emocional.',
                    '',
                    'Acción sugerida:',
                    '- Contactar al terapeuta responsable y evaluar la posibilidad de:',
                    '  • Adelantar la próxima sesión, o',
                    '  • Agendar un espacio adicional de alta prioridad.',
                    '',
                    'Por favor, registrar en el sistema cualquier ajuste realizado en la agenda.'
                ].join('\n');

                await client.query(
                    `
                    INSERT INTO Mensajes_Seguros 
                        (id_remitente, id_destinatario, contenido, leido, fecha_envio)
                    VALUES ($1, $2, $3, false, NOW())
                    `,
                    [managerUser.id_usuario, alanId, msgAlan]
                );
            }

            // D. ACTUALIZAR ESTADO DE LA INCIDENCIA
            const updRes = await client.query(
                `
                UPDATE incidencias_clinicas
                   SET estado = 'ESCALADO',
                       fecha_resolucion = NOW()
                 WHERE id_incidencia = $1
                `,
                [incidenciaId]
            );

            if (updRes.rowCount === 0) {
                throw new Error(
                    `Incidencia con id ${incidenciaId} no encontrada para escalar`
                );
            }
        });

        return res.redirect('/dashboard/manager?msg=escalated_success');
    } catch (error) {
        console.error('Error escalando incidencia:', error);
        return res.redirect('/dashboard/manager?msg=error');
    }
};

module.exports = {
    getManagerDashboard,
    escalateIncident
};

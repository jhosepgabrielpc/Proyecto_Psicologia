const db = require('../config/database');

// ====================================================================
// 1. DASHBOARD CLÍNICO (CENTRO DE COMANDO)
// ====================================================================
const getClinicalDashboard = async (req, res) => {
    const user = req.session.user;
    if (!user) {
        return res.redirect('/auth/login');
    }

    const userId = user.id_usuario;

    try {
        // 1) OBTENER ID DEL TERAPEUTA ASOCIADO AL USUARIO
        const tRes = await db.query(
            'SELECT id_terapeuta FROM Terapeutas WHERE id_usuario = $1',
            [userId]
        );

        // Si el usuario no es terapeuta, mostramos un panel vacío pero elegante
        if (tRes.rows.length === 0) {
            return res.render('dashboard/clinical', {
                title: 'Centro de Comando Clínico',
                user,
                stats: {
                    pacientes_activos: 0,
                    reportes_mes: 0,
                    sesiones_totales: 0,
                    alertas_activas: 0
                },
                patients: [],
                agendaHoy: [],
                alertasRiesgo: [],
                mensajeInfo:
                    'Este usuario aún no está vinculado a un perfil de terapeuta. Pide a un administrador que te asigne pacientes.'
            });
        }

        const terapeutaId = tRes.rows[0].id_terapeuta;

        // 2) CARGAR TODO EN PARALELO: KPIs, PACIENTES, AGENDA, ALERTAS
        const [statsRes, patientsRes, agendaRes, riskRes] = await Promise.all([
            // A) KPIs PRINCIPALES
            db.query(
                `
                SELECT 
                    -- Pacientes activos del terapeuta
                    (SELECT COUNT(*)
                       FROM Pacientes
                      WHERE id_terapeuta = $1
                        AND estado_tratamiento = 'activo') AS pacientes_activos,

                    -- Reportes generados en los últimos 30 días
                    (SELECT COUNT(*)
                       FROM reportes_progreso r
                       JOIN Pacientes p ON r.id_paciente = p.id_paciente
                      WHERE p.id_terapeuta = $1
                        AND r.fecha_generacion > NOW() - INTERVAL '30 days') AS reportes_mes,

                    -- Sesiones completadas históricas
                    (SELECT COUNT(*)
                       FROM Citas
                      WHERE id_terapeuta = $1
                        AND estado = 'Completada') AS sesiones_totales,

                    -- Alertas de riesgo abiertas (independiente del formato de nivel_gravedad)
                    (SELECT COUNT(*)
                       FROM incidencias_clinicas i
                       JOIN Pacientes p2 ON i.id_paciente = p2.id_paciente
                      WHERE p2.id_terapeuta = $1
                        AND i.estado != 'RESUELTO') AS alertas_activas
                `,
                [terapeutaId]
            ),

            // B) PACIENTES ASIGNADOS
            db.query(
                `
                SELECT 
                    p.id_paciente,
                    u.nombre,
                    u.apellido,
                    u.email,
                    u.foto_perfil,
                    p.estado_tratamiento,
                    -- Última sesión completada
                    (
                        SELECT fecha_hora_inicio
                          FROM Citas
                         WHERE id_paciente = p.id_paciente
                           AND estado = 'Completada'
                      ORDER BY fecha_hora_inicio DESC
                         LIMIT 1
                    ) AS ultima_sesion,
                    -- Cantidad total de reportes registrados
                    (
                        SELECT COUNT(*)
                          FROM reportes_progreso
                         WHERE id_paciente = p.id_paciente
                    ) AS total_reportes
                FROM Pacientes p
                JOIN Usuarios u ON p.id_usuario = u.id_usuario
                WHERE p.id_terapeuta = $1
                ORDER BY u.apellido ASC, u.nombre ASC
                `,
                [terapeutaId]
            ),

            // C) AGENDA DE HOY
            db.query(
                `
                SELECT 
                    c.id_cita,
                    c.fecha_hora_inicio,
                    c.fecha_hora_fin,
                    c.modalidad,
                    c.enlace_reunion,
                    c.estado,
                    u.nombre,
                    u.apellido,
                    u.foto_perfil,
                    p.id_paciente
                FROM Citas c
                JOIN Pacientes p ON c.id_paciente = p.id_paciente
                JOIN Usuarios u ON p.id_usuario = u.id_usuario
                WHERE c.id_terapeuta = $1
                  AND c.fecha_hora_inicio::date = CURRENT_DATE
                  AND c.estado != 'Cancelada'
                ORDER BY c.fecha_hora_inicio ASC
                `,
                [terapeutaId]
            ),

            // D) RADAR DE RIESGO (INCIDENCIAS ABIERTAS)
            db.query(
                `
                SELECT 
                    i.id_incidencia,
                    i.id_paciente,
                    i.reporte_inicial,
                    i.fecha_creacion,
                    i.estado,
                    i.nivel_gravedad AS nivel_texto,

                    -- Mapeo SEGURO a un número 1–5 para la UI
                    CASE 
                        WHEN i.nivel_gravedad ~ '^[0-9]+$'
                            THEN i.nivel_gravedad::integer              -- valores "1", "2", etc.
                        WHEN UPPER(i.nivel_gravedad) IN ('CRITICA','CRÍTICA')
                            THEN 5
                        WHEN UPPER(i.nivel_gravedad) = 'ALTA'
                            THEN 4
                        WHEN UPPER(i.nivel_gravedad) = 'MEDIA'
                            THEN 3
                        WHEN UPPER(i.nivel_gravedad) = 'BAJA'
                            THEN 2
                        ELSE 1
                    END AS nivel_valencia,

                    u.nombre,
                    u.apellido,
                    u.foto_perfil
                FROM incidencias_clinicas i
                JOIN Pacientes   p ON i.id_paciente   = p.id_paciente
                JOIN Terapeutas  t ON p.id_terapeuta = t.id_terapeuta
                JOIN Usuarios    u ON p.id_usuario   = u.id_usuario
                WHERE t.id_terapeuta = $1
                  AND i.estado != 'RESUELTO'
                ORDER BY i.fecha_creacion DESC
                LIMIT 10
                `,
                [terapeutaId]
            )
        ]);

        // 3) NORMALIZAR DATOS PARA LA VISTA
        const stats = statsRes.rows[0] || {
            pacientes_activos: 0,
            reportes_mes: 0,
            sesiones_totales: 0,
            alertas_activas: 0
        };

        const alertasRiesgo = riskRes.rows.map(row => ({
            id_incidencia: row.id_incidencia,
            id_paciente: row.id_paciente,
            nombre: row.nombre,
            apellido: row.apellido,
            foto_perfil: row.foto_perfil,
            fecha_hora: row.fecha_creacion,
            // Usamos el valor numérico mapeado para la “barrita” / etiqueta Nivel X/5
            valencia: row.nivel_valencia ?? 3,
            // Mostramos la etiqueta textual como “emoción principal”/tipo
            emocion_principal: row.nivel_texto || 'Crisis',
            // Texto principal de la alerta
            notas: row.reporte_inicial || 'Incidencia registrada en el sistema.'
        }));

        // Mensaje contextual superior (bajo el header)
        let mensajeInfo = null;
        if (!agendaRes.rows.length && !alertasRiesgo.length) {
            mensajeInfo =
                'Hoy no tienes citas programadas ni alertas activas. Es un buen momento para revisar expedientes o actualizar notas clínicas.';
        } else if (alertasRiesgo.length && !agendaRes.rows.length) {
            mensajeInfo =
                'No hay citas para hoy, pero existen alertas de riesgo que requieren tu revisión.';
        }

        // 4) RENDER DEL PANEL
        return res.render('dashboard/clinical', {
            title: 'Centro de Comando Clínico',
            user,
            stats,
            patients: patientsRes.rows,
            agendaHoy: agendaRes.rows,
            alertasRiesgo,
            mensajeInfo
        });
    } catch (error) {
        console.error('Error Dashboard Clínico:', error);
        return res.status(500).render('error', {
            title: 'Error cargando el panel clínico',
            message:
                'Ha ocurrido un error interno inesperado. El equipo técnico ha sido notificado.',
            error,
            user: req.session.user
        });
    }
};



// ====================================================================
// 2. RESOLVER INCIDENCIA
// ====================================================================
const resolveIncident = async (req, res) => {
    const { id_incidencia, notas } = req.body;

    try {
        await db.query(
            `
            UPDATE incidencias_clinicas 
            SET estado = 'RESUELTO', 
                fecha_resolucion = NOW(), 
                reporte_inicial = CONCAT(
                    reporte_inicial,
                    E'\n\n✅ ATENDIDO POR TERAPEUTA:\n',
                    $1::text
                )
            WHERE id_incidencia = $2
            `,
            [notas || 'Caso cerrado.', id_incidencia]
        );

        res.redirect('/dashboard/clinical?msg=crisis_resolved');
    } catch (error) {
        console.error('Error resolviendo incidencia:', error);
        res.redirect('/dashboard/clinical?msg=error');
    }
};

// ====================================================================
// 3. ANALYTICS GENERAL
// ====================================================================
const getAnalytics = async (req, res) => {
    const period = req.query.period || 'all';

    try {
        const statsQuery = `
            SELECT 
                (SELECT COUNT(*) FROM Usuarios WHERE fecha_registro > NOW() - INTERVAL '30 days') AS nuevos_usuarios,
                (SELECT COUNT(*) FROM Citas WHERE estado = 'Completada') AS citas_completadas,
                (SELECT COUNT(*) FROM checkins_emocionales) AS total_checkins,
                (SELECT COUNT(*) FROM Pacientes WHERE estado_tratamiento = 'activo') AS pacientes_activos
        `;
        const statsRes = await db.query(statsQuery);

        const distRes = await db.query(`
            SELECT estado, COUNT(*) AS cantidad 
            FROM Citas 
            GROUP BY estado
        `);

        res.render('reports/analytics', {
            title: 'Analytics & Métricas',
            user: req.session.user,
            stats: {
                usuarios: statsRes.rows[0].nuevos_usuarios,
                citas: statsRes.rows[0].citas_completadas,
                checkins: statsRes.rows[0].total_checkins,
                pacientes_activos: statsRes.rows[0].pacientes_activos
            },
            period,
            distribution: distRes.rows
        });
    } catch (error) {
        console.error('Error analytics:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Error al cargar analytics.',
            error,
            user: req.session.user
        });
    }
};

// ====================================================================
// 4. EXPEDIENTE DEL PACIENTE
// ====================================================================
const getPatientHistory = async (req, res) => {
    const patientId = parseInt(req.params.id, 10);

    if (Number.isNaN(patientId)) {
        return res.status(400).render('error', {
            title: 'Error',
            message: 'Identificador de paciente inválido.',
            error: null,
            user: req.session.user
        });
    }

    try {
        const patientRes = await db.query(
            `
            SELECT 
                p.*,
                u.nombre,
                u.apellido,
                u.email,
                u.telefono,
                u.foto_perfil,
                u.ultimo_login,
                u.fecha_registro
            FROM Pacientes p
            JOIN Usuarios u ON p.id_usuario = u.id_usuario
            WHERE p.id_paciente = $1
            `,
            [patientId]
        );

        if (patientRes.rows.length === 0) {
            return res.status(404).render('error', {
                title: 'Paciente no encontrado',
                message: 'No se encontró el paciente solicitado.',
                error: null,
                user: req.session.user
            });
        }

        const patient = patientRes.rows[0];

        const [sessionsRes, reportsRes, moodStatsRes, checkinsRes] =
            await Promise.all([
                db.query(
                    `
                    SELECT 
                        id_cita,
                        fecha_hora_inicio,
                        modalidad,
                        estado,
                        notas_admin AS notas_terapeuta,
                        CASE 
                            WHEN estado = 'Completada' THEN 'excelente' 
                            ELSE 'regular' 
                        END AS calidad_sesion
                    FROM Citas
                    WHERE id_paciente = $1
                      AND fecha_hora_inicio < NOW()
                    ORDER BY fecha_hora_inicio DESC
                    `,
                    [patientId]
                ),

                db.query(
                    `
                    SELECT *
                    FROM reportes_progreso
                    WHERE id_paciente = $1
                    ORDER BY fecha_generacion DESC
                    `,
                    [patientId]
                ),

                db.query(
                    `
                    SELECT 
                        COALESCE(AVG(valencia), 0)::numeric(10,1) AS promedio_animo,
                        COUNT(*) AS total_registros
                    FROM checkins_emocionales
                    WHERE id_paciente = $1
                    `,
                    [patientId]
                ),

                db.query(
                    `
                    SELECT 
                        fecha_hora,
                        valencia
                    FROM checkins_emocionales
                    WHERE id_paciente = $1
                    ORDER BY fecha_hora DESC
                    LIMIT 30
                    `,
                    [patientId]
                )
            ]);

        let tests = [];
        try {
            const testsQuery = await db.query(
                `
                SELECT 
                    r.tipo_test AS nombre_escala,
                    r.fecha_realizacion AS fecha_completacion
                FROM resultados_tests r
                WHERE r.id_paciente = $1
                ORDER BY r.fecha_realizacion DESC
                LIMIT 10
                `,
                [patientId]
            );
            tests = testsQuery.rows;
        } catch (testsErr) {
            console.warn(
                '⚠️ Error cargando tests para paciente',
                patientId,
                testsErr.message
            );
            tests = [];
        }

        res.render('reports/patient-history', {
            title: `Expediente clínico: ${patient.nombre} ${patient.apellido}`,
            user: req.session.user,
            patient,
            sessions: sessionsRes.rows,
            reports: reportsRes.rows,
            moodStats: moodStatsRes.rows[0] || {
                promedio_animo: 0,
                total_registros: 0
            },
            checkins: checkinsRes.rows,
            tests
        });
    } catch (error) {
        console.error('Error expediente:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Error al cargar el expediente del paciente.',
            error,
            user: req.session.user
        });
    }
};

// ====================================================================
// 5. FORMULARIO PARA CREAR REPORTE
// ====================================================================
const getCreateReportForm = async (req, res) => {
    const patientId = req.params.id;

    try {
        const patientRes = await db.query(
            `
            SELECT 
                p.id_paciente, 
                u.nombre, 
                u.apellido 
            FROM Pacientes p 
            JOIN Usuarios u ON p.id_usuario = u.id_usuario 
            WHERE p.id_paciente = $1
            `,
            [patientId]
        );

        if (patientRes.rows.length === 0) {
            return res.redirect('/dashboard/clinical');
        }

        res.render('reports/create-progress', {
            title: 'Generar Reporte de Progreso',
            user: req.session.user,
            patient: patientRes.rows[0],
            formData: {}
        });
    } catch (error) {
        console.error('Error cargar formulario reporte:', error);
        res.redirect('/dashboard/clinical');
    }
};

// ====================================================================
// 6. GUARDAR REPORTE DE PROGRESO
// ====================================================================
const saveProgressReport = async (req, res) => {
    const {
        patientId,
        tipo_reporte,
        periodo_inicio,
        periodo_fin,
        resumen_evolucion,
        recomendaciones
    } = req.body;

    try {
        const terapeutaRes = await db.query(
            'SELECT id_terapeuta FROM Terapeutas WHERE id_usuario = $1',
            [req.session.user.id_usuario]
        );
        const tId =
            terapeutaRes.rows.length > 0
                ? terapeutaRes.rows[0].id_terapeuta
                : null;

        await db.query(
            `
            INSERT INTO reportes_progreso 
                (id_paciente, id_terapeuta, tipo_reporte, periodo_inicio, periodo_fin, resumen_evolucion, recomendaciones) 
            VALUES 
                ($1, $2, $3, $4, $5, $6, $7)
            `,
            [
                patientId,
                tId,
                tipo_reporte,
                periodo_inicio,
                periodo_fin,
                resumen_evolucion,
                recomendaciones
            ]
        );

        res.redirect(
            `/reports/patient/${patientId}/view?msg=report_created`
        );
    } catch (error) {
        console.error('Error guardando reporte de progreso:', error);
        res.redirect(
            `/reports/patient/${patientId}/create-report?msg=error`
        );
    }
};

// ====================================================================
// 7. ACTUALIZAR NOTA DE SESIÓN
// ====================================================================
const updateSessionNote = async (req, res) => {
    const { sessionId, notas, patientId } = req.body;

    try {
        await db.query(
            'UPDATE Citas SET notas_admin = $1 WHERE id_cita = $2',
            [notas, sessionId]
        );

        res.redirect(
            `/reports/patient/${patientId}/view?msg=note_updated`
        );
    } catch (error) {
        console.error('Error actualizando nota de sesión:', error);
        res.redirect(`/reports/patient/${patientId}/view?msg=error`);
    }
};

// ====================================================================
// EXPORTS
// ====================================================================
module.exports = {
    getClinicalDashboard,
    resolveIncident,
    getAnalytics,
    getPatientHistory,
    getCreateReportForm,
    saveProgressReport,
    updateSessionNote
};

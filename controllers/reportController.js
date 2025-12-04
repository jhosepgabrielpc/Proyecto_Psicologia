// controllers/reportController.js

const db = require('../config/database');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

// Helper IA-lite para resumen clínico
const { generateClinicalSummary } = require('../helpers/clinicalSummary');

// ====================================================================
// HELPER INTERNO: CONTROL DE ACCESO POR PACIENTE
// ====================================================================

/**
 * Verifica si el usuario actual puede acceder al paciente indicado.
 *
 * Reglas:
 *  - Si el paciente no existe → exists=false, allowed=false
 *  - Roles "globales" (admin, GestorHistorial, Monitorista, GestorComunicacion)
 *      → pueden ver cualquier paciente.
 *  - Rol "Terapeuta" → solo puede ver pacientes que tenga asignados.
 *
 * @param {number} patientId
 * @param {object} user - req.session.user
 * @returns {Promise<{exists: boolean, allowed: boolean, meta: object|null}>}
 */
const ensurePatientAccess = async (patientId, user) => {
    if (!user) {
        return { exists: false, allowed: false, meta: null };
    }

    const baseRes = await db.query(
        `
        SELECT 
            p.id_paciente,
            p.id_terapeuta,
            t.id_terapeuta       AS terapeuta_id,
            ut.id_usuario        AS terapeuta_usuario
        FROM Pacientes p
        LEFT JOIN Terapeutas t ON p.id_terapeuta = t.id_terapeuta
        LEFT JOIN Usuarios  ut ON t.id_usuario  = ut.id_usuario
        WHERE p.id_paciente = $1
        `,
        [patientId]
    );

    if (baseRes.rows.length === 0) {
        return { exists: false, allowed: false, meta: null };
    }

    const meta = baseRes.rows[0];
    const rawRole = user.nombre_rol || '';
    const role = rawRole.toString().toLowerCase().replace(/\s+/g, '');

    const isGlobalClinicalRole =
        role.includes('admin') ||
        role === 'gestorhistorial' ||
        role === 'monitorista' ||
        role === 'gestorcomunicacion';

    if (isGlobalClinicalRole) {
        return { exists: true, allowed: true, meta };
    }

    // Terapeuta asignado al paciente
    if (role === 'terapeuta' && meta.terapeuta_usuario === user.id_usuario) {
        return { exists: true, allowed: true, meta };
    }

    // Otros roles clínicos no globales: por ahora restringidos
    return { exists: true, allowed: false, meta };
};

// ====================================================================
// 1. DASHBOARD CLÍNICO (CENTRO DE COMANDO DEL TERAPEUTA)
// ====================================================================

/**
 * Panel clínico para el terapeuta logueado.
 * Muestra KPIs, pacientes asignados, agenda del día y radar de riesgo.
 */
const getClinicalDashboard = async (req, res) => {
    const user = req.session.user;
    const msg = req.query.msg || null;

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
                    'Este usuario aún no está vinculado a un perfil de terapeuta. Pide a un administrador que te asigne pacientes.',
                msg
            });
        }

        const terapeutaId = tRes.rows[0].id_terapeuta;

        // 2) CARGAR EN PARALELO: KPIs, PACIENTES, AGENDA HOY, ALERTAS
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

                    -- Alertas de riesgo abiertas
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
                    CASE 
                        WHEN i.nivel_gravedad ~ '^[0-9]+$'
                            THEN i.nivel_gravedad::integer
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
            valencia: row.nivel_valencia ?? 3,
            emocion_principal: row.nivel_texto || 'Crisis',
            notas: row.reporte_inicial || 'Incidencia registrada en el sistema.'
        }));

        let mensajeInfo = null;
        if (!agendaRes.rows.length && !alertasRiesgo.length) {
            mensajeInfo =
                'Hoy no tienes citas programadas ni alertas activas. Es un buen momento para revisar expedientes o actualizar notas clínicas.';
        } else if (alertasRiesgo.length && !agendaRes.rows.length) {
            mensajeInfo =
                'No hay citas para hoy, pero existen alertas de riesgo que requieren tu revisión.';
        }

        return res.render('dashboard/clinical', {
            title: 'Centro de Comando Clínico',
            user,
            stats,
            patients: patientsRes.rows,
            agendaHoy: agendaRes.rows,
            alertasRiesgo,
            mensajeInfo,
            msg
        });
    } catch (error) {
        console.error('Error Dashboard Clínico:', error);
        return res.status(500).render('error', {
            title: 'Error cargando el panel clínico',
            message:
                'Ha ocurrido un error interno inesperado. El equipo técnico ha sido notificado.',
            error,
            user
        });
    }
};

// ====================================================================
// 2. RESOLVER INCIDENCIA (MÓDULO CLÍNICO)
// ====================================================================

/**
 * Marca una incidencia como resuelta y concatena notas al reporte inicial.
 */
const resolveIncident = async (req, res) => {
    const user = req.session.user;
    const { id_incidencia, notas } = req.body;

    if (!user) {
        return res.redirect('/auth/login');
    }

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
// 3. ANALYTICS GENERAL (VISTA ADMIN / GESTOR)
// ====================================================================

/**
 * Analytics globales de la plataforma (para roles administrativos).
 */
const getAnalytics = async (req, res) => {
    const user = req.session.user;
    const msg = req.query.msg || null;

    if (!user) {
        return res.redirect('/auth/login');
    }

    const period = (req.query.period || 'all').toLowerCase();

    try {
        // Por ahora 'period' solo se usa para la vista (filtro visual).
        const statsQuery = `
            SELECT 
                (SELECT COUNT(*) FROM Usuarios WHERE fecha_registro > NOW() - INTERVAL '30 days') AS nuevos_usuarios,
                (SELECT COUNT(*) FROM Citas   WHERE estado = 'Completada') AS citas_completadas,
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
            user,
            stats: {
                usuarios: statsRes.rows[0].nuevos_usuarios,
                citas: statsRes.rows[0].citas_completadas,
                checkins: statsRes.rows[0].total_checkins,
                pacientes_activos: statsRes.rows[0].pacientes_activos
            },
            period,
            distribution: distRes.rows,
            msg
        });
    } catch (error) {
        console.error('Error analytics:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Error al cargar analytics.',
            error,
            user
        });
    }
};

// ====================================================================
// 4. EXPEDIENTE DEL PACIENTE (VISTA HTML)
// ====================================================================

/**
 * Vista HTML completa del expediente clínico del paciente.
 * Ruta esperada: GET /reports/patient/:id/view
 */
const getPatientHistory = async (req, res) => {
    const user = req.session.user;
    const msg = req.query.msg || null;
    const patientId = parseInt(req.params.id, 10);

    if (!user) {
        return res.redirect('/auth/login');
    }

    if (Number.isNaN(patientId)) {
        return res.status(400).render('error', {
            title: 'Error',
            message: 'Identificador de paciente inválido.',
            error: null,
            user
        });
    }

    try {
        const access = await ensurePatientAccess(patientId, user);

        if (!access.exists) {
            return res.status(404).render('error', {
                title: 'Paciente no encontrado',
                message: 'No se encontró el paciente solicitado.',
                error: null,
                user
            });
        }

        if (!access.allowed) {
            return res.status(403).render('error', {
                title: 'Acceso restringido',
                message: 'No tienes permisos para ver este expediente clínico.',
                error: { status: 403 },
                user
            });
        }

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

        // Tests / escalas
        let tests = [];
        try {
            const testsQuery = await db.query(
                `
                SELECT 
                    r.tipo_test       AS nombre_escala,
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
            user,
            patient,
            sessions: sessionsRes.rows,
            reports: reportsRes.rows,
            moodStats: moodStatsRes.rows[0] || {
                promedio_animo: 0,
                total_registros: 0
            },
            checkins: checkinsRes.rows,
            tests,
            msg
        });
    } catch (error) {
        console.error('Error expediente:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Error al cargar el expediente del paciente.',
            error,
            user
        });
    }
};

// ====================================================================
// 5. FORMULARIO PARA CREAR REPORTE DE PROGRESO
// ====================================================================

/**
 * Formulario para generar un nuevo reporte de progreso.
 * Ruta: GET /reports/patient/:id/create-report
 */
const getCreateReportForm = async (req, res) => {
    const user = req.session.user;
    const msg = req.query.msg || null;
    const patientId = parseInt(req.params.id, 10);

    if (!user) {
        return res.redirect('/auth/login');
    }

    if (Number.isNaN(patientId)) {
        return res.redirect('/dashboard/clinical?msg=patient_invalid');
    }

    try{
        const access = await ensurePatientAccess(patientId, user);

        if (!access.exists) {
            return res.redirect('/dashboard/clinical?msg=patient_not_found');
        }

        if (!access.allowed) {
            return res.redirect('/dashboard/clinical?msg=forbidden');
        }

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

        res.render('reports/create-progress', {
            title: 'Generar Reporte de Progreso',
            user,
            patient: patientRes.rows[0],
            formData: {},
            msg
        });
    } catch (error) {
        console.error('Error cargar formulario reporte:', error);
        res.redirect('/dashboard/clinical?msg=error');
    }
};

// ====================================================================
// 6. GUARDAR REPORTE DE PROGRESO
// ====================================================================

/**
 * Persiste un nuevo reporte de progreso para el paciente.
 * Ruta: POST /reports/patient/:id/create-report
 */
const saveProgressReport = async (req, res) => {
    const user = req.session.user;
    const patientId = parseInt(req.params.id, 10);

    if (!user) {
        return res.redirect('/auth/login');
    }

    if (Number.isNaN(patientId)) {
        return res.redirect('/dashboard/clinical?msg=patient_invalid');
    }

    const {
        tipo_reporte,
        periodo_inicio,
        periodo_fin,
        resumen_evolucion,
        recomendaciones
    } = req.body;

    try {
        const access = await ensurePatientAccess(patientId, user);

        if (!access.exists) {
            return res.redirect('/dashboard/clinical?msg=patient_not_found');
        }

        if (!access.allowed) {
            return res.redirect('/dashboard/clinical?msg=forbidden');
        }

        const terapeutaRes = await db.query(
            'SELECT id_terapeuta FROM Terapeutas WHERE id_usuario = $1',
            [user.id_usuario]
        );
        const tId =
            terapeutaRes.rows.length > 0
                ? terapeutaRes.rows[0].id_terapeuta
                : null;

        await db.query(
            `
            INSERT INTO reportes_progreso 
                (id_paciente, id_terapeuta, tipo_reporte, periodo_inicio, periodo_fin, resumen_evolucion, recomendaciones, fecha_generacion) 
            VALUES 
                ($1, $2, $3, $4, $5, $6, $7, NOW())
            `,
            [
                patientId,
                tId,
                tipo_reporte,
                periodo_inicio || null,
                periodo_fin || null,
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

/**
 * Actualiza la nota clínica (notas_admin) de una sesión específica.
 * Ruta: POST /reports/patient/:id/update-session-note
 */
const updateSessionNote = async (req, res) => {
    const user = req.session.user;
    const patientId = parseInt(req.params.id, 10);

    if (!user) {
        return res.redirect('/auth/login');
    }

    if (Number.isNaN(patientId)) {
        return res.redirect('/dashboard/clinical?msg=patient_invalid');
    }

    const { sessionId, notas } = req.body;

    try {
        const access = await ensurePatientAccess(patientId, user);

        if (!access.exists) {
            return res.redirect('/dashboard/clinical?msg=patient_not_found');
        }

        if (!access.allowed) {
            return res.redirect('/dashboard/clinical?msg=forbidden');
        }

        // Validar que la sesión pertenezca al paciente
        const sessionRes = await db.query(
            `
            SELECT id_cita, id_paciente 
              FROM Citas 
             WHERE id_cita = $1
            `,
            [sessionId]
        );

        if (sessionRes.rows.length === 0) {
            return res.redirect(
                `/reports/patient/${patientId}/view?msg=session_not_found`
            );
        }

        if (sessionRes.rows[0].id_paciente !== patientId) {
            // Intento de mezclar paciente y sesión que no corresponde
            return res.redirect(
                `/reports/patient/${patientId}/view?msg=session_mismatch`
            );
        }

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
// 8. GENERAR REPORTE CLÍNICO PDF PROFESIONAL
// ====================================================================

/**
 * Genera un reporte clínico profesional en PDF.
 * Ruta: GET /reports/patient/:id/pdf
 */
const generatePatientPdf = async (req, res) => {
    const user = req.session.user;
    const patientId = parseInt(req.params.id, 10);

    if (!user) {
        return res.redirect('/auth/login');
    }

    if (Number.isNaN(patientId)) {
        return res.status(400).send('Paciente inválido');
    }

    try {
        const access = await ensurePatientAccess(patientId, user);

        if (!access.exists) {
            return res.status(404).send('Paciente no encontrado');
        }

        if (!access.allowed) {
            return res.status(403).send('No tienes permisos para este paciente');
        }

        // 1) DATOS PRINCIPALES DEL PACIENTE + TERAPEUTA
        const infoRes = await db.query(
            `
            SELECT 
                p.id_paciente,
                p.estado_tratamiento,
                u.nombre,
                u.apellido,
                u.email,
                u.telefono,
                u.fecha_registro,
                u.foto_perfil,
                t.id_terapeuta,
                ut.nombre   AS terapeuta_nombre,
                ut.apellido AS terapeuta_apellido,
                t.especialidad
              FROM Pacientes p
              JOIN Usuarios u ON p.id_usuario = u.id_usuario
         LEFT JOIN Terapeutas t ON p.id_terapeuta = t.id_terapeuta
         LEFT JOIN Usuarios ut ON t.id_usuario   = ut.id_usuario
             WHERE p.id_paciente = $1
            `,
            [patientId]
        );

        if (infoRes.rows.length === 0) {
            return res.status(404).send('Paciente no encontrado');
        }

        const info = infoRes.rows[0];

        // 2) ÚLTIMAS CITAS + TESTS + CHECKINS + INCIDENCIAS
        const [sessionsRes, testsRes, moodSeriesRes, incidentsRes] =
            await Promise.all([
                db.query(
                    `
                    SELECT 
                        fecha_hora_inicio,
                        modalidad,
                        estado,
                        notas_admin
                      FROM Citas
                     WHERE id_paciente = $1
                  ORDER BY fecha_hora_inicio DESC
                     LIMIT 10
                    `,
                    [patientId]
                ),
                db.query(
                    `
                    SELECT 
                        tipo_test,
                        puntaje_total,
                        nivel_severidad,
                        fecha_realizacion
                      FROM resultados_tests
                     WHERE id_paciente = $1
                  ORDER BY fecha_realizacion DESC
                     LIMIT 10
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
                  ORDER BY fecha_hora ASC
                     LIMIT 50
                    `,
                    [patientId]
                ),
                db.query(
                    `
                    SELECT 
                        reporte_inicial,
                        nivel_gravedad,
                        fecha_creacion,
                        estado
                      FROM incidencias_clinicas
                     WHERE id_paciente = $1
                  ORDER BY fecha_creacion DESC
                     LIMIT 10
                    `,
                    [patientId]
                )
            ]);

        // 3) PREPARAR DATA PARA EL HELPER (IA-lite)
        const summaryData = {
            patient: info,
            sessions: sessionsRes.rows,
            tests: testsRes.rows,
            moodSeries: moodSeriesRes.rows,
            incidents: incidentsRes.rows
        };

        let clinicalSummaryText = '';
        try {
            clinicalSummaryText = generateClinicalSummary(summaryData);
        } catch (e) {
            console.warn('⚠️ Error en generateClinicalSummary:', e.message);
            clinicalSummaryText =
                'No fue posible generar el resumen clínico automatizado en este momento.';
        }

        // 4) CONFIGURAR RESPUESTA HTTP
        const fileName = `reporte_clinico_${info.nombre}_${info.apellido}.pdf`.replace(
            /\s+/g,
            '_'
        );

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
            'Content-Disposition',
            `inline; filename="${fileName}"`
        );

        // 5) CREAR PDF
        const doc = new PDFDocument({
            size: 'A4',
            margin: 50
        });

        doc.info.Title = `Reporte Clínico Integrado - ${info.nombre} ${info.apellido}`;
        doc.info.Author = 'MindCare';

        doc.pipe(res);

        // PORTADA
        doc
            .fontSize(22)
            .fillColor('#1f2933')
            .text('MindCare - Reporte Clínico Integrado', { align: 'center' });

        doc.moveDown();

        doc
            .fontSize(14)
            .fillColor('#111827')
            .text(`${info.nombre} ${info.apellido}`, { align: 'center' });

        doc
            .fontSize(10)
            .fillColor('#4b5563')
            .text(`ID interno: ${info.id_paciente}`, { align: 'center' });

        doc.moveDown();

        doc
            .fontSize(10)
            .fillColor('#374151')
            .text(
                `Terapeuta a cargo: ${
                    info.terapeuta_nombre
                        ? `Dr(a). ${info.terapeuta_nombre} ${info.terapeuta_apellido} (${info.especialidad || 'Sin especialidad'})`
                        : 'No asignado'
                }`,
                { align: 'center' }
            );

        doc
            .fontSize(9)
            .fillColor('#6b7280')
            .text(
                `Generado: ${new Date().toLocaleString('es-ES')}`,
                { align: 'center' }
            );

        doc.addPage();

        // SECCIÓN 1: DATOS DE IDENTIFICACIÓN
        doc
            .fontSize(14)
            .fillColor('#111827')
            .text('1. Datos de identificación', { underline: true });
        doc.moveDown(0.5);

        doc.fontSize(10).fillColor('#111827');
        doc.text(`Nombre completo: ${info.nombre} ${info.apellido}`);
        doc.text(`Email: ${info.email}`);
        if (info.telefono) doc.text(`Teléfono: ${info.telefono}`);
        doc.text(
            `Estado de tratamiento: ${info.estado_tratamiento || 'Sin dato'}`
        );
        doc.text(
            `Fecha de registro en MindCare: ${
                info.fecha_registro
                    ? new Date(info.fecha_registro).toLocaleDateString('es-ES')
                    : 'N/D'
            }`
        );

        doc.moveDown();

        // SECCIÓN 2: RESUMEN CLÍNICO AUTOMATIZADO
        doc
            .fontSize(14)
            .fillColor('#111827')
            .text('2. Resumen Clínico Automatizado', { underline: true });
        doc.moveDown(0.5);

        doc
            .fontSize(10)
            .fillColor('#374151')
            .text(
                clinicalSummaryText ||
                    'No se dispone de suficiente información clínica.',
                {
                    align: 'justify'
                }
            );

        doc.moveDown();

        // SECCIÓN 3: EVOLUCIÓN DE SÍNTOMAS / ESCALAS
        doc
            .fontSize(14)
            .fillColor('#111827')
            .text('3. Escalas estandarizadas (PHQ-9 / GAD-7)', {
                underline: true
            });
        doc.moveDown(0.5);

        if (testsRes.rows.length === 0) {
            doc
                .fontSize(10)
                .fillColor('#6b7280')
                .text(
                    'No se registran aún aplicaciones de escalas estandarizadas para este paciente.'
                );
        } else {
            testsRes.rows.forEach(test => {
                doc
                    .fontSize(10)
                    .fillColor('#111827')
                    .text(
                        `${test.tipo_test} | Puntaje: ${test.puntaje_total} | Nivel: ${test.nivel_severidad}`
                    );
                doc
                    .fontSize(9)
                    .fillColor('#6b7280')
                    .text(
                        `Fecha: ${new Date(
                            test.fecha_realizacion
                        ).toLocaleString('es-ES')}`
                    );
                doc.moveDown(0.4);
            });
        }

        doc.moveDown();

        // SECCIÓN 4: ÚLTIMAS CITAS Y EVOLUCIÓN
        doc
            .fontSize(14)
            .fillColor('#111827')
            .text('4. Sesiones clínicas y evolución', { underline: true });
        doc.moveDown(0.5);

        if (sessionsRes.rows.length === 0) {
            doc
                .fontSize(10)
                .fillColor('#6b7280')
                .text(
                    'No hay citas registradas en el sistema para este paciente.'
                );
        } else {
            sessionsRes.rows.forEach(c => {
                doc
                    .fontSize(10)
                    .fillColor('#111827')
                    .text(
                        `${new Date(
                            c.fecha_hora_inicio
                        ).toLocaleString('es-ES')} | ${c.modalidad} | ${c.estado}`
                    );
                if (c.notas_admin) {
                    doc
                        .fontSize(9)
                        .fillColor('#4b5563')
                        .text(`Notas: ${c.notas_admin}`, {
                            align: 'justify'
                        });
                }
                doc.moveDown(0.4);
            });
        }

        doc.moveDown();

        // SECCIÓN 5: INCIDENCIAS / CRISIS
        doc
            .fontSize(14)
            .fillColor('#111827')
            .text('5. Incidencias y alertas de crisis', { underline: true });
        doc.moveDown(0.5);

        if (incidentsRes.rows.length === 0) {
            doc
                .fontSize(10)
                .fillColor('#6b7280')
                .text(
                    'No hay incidencias clínicas registradas para este paciente.'
                );
        } else {
            incidentsRes.rows.forEach(i => {
                doc
                    .fontSize(10)
                    .fillColor('#b91c1c')
                    .text(
                        `[${i.nivel_gravedad || 'N/A'}] ${new Date(
                            i.fecha_creacion
                        ).toLocaleString('es-ES')} - ${i.estado}`
                    );
                doc
                    .fontSize(9)
                    .fillColor('#4b5563')
                    .text(i.reporte_inicial || 'Sin detalle de incidente.', {
                        align: 'justify'
                    });
                doc.moveDown(0.4);
            });
        }

        doc.moveDown();

        // SECCIÓN 6: RECOMENDACIONES (placeholder manual)
        doc
            .fontSize(14)
            .fillColor('#111827')
            .text('6. Recomendaciones y plan terapéutico', { underline: true });
        doc.moveDown(0.5);

        doc
            .fontSize(9)
            .fillColor('#6b7280')
            .text(
                'Este espacio está destinado para que el terapeuta incorpore recomendaciones clínicas, ajustes de tratamiento, objetivos a corto y mediano plazo, y observaciones relevantes.',
                {
                    align: 'justify'
                }
            );

        doc.moveDown(2);
        doc
            .fontSize(10)
            .fillColor('#111827')
            .text('Firma del profesional:', { continued: false });
        doc.moveDown(2);
        doc.text('______________________________');
        doc
            .fontSize(9)
            .fillColor('#4b5563')
            .text(
                info.terapeuta_nombre
                    ? `Dr(a). ${info.terapeuta_nombre} ${info.terapeuta_apellido}`
                    : 'Terapeuta no asignado'
            );

        // Cerrar PDF
        doc.end();
    } catch (error) {
        console.error('Error generando PDF clínico:', error);
        return res
            .status(500)
            .send('Error interno generando el reporte clínico en PDF.');
    }
};

// ====================================================================
// 9. GENERAR REPORTE CLÍNICO EN EXCEL
// ====================================================================

/**
 * Genera un Excel con pestañas (Resumen, Citas, Tests, Estado de ánimo, Incidencias).
 * Ruta: GET /reports/patient/:id/excel
 */
const generatePatientExcel = async (req, res) => {
    const user = req.session.user;
    const patientId = parseInt(req.params.id, 10);

    if (!user) {
        return res.redirect('/auth/login');
    }

    if (Number.isNaN(patientId)) {
        return res.status(400).send('Paciente inválido');
    }

    try {
        const access = await ensurePatientAccess(patientId, user);

        if (!access.exists) {
            return res.status(404).send('Paciente no encontrado');
        }

        if (!access.allowed) {
            return res.status(403).send('No tienes permisos para este paciente');
        }

        const infoRes = await db.query(
            `
            SELECT 
                p.id_paciente,
                p.estado_tratamiento,
                u.nombre,
                u.apellido,
                u.email,
                u.telefono,
                u.fecha_registro,
                t.id_terapeuta,
                ut.nombre   AS terapeuta_nombre,
                ut.apellido AS terapeuta_apellido,
                t.especialidad
              FROM Pacientes p
              JOIN Usuarios u ON p.id_usuario = u.id_usuario
         LEFT JOIN Terapeutas t ON p.id_terapeuta = t.id_terapeuta
         LEFT JOIN Usuarios ut ON t.id_usuario   = ut.id_usuario
             WHERE p.id_paciente = $1
            `,
            [patientId]
        );

        if (infoRes.rows.length === 0) {
            return res.status(404).send('Paciente no encontrado');
        }

        const info = infoRes.rows[0];

        const [sessionsRes, testsRes, moodSeriesRes, incidentsRes] =
            await Promise.all([
                db.query(
                    `
                    SELECT 
                        fecha_hora_inicio,
                        fecha_hora_fin,
                        modalidad,
                        estado,
                        notas_admin
                      FROM Citas
                     WHERE id_paciente = $1
                  ORDER BY fecha_hora_inicio DESC
                     LIMIT 50
                    `,
                    [patientId]
                ),
                db.query(
                    `
                    SELECT 
                        tipo_test,
                        puntaje_total,
                        nivel_severidad,
                        fecha_realizacion
                      FROM resultados_tests
                     WHERE id_paciente = $1
                  ORDER BY fecha_realizacion DESC
                     LIMIT 50
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
                  ORDER BY fecha_hora ASC
                     LIMIT 200
                    `,
                    [patientId]
                ),
                db.query(
                    `
                    SELECT 
                        reporte_inicial,
                        nivel_gravedad,
                        fecha_creacion,
                        estado
                      FROM incidencias_clinicas
                     WHERE id_paciente = $1
                  ORDER BY fecha_creacion DESC
                     LIMIT 50
                    `,
                    [patientId]
                )
            ]);

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'MindCare';
        workbook.created = new Date();

        // Hoja 1: Resumen
        const wsResumen = workbook.addWorksheet('Resumen Clínico');

        wsResumen.columns = [
            { header: 'Campo', key: 'campo', width: 30 },
            { header: 'Valor', key: 'valor', width: 50 }
        ];

        wsResumen.addRows([
            { campo: 'Nombre completo', valor: `${info.nombre} ${info.apellido}` },
            { campo: 'ID Paciente', valor: info.id_paciente },
            { campo: 'Email', valor: info.email },
            { campo: 'Teléfono', valor: info.telefono || 'N/D' },
            {
                campo: 'Estado tratamiento',
                valor: info.estado_tratamiento || 'N/D'
            },
            {
                campo: 'Fecha registro MindCare',
                valor: info.fecha_registro
                    ? new Date(info.fecha_registro).toLocaleDateString('es-ES')
                    : 'N/D'
            },
            {
                campo: 'Terapeuta',
                valor: info.terapeuta_nombre
                    ? `Dr(a). ${info.terapeuta_nombre} ${info.terapeuta_apellido}`
                    : 'No asignado'
            },
            {
                campo: 'Especialidad',
                valor: info.especialidad || 'N/D'
            }
        ]);

        wsResumen.getRow(1).font = { bold: true };

        // Hoja 2: Citas
        const wsCitas = workbook.addWorksheet('Citas');
        wsCitas.columns = [
            { header: 'Fecha inicio', key: 'inicio', width: 22 },
            { header: 'Fecha fin', key: 'fin', width: 22 },
            { header: 'Modalidad', key: 'modalidad', width: 15 },
            { header: 'Estado', key: 'estado', width: 15 },
            { header: 'Notas terapeuta', key: 'notas', width: 60 }
        ];
        wsCitas.getRow(1).font = { bold: true };

        sessionsRes.rows.forEach(c => {
            wsCitas.addRow({
                inicio: new Date(c.fecha_hora_inicio).toLocaleString('es-ES'),
                fin: c.fecha_hora_fin
                    ? new Date(c.fecha_hora_fin).toLocaleString('es-ES')
                    : '',
                modalidad: c.modalidad,
                estado: c.estado,
                notas: c.notas_admin || ''
            });
        });

        // Hoja 3: Tests
        const wsTests = workbook.addWorksheet('Tests');
        wsTests.columns = [
            { header: 'Tipo test', key: 'tipo', width: 15 },
            { header: 'Puntaje total', key: 'puntaje', width: 15 },
            { header: 'Nivel severidad', key: 'nivel', width: 25 },
            { header: 'Fecha realización', key: 'fecha', width: 22 }
        ];
        wsTests.getRow(1).font = { bold: true };

        testsRes.rows.forEach(t => {
            wsTests.addRow({
                tipo: t.tipo_test,
                puntaje: t.puntaje_total,
                nivel: t.nivel_severidad,
                fecha: new Date(t.fecha_realizacion).toLocaleString('es-ES')
            });
        });

        // Hoja 4: Estado de ánimo (checkins)
        const wsAnimo = workbook.addWorksheet('Estado de ánimo');
        wsAnimo.columns = [
            { header: 'Fecha / Hora', key: 'fecha', width: 22 },
            { header: 'Valencia (1-5)', key: 'valencia', width: 18 }
        ];
        wsAnimo.getRow(1).font = { bold: true };

        moodSeriesRes.rows.forEach(m => {
            wsAnimo.addRow({
                fecha: new Date(m.fecha_hora).toLocaleString('es-ES'),
                valencia: m.valencia
            });
        });

        // Hoja 5: Incidencias
        const wsIncidencias = workbook.addWorksheet('Incidencias');
        wsIncidencias.columns = [
            { header: 'Fecha', key: 'fecha', width: 22 },
            { header: 'Nivel', key: 'nivel', width: 15 },
            { header: 'Estado', key: 'estado', width: 15 },
            { header: 'Detalle', key: 'detalle', width: 70 }
        ];
        wsIncidencias.getRow(1).font = { bold: true };

        incidentsRes.rows.forEach(i => {
            wsIncidencias.addRow({
                fecha: new Date(i.fecha_creacion).toLocaleString('es-ES'),
                nivel: i.nivel_gravedad,
                estado: i.estado,
                detalle: i.reporte_inicial || ''
            });
        });

        const fileName = `reporte_clinico_${info.nombre}_${info.apellido}.xlsx`.replace(
            /\s+/g,
            '_'
        );

        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="${fileName}"`
        );

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Error generando Excel clínico:', error);
        return res
            .status(500)
            .send('Error interno generando el reporte clínico en Excel.');
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
    updateSessionNote,
    generatePatientPdf,
    generatePatientExcel
};

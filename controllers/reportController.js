const db = require('../config/database');

// ====================================================================
// 1. DASHBOARD CLÍNICO (CENTRO DE COMANDO) 🏥
// ====================================================================
const getClinicalDashboard = async (req, res) => {
    const userId = req.session.user.id_usuario;

    try {
        // 1. IDENTIFICAR AL TERAPEUTA
        const tRes = await db.query('SELECT id_terapeuta FROM Terapeutas WHERE id_usuario = $1', [userId]);
        
        if (tRes.rows.length === 0) {
            return res.render('dashboard/clinical', { 
                title: 'Dirección Clínica', user: req.session.user, 
                stats: { pacientes_activos: 0, reportes_mes: 0, sesiones_totales: 0 },
                patients: [], agendaHoy: [], alertasRiesgo: []
            });
        }
        const terapeutaId = tRes.rows[0].id_terapeuta;

        // 2. QUERY PARALELO (4 CONSULTAS)
        const [statsRes, patientsRes, agendaRes, riskRes] = await Promise.all([
            // A. KPIs
            db.query(`
                SELECT 
                    (SELECT COUNT(*) FROM Pacientes WHERE id_terapeuta = $1 AND estado_tratamiento = 'activo') as pacientes_activos,
                    (SELECT COUNT(*) FROM reportes_progreso WHERE id_terapeuta = $1 AND fecha_generacion > NOW() - INTERVAL '30 days') as reportes_mes,
                    (SELECT COUNT(*) FROM Citas WHERE id_terapeuta = $1 AND estado = 'Completada') as sesiones_totales
            `, [terapeutaId]),

            // B. DIRECTORIO DE MIS PACIENTES
            db.query(`
                SELECT p.id_paciente, u.nombre, u.apellido, u.email, u.foto_perfil, p.estado_tratamiento,
                       (SELECT fecha_hora_inicio FROM Citas WHERE id_paciente = p.id_paciente AND estado = 'Completada' ORDER BY fecha_hora_inicio DESC LIMIT 1) as ultima_sesion,
                       (SELECT COUNT(*) FROM reportes_progreso WHERE id_paciente = p.id_paciente) as total_reportes
                FROM Pacientes p
                JOIN Usuarios u ON p.id_usuario = u.id_usuario
                WHERE p.id_terapeuta = $1
                ORDER BY u.apellido ASC
            `, [terapeutaId]),

            // C. AGENDA INTELIGENTE
            db.query(`
                SELECT c.id_cita, c.fecha_hora_inicio, c.fecha_hora_fin, c.modalidad, c.enlace_reunion, c.estado,
                       u.nombre, u.apellido, u.foto_perfil, p.id_paciente
                FROM Citas c
                JOIN Pacientes p ON c.id_paciente = p.id_paciente
                JOIN Usuarios u ON p.id_usuario = u.id_usuario
                WHERE c.id_terapeuta = $1 
                  AND c.fecha_hora_inicio::date = CURRENT_DATE
                  AND c.estado != 'Cancelada'
                ORDER BY c.fecha_hora_inicio ASC
            `, [terapeutaId]),

            // D. RADAR DE RIESGO
            db.query(`
                SELECT c.valencia, c.emocion_principal, c.fecha_hora, c.notas,
                       u.nombre, u.apellido, u.foto_perfil, p.id_paciente
                FROM checkins_emocionales c
                JOIN Pacientes p ON c.id_paciente = p.id_paciente
                JOIN Usuarios u ON p.id_usuario = u.id_usuario
                WHERE p.id_terapeuta = $1
                  AND c.valencia <= 2
                  AND c.fecha_hora > NOW() - INTERVAL '3 days'
                ORDER BY c.fecha_hora DESC
                LIMIT 5
            `, [terapeutaId])
        ]);

        // 3. RENDERIZADO
        res.render('dashboard/clinical', {
            title: 'Centro de Comando Clínico',
            user: req.session.user,
            stats: statsRes.rows[0],
            patients: patientsRes.rows,
            agendaHoy: agendaRes.rows,
            alertasRiesgo: riskRes.rows
        });

    } catch (error) {
        console.error('Error Dashboard Clínico:', error);
        res.status(500).render('error', { title: 'Error', message: 'Error cargando el panel clínico.', error, user: req.session.user });
    }
};

// ====================================================================
// 2. EXPEDIENTE Y REPORTES
// ====================================================================

const getPatientHistory = async (req, res) => {
    const patientId = req.params.id;
    try {
        // A. Datos Paciente
        const patientRes = await db.query(`SELECT p.*, u.nombre, u.apellido, u.email, u.telefono, u.foto_perfil, u.ultimo_login, u.fecha_registro FROM Pacientes p JOIN Usuarios u ON p.id_usuario = u.id_usuario WHERE p.id_paciente = $1`, [patientId]);
        if (patientRes.rows.length === 0) return res.redirect('/dashboard/clinical');
        
        // B. Sesiones con Notas
        const sessionsRes = await db.query(`
            SELECT c.id_cita, c.fecha_hora_inicio, c.modalidad, c.estado, 
                   'Consulta' as tipo_consulta,
                   st.notas_terapeuta, st.objetivos_trabajados, st.calidad_sesion, st.tareas_asignadas
            FROM Citas c
            LEFT JOIN Sesiones_Terapia st ON c.id_cita = st.id_cita
            WHERE c.id_paciente = $1 AND c.fecha_hora_inicio < NOW() 
            ORDER BY c.fecha_hora_inicio DESC
        `, [patientId]);
        
        // C. Reportes
        let reports = [];
        try { const r = await db.query(`SELECT * FROM reportes_progreso WHERE id_paciente = $1 ORDER BY fecha_generacion DESC`, [patientId]); reports = r.rows; } catch (e) {}

        // D. Stats Rápidos
        const moodStats = await db.query(`SELECT AVG(valencia)::numeric(10,1) as promedio_animo, COUNT(*) as total_registros FROM checkins_emocionales WHERE id_paciente = $1`, [patientId]);

        // E. Datos para Gráficas
        const checkinsData = await db.query(`SELECT valencia, fecha_hora FROM checkins_emocionales WHERE id_paciente = $1 ORDER BY fecha_hora ASC LIMIT 30`, [patientId]);
        
        // F. Datos de Tests
        const testsData = await db.query(`
            SELECT puntaje_total, tipo_test as nombre_escala, fecha_realizacion as fecha_completacion
            FROM resultados_tests
            WHERE id_paciente = $1 
            ORDER BY fecha_realizacion ASC LIMIT 10
        `, [patientId]);

        res.render('reports/patient-history', {
            title: `Expediente: ${patientRes.rows[0].nombre}`, 
            user: req.session.user,
            patient: patientRes.rows[0], 
            sessions: sessionsRes.rows, 
            reports: reports,
            moodStats: moodStats.rows[0] || { promedio_animo: 0, total_registros: 0 },
            
            // CORRECCIÓN AQUÍ: Enviamos las variables directas para que el EJS las encuentre
            checkins: checkinsData.rows, 
            tests: testsData.rows,
            
            // Y mantenemos graphData para el script de Chart.js
            graphData: {
                checkins: checkinsData.rows,
                tests: testsData.rows
            }
        });
    } catch (error) { 
        console.error(error); 
        res.status(500).render('error', { title: 'Error', message: 'Error cargando expediente', error, user: req.session.user }); 
    }
};

const getCreateReportForm = async (req, res) => {
    const patientId = req.params.id;
    try {
        const patientRes = await db.query(`SELECT p.id_paciente, u.nombre, u.apellido FROM Pacientes p JOIN Usuarios u ON p.id_usuario = u.id_usuario WHERE p.id_paciente = $1`, [patientId]);
        if (patientRes.rows.length === 0) return res.redirect('/dashboard');
        res.render('reports/create-progress', { title: 'Generar Reporte', user: req.session.user, patient: patientRes.rows[0], formData: {} });
    } catch (error) { res.redirect('/dashboard'); }
};

// GUARDAR REPORTE
const saveProgressReport = async (req, res) => {
    const { patientId, tipo_reporte, periodo_inicio, periodo_fin, resumen_evolucion, recomendaciones } = req.body;
    
    try {
        const tRes = await db.query('SELECT id_terapeuta FROM Terapeutas WHERE id_usuario = $1', [req.session.user.id_usuario]);
        if (tRes.rows.length === 0) throw new Error("Usuario no es terapeuta");
        
        const sesionesCount = await db.query(
            `SELECT COUNT(*) as total FROM Citas WHERE id_paciente = $1 AND estado = 'Completada' AND fecha_hora_inicio BETWEEN $2 AND $3`,
            [patientId, periodo_inicio, periodo_fin]
        );
        
        const metricas = {
            total_sesiones: parseInt(sesionesCount.rows[0].total),
            generado_por: "Sistema MindCare"
        };

        await db.query(
            `INSERT INTO reportes_progreso (id_paciente, id_terapeuta, tipo_reporte, periodo_inicio, periodo_fin, resumen_evolucion, metricas_principales, recomendaciones, firmado_por, fecha_firma) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
            [patientId, tRes.rows[0].id_terapeuta, tipo_reporte, periodo_inicio, periodo_fin, resumen_evolucion, JSON.stringify(metricas), recomendaciones, req.session.user.id_usuario]
        );

        res.redirect(`/reports/patient/${patientId}/view?msg=report_created`);
    } catch (error) { 
        console.error("Error creando reporte:", error);
        res.redirect(`/reports/patient/${patientId}/create-report?msg=error`); 
    }
};

// ACTUALIZAR NOTA SOAP
const updateSessionNote = async (req, res) => {
    const { sessionId, notas, patientId } = req.body;
    try {
        const result = await db.query(`UPDATE Sesiones_Terapia SET notas_terapeuta = $1, fecha_registro = NOW() WHERE id_cita = $2 RETURNING *`, [notas, sessionId]);
        
        if (result.rowCount === 0) {
            await db.query(`INSERT INTO Sesiones_Terapia (id_cita, notas_terapeuta, fecha_registro) VALUES ($1, $2, NOW())`, [sessionId, notas]);
        }
        
        res.redirect(`/reports/patient/${patientId}/view?msg=note_updated`);
    } catch (error) { 
        console.error("Error guardando nota:", error);
        res.redirect(`/reports/patient/${patientId}/view?msg=error`); 
    }
};

// ANALYTICS
const getAnalytics = async (req, res) => {
    const period = req.query.period || 'all';
    
    let userFilter = "";
    let citFilter = "";
    let chkFilter = "";

    if (period === 'week') {
        userFilter = "AND fecha_registro >= NOW() - INTERVAL '7 days'";
        citFilter = "AND fecha_hora_inicio >= NOW() - INTERVAL '7 days'";
        chkFilter = "AND fecha_hora >= NOW() - INTERVAL '7 days'";
    } else if (period === 'month') {
        userFilter = "AND fecha_registro >= NOW() - INTERVAL '1 month'";
        citFilter = "AND fecha_hora_inicio >= NOW() - INTERVAL '1 month'";
        chkFilter = "AND fecha_hora >= NOW() - INTERVAL '1 month'";
    }

    try {
        const stats = {
            usuarios: (await db.query(`SELECT COUNT(*) FROM Usuarios WHERE estado = true ${userFilter}`)).rows[0].count,
            citas: (await db.query(`SELECT COUNT(*) FROM Citas WHERE estado = 'Completada' ${citFilter}`)).rows[0].count,
            checkins: (await db.query(`SELECT COUNT(*) FROM Checkins_Emocionales WHERE 1=1 ${chkFilter}`)).rows[0].count,
            pacientes_activos: (await db.query("SELECT COUNT(*) FROM Pacientes WHERE estado_tratamiento = 'activo'")).rows[0].count
        };
        res.render('reports/analytics', { title: 'Analytics & Métricas', user: req.session.user, stats, period });
    } catch (error) { 
        res.status(500).render('error', { title: 'Error', message: 'Error analytics', error, user: req.session.user }); 
    }
};

module.exports = {
    getClinicalDashboard,
    getAnalytics,
    getPatientHistory,
    getCreateReportForm,
    saveProgressReport,
    updateSessionNote
};
const db = require('../config/database');

// ====================================================================
// 1. DASHBOARD CLÍNICO (CENTRO DE COMANDO TIPO TESIS) 🏥
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
            
            // A. KPIs (CORREGIDO: Usamos JOIN para no depender de 'id_autor')
            db.query(`
                SELECT 
                    (SELECT COUNT(*) FROM Pacientes WHERE id_terapeuta = $1 AND estado_tratamiento = 'activo') as pacientes_activos,
                    (SELECT COUNT(*) 
                     FROM reportes_progreso r 
                     JOIN Pacientes p ON r.id_paciente = p.id_paciente 
                     WHERE p.id_terapeuta = $1 
                     AND r.fecha_generacion > NOW() - INTERVAL '30 days') as reportes_mes,
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

            // C. AGENDA INTELIGENTE (CITAS DE HOY)
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
        // Enviamos un mensaje de error amigable en lugar de crashear
        res.status(500).render('error', { title: 'Error', message: 'Error cargando el panel clínico. Contacte soporte.', error, user: req.session.user });
    }
};

// ====================================================================
// 2. FUNCIONES DE APOYO
// ====================================================================

const getAnalytics = async (req, res) => {
    const period = req.query.period || 'all';
    try {
        const statsQuery = `SELECT (SELECT COUNT(*) FROM Usuarios WHERE fecha_registro > NOW() - INTERVAL '30 days') as nuevos_usuarios, (SELECT COUNT(*) FROM Citas WHERE estado = 'Completada') as citas_completadas, (SELECT COUNT(*) FROM checkins_emocionales) as total_checkins, (SELECT COUNT(*) FROM Pacientes WHERE estado_tratamiento = 'activo') as pacientes_activos`;
        const statsRes = await db.query(statsQuery);
        const distRes = await db.query(`SELECT estado, COUNT(*) as cantidad FROM Citas GROUP BY estado`);
        
        res.render('reports/analytics', {
            title: 'Analytics & Métricas', user: req.session.user,
            stats: { usuarios: statsRes.rows[0].nuevos_usuarios, citas: statsRes.rows[0].citas_completadas, checkins: statsRes.rows[0].total_checkins, pacientes_activos: statsRes.rows[0].pacientes_activos },
            period: period, distribution: distRes.rows
        });
    } catch (error) { res.status(500).render('error', { title: 'Error', message: 'Error analytics', error, user: req.session.user }); }
};

const getPatientHistory = async (req, res) => {
    const patientId = req.params.id;
    try {
        const patientRes = await db.query(`SELECT p.*, u.nombre, u.apellido, u.email, u.telefono, u.foto_perfil, u.ultimo_login, u.fecha_registro FROM Pacientes p JOIN Usuarios u ON p.id_usuario = u.id_usuario WHERE p.id_paciente = $1`, [patientId]);
        if (patientRes.rows.length === 0) return res.redirect('/dashboard/clinical');
        
        const sessionsRes = await db.query(`SELECT id_cita, fecha_hora_inicio, modalidad, estado, notas_admin as notas_terapeuta, CASE WHEN estado = 'Completada' THEN 'excelente' ELSE 'regular' END as calidad_sesion FROM Citas WHERE id_paciente = $1 AND fecha_hora_inicio < NOW() ORDER BY fecha_hora_inicio DESC`, [patientId]);
        
        let reports = [];
        try { const r = await db.query(`SELECT * FROM reportes_progreso WHERE id_paciente = $1 ORDER BY fecha_generacion DESC`, [patientId]); reports = r.rows; } catch (e) {}

        const moodStats = await db.query(`SELECT AVG(valencia)::numeric(10,1) as promedio_animo, COUNT(*) as total_registros FROM checkins_emocionales WHERE id_paciente = $1`, [patientId]);

        // CORRECCIÓN VITAL: Traemos los datos para las gráficas para evitar "checkins is not defined"
        const checkinsData = await db.query(`SELECT valencia, fecha_hora FROM checkins_emocionales WHERE id_paciente = $1 ORDER BY fecha_hora DESC LIMIT 30`, [patientId]);
        
        const testsData = await db.query(`
            SELECT r.puntuacion_total, t.nombre_escala, r.fecha_completacion 
            FROM resultados_escalas r 
            JOIN escalas_asignadas a ON r.id_asignacion = a.id_asignacion 
            JOIN tipos_escala t ON a.id_tipo_escala = t.id_tipo_escala 
            WHERE a.id_paciente = $1 
            ORDER BY r.fecha_completacion DESC LIMIT 10
        `, [patientId]);

        res.render('reports/patient-history', {
            title: `Expediente: ${patientRes.rows[0].nombre}`, 
            user: req.session.user,
            patient: patientRes.rows[0], 
            sessions: sessionsRes.rows, 
            reports: reports,
            moodStats: moodStats.rows[0] || { promedio_animo: 0, total_registros: 0 },
            checkins: checkinsData.rows, // <--- AHORA SÍ EXISTE
            tests: testsData.rows        // <--- AHORA SÍ EXISTE
        });
    } catch (error) { 
        console.error(error); 
        res.status(500).render('error', { title: 'Error', message: 'Error expediente', error, user: req.session.user }); 
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

const saveProgressReport = async (req, res) => {
    const { patientId, tipo_reporte, periodo_inicio, periodo_fin, resumen_evolucion, recomendaciones } = req.body;
    try {
        await db.query(`CREATE TABLE IF NOT EXISTS reportes_progreso (id_reporte SERIAL PRIMARY KEY, id_paciente INT, tipo_reporte VARCHAR(50), periodo_inicio DATE, periodo_fin DATE, resumen_evolucion TEXT, recomendaciones TEXT, fecha_generacion TIMESTAMP DEFAULT NOW())`);
        await db.query(`INSERT INTO reportes_progreso (id_paciente, tipo_reporte, periodo_inicio, periodo_fin, resumen_evolucion, recomendaciones) VALUES ($1, $2, $3, $4, $5, $6)`, [patientId, tipo_reporte, periodo_inicio, periodo_fin, resumen_evolucion, recomendaciones]);
        res.redirect(`/reports/patient/${patientId}/view?msg=report_created`);
    } catch (error) { res.redirect(`/reports/patient/${patientId}/create-report?msg=error`); }
};

const updateSessionNote = async (req, res) => {
    const { sessionId, notas, patientId } = req.body;
    try {
        await db.query(`UPDATE Citas SET notas_admin = $1 WHERE id_cita = $2`, [notas, sessionId]);
        res.redirect(`/reports/patient/${patientId}/view?msg=note_updated`);
    } catch (error) { res.redirect(`/reports/patient/${patientId}/view?msg=error`); }
};

module.exports = {
    getClinicalDashboard,
    getAnalytics,
    getPatientHistory,
    getCreateReportForm,
    saveProgressReport,
    updateSessionNote
};
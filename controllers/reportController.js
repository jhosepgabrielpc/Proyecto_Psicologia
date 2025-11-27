const db = require('../config/database');

// ====================================================================
// 1. ANALYTICS GLOBAL (VISTA EJECUTIVA)
// ====================================================================
const getAnalytics = async (req, res) => {
    const period = req.query.period || 'all'; // week, month, year, all

    try {
        // A. KPIs GENERALES (Contadores en tiempo real)
        // Calculamos: Total Usuarios, Citas Exitosas, Check-ins Totales, Pacientes Activos
        const statsQuery = `
            SELECT 
                (SELECT COUNT(*) FROM Usuarios WHERE fecha_registro > NOW() - INTERVAL '30 days') as nuevos_usuarios,
                (SELECT COUNT(*) FROM Citas WHERE estado = 'Completada') as citas_completadas,
                (SELECT COUNT(*) FROM checkins_emocionales) as total_checkins,
                (SELECT COUNT(*) FROM Pacientes WHERE estado_tratamiento = 'activo') as pacientes_activos
        `;
        const statsRes = await db.query(statsQuery);

        // B. DATOS PARA GRÁFICAS (DISTRIBUCIÓN)
        // Agrupamos citas por estado para ver efectividad
        const distributionQuery = `
            SELECT estado, COUNT(*) as cantidad 
            FROM Citas 
            GROUP BY estado
        `;
        const distRes = await db.query(distributionQuery);

        res.render('reports/analytics', {
            title: 'Analytics & Métricas',
            user: req.session.user,
            stats: {
                usuarios: statsRes.rows[0].nuevos_usuarios,
                citas: statsRes.rows[0].citas_completadas,
                checkins: statsRes.rows[0].total_checkins,
                pacientes_activos: statsRes.rows[0].pacientes_activos
            },
            period: period,
            distribution: distRes.rows
        });

    } catch (error) {
        console.error('Error Analytics:', error);
        res.status(500).render('error', { title: 'Error', message: 'Error cargando analytics', error, user: req.session.user });
    }
};

// ====================================================================
// 2. EXPEDIENTE CLÍNICO COMPLETO (LA VISTA DE RENAN)
// ====================================================================
const getPatientHistory = async (req, res) => {
    const patientId = req.params.id;

    try {
        // A. DATOS PERSONALES Y DE ACCESO (INTEGRACIÓN CON LOGIN)
        // Traemos 'ultimo_login' para saber si el paciente usa el sistema
        const patientQuery = `
            SELECT p.*, u.nombre, u.apellido, u.email, u.telefono, u.foto_perfil, u.ultimo_login, u.fecha_registro
            FROM Pacientes p
            JOIN Usuarios u ON p.id_usuario = u.id_usuario
            WHERE p.id_paciente = $1
        `;
        const patientRes = await db.query(patientQuery, [patientId]);
        
        if (patientRes.rows.length === 0) return res.redirect('/dashboard/therapist');
        const patient = patientRes.rows[0];

        // B. HISTORIAL DE SESIONES (INTEGRACIÓN CON ALAN)
        // Traemos todas las citas pasadas con las notas del terapeuta
        const sessionsQuery = `
            SELECT id_cita, fecha_hora_inicio, modalidad, estado, notas_admin as notas_terapeuta, 
                   CASE WHEN estado = 'Completada' THEN 'excelente' ELSE 'regular' END as calidad_sesion
            FROM Citas
            WHERE id_paciente = $1 AND fecha_hora_inicio < NOW()
            ORDER BY fecha_hora_inicio DESC
        `;
        const sessionsRes = await db.query(sessionsQuery, [patientId]);

        // C. REPORTES GENERADOS (HISTORIAL DE DOCUMENTOS)
        // Asumiendo una tabla 'reportes_progreso'
        // Si no existe la tabla aún, esto devolverá array vacío (manejamos el error en try/catch si quieres)
        let reports = [];
        try {
            const reportsRes = await db.query(`
                SELECT * FROM reportes_progreso WHERE id_paciente = $1 ORDER BY fecha_generacion DESC
            `, [patientId]);
            reports = reportsRes.rows;
        } catch (e) {
            console.warn("Tabla reportes_progreso aún no creada, enviando array vacío.");
        }

        // D. INTEGRACIÓN CON JHOSEP (RESUMEN BIOMÉTRICO)
        // Calculamos el promedio de ánimo histórico para mostrarlo en el expediente
        const moodStats = await db.query(`
            SELECT AVG(valencia)::numeric(10,1) as promedio_animo, COUNT(*) as total_registros 
            FROM checkins_emocionales WHERE id_paciente = $1
        `, [patientId]);

        res.render('reports/patient-history', {
            title: `Expediente: ${patient.nombre} ${patient.apellido}`,
            user: req.session.user,
            patient: patient,
            sessions: sessionsRes.rows,
            reports: reports,
            moodStats: moodStats.rows[0] || { promedio_animo: 0, total_registros: 0 }
        });

    } catch (error) {
        console.error('Error cargando expediente:', error);
        res.status(500).render('error', { title: 'Error', message: 'Error cargando expediente', error, user: req.session.user });
    }
};

// ====================================================================
// 3. FORMULARIO DE NUEVO REPORTE (GET)
// ====================================================================
const getCreateReportForm = async (req, res) => {
    const patientId = req.params.id;
    try {
        const patientRes = await db.query(`
            SELECT p.id_paciente, u.nombre, u.apellido 
            FROM Pacientes p JOIN Usuarios u ON p.id_usuario = u.id_usuario 
            WHERE p.id_paciente = $1
        `, [patientId]);
        
        if (patientRes.rows.length === 0) return res.redirect('/dashboard');

        res.render('reports/create-progress', {
            title: 'Generar Reporte',
            user: req.session.user,
            patient: patientRes.rows[0],
            formData: {}
        });
    } catch (error) {
        console.error(error);
        res.redirect('/dashboard');
    }
};

// ====================================================================
// 4. GUARDAR REPORTE DE PROGRESO (POST)
// ====================================================================
const saveProgressReport = async (req, res) => {
    const { patientId, tipo_reporte, periodo_inicio, periodo_fin, resumen_evolucion, recomendaciones } = req.body;
    const terapeutaId = req.session.user.id_usuario; // Asumimos que el usuario logueado lo crea

    try {
        // Verificar si existe la tabla, si no, crearla al vuelo (Modo Desarrollo Rápido)
        await db.query(`
            CREATE TABLE IF NOT EXISTS reportes_progreso (
                id_reporte SERIAL PRIMARY KEY,
                id_paciente INT,
                id_autor INT,
                tipo_reporte VARCHAR(50),
                periodo_inicio DATE,
                periodo_fin DATE,
                resumen_evolucion TEXT,
                recomendaciones TEXT,
                fecha_generacion TIMESTAMP DEFAULT NOW()
            )
        `);

        await db.query(`
            INSERT INTO reportes_progreso 
            (id_paciente, id_autor, tipo_reporte, periodo_inicio, periodo_fin, resumen_evolucion, recomendaciones)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [patientId, terapeutaId, tipo_reporte, periodo_inicio, periodo_fin, resumen_evolucion, recomendaciones]);

        res.redirect(`/reports/patient/${patientId}/view?msg=report_created`);

    } catch (error) {
        console.error('Error guardando reporte:', error);
        res.redirect(`/reports/patient/${patientId}/create-report?msg=error`);
    }
};

// ====================================================================
// 5. ACTUALIZAR NOTA DE SESIÓN (POST RÁPIDO)
// ====================================================================
const updateSessionNote = async (req, res) => {
    const { sessionId, notas, patientId } = req.body;
    
    try {
        // Actualizamos la tabla de Citas (Módulo de Alan) desde el Módulo de Renan
        // Esto demuestra integración entre módulos
        await db.query(`
            UPDATE Citas 
            SET notas_admin = $1 
            WHERE id_cita = $2
        `, [notas, sessionId]);

        res.redirect(`/reports/patient/${patientId}/view?msg=note_updated`);

    } catch (error) {
        console.error('Error actualizando nota:', error);
        res.redirect(`/reports/patient/${patientId}/view?msg=error`);
    }
};

// ====================================================================
const getClinicalDashboard = async (req, res) => {
    const userId = req.session.user.id_usuario;

    try {
        // A. KPIs CLÍNICOS (Resumen rápido para Renan)
        const statsQuery = `
            SELECT 
                (SELECT COUNT(*) FROM Pacientes WHERE estado_tratamiento = 'activo') as pacientes_activos,
                (SELECT COUNT(*) FROM reportes_progreso WHERE fecha_generacion > NOW() - INTERVAL '30 days') as reportes_mes,
                (SELECT COUNT(*) FROM Citas WHERE estado = 'Completada') as sesiones_totales
        `;
        const statsRes = await db.query(statsQuery);

        // B. DIRECTORIO DE PACIENTES (La lista maestra)
        // Traemos datos clave: Última visita, Diagnóstico (si hubiera), Estado
        const directoryQuery = `
            SELECT 
                p.id_paciente, 
                u.nombre, u.apellido, u.email, u.foto_perfil,
                p.estado_tratamiento,
                (SELECT fecha_hora_inicio FROM Citas WHERE id_paciente = p.id_paciente AND estado = 'Completada' ORDER BY fecha_hora_inicio DESC LIMIT 1) as ultima_sesion,
                (SELECT COUNT(*) FROM reportes_progreso WHERE id_paciente = p.id_paciente) as total_reportes
            FROM Pacientes p
            JOIN Usuarios u ON p.id_usuario = u.id_usuario
            ORDER BY u.apellido ASC
        `;
        const directoryRes = await db.query(directoryQuery);

        res.render('dashboard/clinical', {
            title: 'Dirección Clínica',
            user: req.session.user,
            stats: statsRes.rows[0],
            patients: directoryRes.rows
        });

    } catch (error) {
        console.error('Error Dashboard Clínico:', error);
        res.status(500).render('error', { title: 'Error', message: 'Error cargando panel clínico', error, user: req.session.user });
    }
};

module.exports = {
  getClinicalDashboard, // <--- ¡AGREGAR ESTO!
    getAnalytics,
    getPatientHistory,
    getCreateReportForm,
    saveProgressReport,
    updateSessionNote
};
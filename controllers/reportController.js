const db = require('../config/database');

// ====================================================================
// 1. DASHBOARD DE HISTORIAL (Lista de Pacientes)
// ====================================================================
const renderHistoryDashboard = async (req, res) => {
  try {
    const idUsuario = req.session.user.id_usuario; 
    
    // Buscar el ID de terapeuta asociado al usuario logueado
    const therapistResult = await db.query('SELECT id_terapeuta FROM Terapeutas WHERE id_usuario = $1', [idUsuario]);
    
    let patients = [];

    if (therapistResult.rows.length > 0) {
      const idTerapeuta = therapistResult.rows[0].id_terapeuta;
      
      // Traer pacientes y contar sus sesiones completadas
      const result = await db.query(`
        SELECT p.id_paciente, u.nombre, u.apellido, u.foto_perfil, u.email,
               p.estado_tratamiento, p.fecha_inicio_tratamiento,
               (SELECT COUNT(*) FROM Citas c WHERE c.id_paciente = p.id_paciente AND c.estado = 'completada') as sesiones_completadas
        FROM Pacientes p
        JOIN Usuarios u ON p.id_usuario = u.id_usuario
        WHERE p.id_terapeuta = $1
      `, [idTerapeuta]);
      patients = result.rows;
    }

    res.render('dashboard/history', {
      title: 'Gestión de Historiales',
      user: req.session.user,
      patients: patients
    });
  } catch (error) {
    console.error("Error en renderHistoryDashboard:", error);
    res.status(500).render('error', { message: 'Error cargando dashboard', user: req.session.user, error });
  }
};

// ====================================================================
// 2. EXPEDIENTE CLÍNICO DETALLADO (El núcleo del Módulo E)
// ====================================================================
const renderPatientHistoryView = async (req, res) => {
  try {
    const { patientId } = req.params;

    // A. Datos del Paciente
    const patientData = await db.query(`
      SELECT p.*, u.nombre, u.apellido, u.email, u.telefono, u.fecha_nacimiento, u.foto_perfil, u.direccion
      FROM Pacientes p
      JOIN Usuarios u ON p.id_usuario = u.id_usuario
      WHERE p.id_paciente = $1
    `, [patientId]);

    if (patientData.rows.length === 0) {
        return res.status(404).render('error', { message: 'Paciente no encontrado', user: req.session.user, error: { status: 404 } });
    }

    // B. Línea de Tiempo (Sesiones + Notas)
    const sessions = await db.query(`
      SELECT c.id_cita, c.fecha_hora as fecha_hora_inicio, 
             COALESCE(c.enlace_videollamada, 'Presencial') as modalidad, 
             'Consulta' as tipo_consulta,
             st.notas_terapeuta, st.objetivos_trabajados, st.calidad_sesion, st.tareas_asignadas
      FROM Citas c
      LEFT JOIN Sesiones_Terapia st ON c.id_cita = st.id_cita
      WHERE c.id_paciente = $1 AND c.estado = 'completada'
      ORDER BY c.fecha_hora DESC
    `, [patientId]);

    // C. Reportes Generados
    const reports = await db.query(`
      SELECT id_reporte, tipo_reporte, periodo_inicio, periodo_fin, fecha_generacion, resumen_evolucion
      FROM Reportes_Progreso
      WHERE id_paciente = $1
      ORDER BY fecha_generacion DESC
    `, [patientId]);

    // --- [NUEVO] D. DATOS PARA GRÁFICAS DE EVOLUCIÓN ---
    // 1. Historial de Ánimo (Check-ins)
    const checkins = await db.query(`
        SELECT fecha_hora, valencia, emocion_principal 
        FROM Checkins_Emocionales 
        WHERE id_paciente = $1 
        ORDER BY fecha_hora ASC 
    `, [patientId]);

    // 2. Historial de Tests Psicométricos (PHQ-9, GAD-7)
    // Nota: Usamos las tablas correctas Resultados_Escalas y Tipos_Escala
    const tests = await db.query(`
        SELECT re.puntuacion_total, re.fecha_completacion, te.nombre_escala
        FROM Resultados_Escalas re
        JOIN Escalas_Asignadas ea ON re.id_asignacion = ea.id_asignacion
        JOIN Tipos_Escala te ON ea.id_tipo_escala = te.id_tipo_escala
        WHERE ea.id_paciente = $1
        ORDER BY re.fecha_completacion ASC
    `, [patientId]);

    // Renderizar vista pasando TODO el paquete de datos
    res.render('reports/patient-history', {
      title: `Historial - ${patientData.rows[0].nombre}`,
      user: req.session.user,
      patient: patientData.rows[0],
      sessions: sessions.rows,
      reports: reports.rows,
      // Inyectamos los datos para Chart.js
      graphData: {
          checkins: checkins.rows,
          tests: tests.rows
      }
    });

  } catch (error) {
    console.error("Error en renderPatientHistoryView:", error);
    res.status(500).render('error', { message: 'Error cargando historial.', user: req.session.user, error });
  }
};

// ====================================================================
// 3. FORMULARIO DE REPORTE
// ====================================================================
const renderCreateProgressView = async (req, res) => {
  try {
    const { patientId } = req.params;
    const patient = await db.query(`
        SELECT p.id_paciente, u.nombre, u.apellido 
        FROM Pacientes p JOIN Usuarios u ON p.id_usuario = u.id_usuario 
        WHERE p.id_paciente = $1`, [patientId]);

    res.render('reports/create-progress', {
      title: 'Nuevo Reporte de Progreso',
      user: req.session.user,
      patient: patient.rows[0]
    });
  } catch (error) {
    res.status(500).render('error', { message: 'Error cargando formulario', user: req.session.user, error });
  }
};

// ====================================================================
// 4. GUARDAR REPORTE DE PROGRESO (Generación Técnica)
// ====================================================================
const generateProgressReport = async (req, res) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const { patientId, tipo_reporte, periodo_inicio, periodo_fin, resumen_evolucion, recomendaciones } = req.body;

    // Obtener ID Terapeuta
    const tRes = await client.query('SELECT id_terapeuta FROM Terapeutas WHERE id_usuario = $1', [req.session.user.id_usuario]);
    if (tRes.rows.length === 0) throw new Error('Usuario no es terapeuta');
    const idTerapeuta = tRes.rows[0].id_terapeuta;

    // Calcular métricas automáticas (KPIs del reporte)
    const sessionsCount = await client.query(
      `SELECT COUNT(*) as total FROM Citas
       WHERE id_paciente = $1 AND estado = 'completada' AND fecha_hora BETWEEN $2 AND $3`,
      [patientId, periodo_inicio, periodo_fin]
    );

    const metricas = {
      total_sesiones: parseInt(sessionsCount.rows[0].total),
      generado_por: "Sistema MindCare"
    };

    // Guardar en BD
    await client.query(
      `INSERT INTO Reportes_Progreso (id_paciente, id_terapeuta, tipo_reporte, periodo_inicio, periodo_fin, resumen_evolucion, metricas_principales, recomendaciones, firmado_por, fecha_firma)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
      [patientId, idTerapeuta, tipo_reporte, periodo_inicio, periodo_fin, resumen_evolucion, JSON.stringify(metricas), recomendaciones, req.session.user.id_usuario]
    );

    await client.query('COMMIT');
    res.redirect(`/reports/patient/${patientId}/view`);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error guardando reporte:', error);
    res.status(500).render('error', { message: 'Error al generar reporte', user: req.session.user, error });
  } finally {
    client.release();
  }
};

// ====================================================================
// 5. ANALYTICS DASHBOARD (Admin)
// ====================================================================
const renderAnalyticsDashboard = async (req, res) => {
    try {
        const { period } = req.query;
        
        // Filtros SQL básicos
        let dateFilter = ""; 
        if (period === 'week') dateFilter = "AND fecha_registro >= NOW() - INTERVAL '7 days'";
        else if (period === 'month') dateFilter = "AND fecha_registro >= NOW() - INTERVAL '1 month'";
        else if (period === 'year') dateFilter = "AND fecha_registro >= NOW() - INTERVAL '1 year'";

        // Filtros para fechas de eventos (citas, checkins)
        let eventFilter = "";
        if (period === 'week') eventFilter = "AND fecha_hora >= NOW() - INTERVAL '7 days'";
        else if (period === 'month') eventFilter = "AND fecha_hora >= NOW() - INTERVAL '1 month'";
        else if (period === 'year') eventFilter = "AND fecha_hora >= NOW() - INTERVAL '1 year'";

        const stats = {
            usuarios: (await db.query(`SELECT COUNT(*) FROM Usuarios WHERE estado = true ${dateFilter}`)).rows[0].count,
            citas: (await db.query(`SELECT COUNT(*) FROM Citas WHERE estado = 'completada' ${eventFilter}`)).rows[0].count,
            checkins: (await db.query(`SELECT COUNT(*) FROM Checkins_Emocionales WHERE 1=1 ${eventFilter}`)).rows[0].count,
            pacientes_activos: (await db.query("SELECT COUNT(*) FROM Pacientes WHERE estado_tratamiento = 'activo'")).rows[0].count
        };

        res.render('reports/analytics', {
            title: 'Analytics & Reportes',
            user: req.session.user,
            stats: stats,
            period: period || 'all'
        });
    } catch (error) {
        console.error("Error analytics:", error);
        res.status(500).render('error', { message: 'Error cargando analytics', user: req.session.user, error });
    }
};

// ====================================================================
// 6. GUARDAR NOTA SOAP (Actualización)
// ====================================================================
const updateSessionNote = async (req, res) => {
    try {
        const { sessionId, patientId, notas } = req.body;
        
        if (req.session.user.nombre_rol !== 'Terapeuta') {
            return res.status(403).send('Acceso denegado');
        }

        await db.query(
            `UPDATE Sesiones_Terapia SET notas_terapeuta = $1, fecha_registro = NOW() WHERE id_cita = $2`,
            [notas, sessionId]
        );
        
        res.redirect(`/reports/patient/${patientId}/view`);

    } catch (error) {
        console.error("Error actualizando nota:", error);
        res.redirect('back');
    }
};

// APIs JSON Auxiliares
const getPlatformAnalytics = async (req, res) => { res.json({ status: "ok" }); };
const getAuditLog = async (req, res) => { res.json({ status: "ok" }); };

module.exports = {
  renderHistoryDashboard,
  renderPatientHistoryView,
  renderCreateProgressView,
  renderAnalyticsDashboard,
  generateProgressReport,
  updateSessionNote,
  getPlatformAnalytics,
  getAuditLog
};
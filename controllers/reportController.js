const db = require('../config/database');

const getPatientClinicalHistory = async (req, res) => {
  try {
    const { patientId } = req.params;

    const history = await db.query(
      `SELECT hc.*, u.nombre || ' ' || u.apellido as terapeuta_nombre
       FROM Historial_Clinico hc
       JOIN Terapeutas t ON hc.id_terapeuta = t.id_terapeuta
       JOIN Usuarios u ON t.id_usuario = u.id_usuario
       WHERE hc.id_paciente = $1
       ORDER BY hc.fecha_registro DESC`,
      [patientId]
    );

    res.json({ clinicalHistory: history.rows });

  } catch (error) {
    console.error('Error obteniendo historial clínico:', error);
    res.status(500).json({ error: 'Error al obtener historial clínico' });
  }
};

const generateProgressReport = async (req, res) => {
  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    const { patientId, tipo_reporte, periodo_inicio, periodo_fin, resumen_evolucion, recomendaciones } = req.body;

    const therapistResult = await client.query(
      'SELECT id_terapeuta FROM Terapeutas WHERE id_usuario = $1',
      [req.user.id_usuario]
    );

    if (therapistResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Solo los terapeutas pueden generar reportes' });
    }

    const idTerapeuta = therapistResult.rows[0].id_terapeuta;

    const checkInsCount = await client.query(
      `SELECT COUNT(*) as total FROM Checkins_Emocionales
       WHERE id_paciente = $1 AND fecha_registro BETWEEN $2 AND $3`,
      [patientId, periodo_inicio, periodo_fin]
    );

    const scalesCount = await client.query(
      `SELECT COUNT(*) as total, AVG(puntuacion_total) as promedio
       FROM Resultados_Escalas re
       JOIN Escalas_Asignadas ea ON re.id_asignacion = ea.id_asignacion
       WHERE ea.id_paciente = $1 AND re.fecha_completacion BETWEEN $2 AND $3`,
      [patientId, periodo_inicio, periodo_fin]
    );

    const sessionsCount = await client.query(
      `SELECT COUNT(*) as total FROM Sesiones_Terapia st
       JOIN Citas c ON st.id_cita = c.id_cita
       WHERE c.id_paciente = $1 AND c.fecha_hora_inicio BETWEEN $2 AND $3`,
      [patientId, periodo_inicio, periodo_fin]
    );

    const metricas = {
      total_checkins: parseInt(checkInsCount.rows[0].total),
      total_escalas: parseInt(scalesCount.rows[0].total),
      promedio_escalas: parseFloat(scalesCount.rows[0].promedio) || 0,
      total_sesiones: parseInt(sessionsCount.rows[0].total)
    };

    const reportResult = await client.query(
      `INSERT INTO Reportes_Progreso (id_paciente, id_terapeuta, tipo_reporte, periodo_inicio, periodo_fin, resumen_evolucion, metricas_principales, recomendaciones, firmado_por, fecha_firma)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()) RETURNING *`,
      [patientId, idTerapeuta, tipo_reporte, periodo_inicio, periodo_fin, resumen_evolucion, JSON.stringify(metricas), recomendaciones, req.user.id_usuario]
    );

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Reporte de progreso generado exitosamente',
      report: reportResult.rows[0]
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error generando reporte:', error);
    res.status(500).json({ error: 'Error al generar reporte de progreso' });
  } finally {
    client.release();
  }
};

const getProgressReports = async (req, res) => {
  try {
    const { patientId } = req.params;

    const reports = await db.query(
      `SELECT rp.*, u.nombre || ' ' || u.apellido as terapeuta_nombre
       FROM Reportes_Progreso rp
       JOIN Terapeutas t ON rp.id_terapeuta = t.id_terapeuta
       JOIN Usuarios u ON t.id_usuario = u.id_usuario
       WHERE rp.id_paciente = $1
       ORDER BY rp.fecha_generacion DESC`,
      [patientId]
    );

    res.json({ reports: reports.rows });

  } catch (error) {
    console.error('Error obteniendo reportes de progreso:', error);
    res.status(500).json({ error: 'Error al obtener reportes de progreso' });
  }
};

const getPlatformAnalytics = async (req, res) => {
  try {
    const { startDate, endDate, tipo } = req.query;

    let query;
    if (tipo) {
      query = `
        SELECT * FROM Analytics_Plataforma
        WHERE fecha BETWEEN $1 AND $2 AND tipo_analytics = $3
        ORDER BY fecha DESC
      `;
    } else {
      query = `
        SELECT * FROM Analytics_Plataforma
        WHERE fecha BETWEEN $1 AND $2
        ORDER BY fecha DESC
      `;
    }

    const params = tipo ? [startDate, endDate, tipo] : [startDate, endDate];
    const result = await db.query(query, params);

    const totalUsers = await db.query('SELECT COUNT(*) as total FROM Usuarios WHERE estado = true');
    const totalPatients = await db.query('SELECT COUNT(*) as total FROM Pacientes WHERE estado_tratamiento = \'activo\'');
    const totalTherapists = await db.query('SELECT COUNT(*) as total FROM Terapeutas WHERE estado_verificacion = \'aprobado\'');
    const totalAppointments = await db.query('SELECT COUNT(*) as total FROM Citas WHERE estado = \'completada\'');

    res.json({
      analytics: result.rows,
      summary: {
        total_usuarios: parseInt(totalUsers.rows[0].total),
        total_pacientes_activos: parseInt(totalPatients.rows[0].total),
        total_terapeutas: parseInt(totalTherapists.rows[0].total),
        total_citas_completadas: parseInt(totalAppointments.rows[0].total)
      }
    });

  } catch (error) {
    console.error('Error obteniendo analytics:', error);
    res.status(500).json({ error: 'Error al obtener analytics de la plataforma' });
  }
};

const getAuditLog = async (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.query;

    const result = await db.query(
      `SELECT a.*, u.nombre || ' ' || u.apellido as usuario_nombre
       FROM Auditoria_Sistema a
       LEFT JOIN Usuarios u ON a.id_usuario = u.id_usuario
       ORDER BY a.fecha_evento DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const totalCount = await db.query('SELECT COUNT(*) as total FROM Auditoria_Sistema');

    res.json({
      auditLog: result.rows,
      total: parseInt(totalCount.rows[0].total),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

  } catch (error) {
    console.error('Error obteniendo log de auditoría:', error);
    res.status(500).json({ error: 'Error al obtener log de auditoría' });
  }
};

module.exports = {
  getPatientClinicalHistory,
  generateProgressReport,
  getProgressReports,
  getPlatformAnalytics,
  getAuditLog
};
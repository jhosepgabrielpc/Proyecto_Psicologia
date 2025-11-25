const db = require('../config/database');

// --- MÉTODOS DE RENDERIZADO (Vistas) ---

// 1. Dashboard de Historial: Lista de pacientes del terapeuta
const renderHistoryDashboard = async (req, res) => {
  try {
    const idUsuario = req.session.user.id_usuario; 
    
    const therapistResult = await db.query('SELECT id_terapeuta FROM Terapeutas WHERE id_usuario = $1', [idUsuario]);
    
    let patients = [];

    if (therapistResult.rows.length > 0) {
      const idTerapeuta = therapistResult.rows[0].id_terapeuta;
      
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
    res.status(500).render('error', { 
        message: 'Error cargando dashboard de historial', 
        user: req.session.user,
        error: error // Importante para evitar ReferenceError en la vista
    });
  }
};

// 2. Vista Detallada del Historial Clínico de un Paciente
const renderPatientHistoryView = async (req, res) => {
  try {
    const { patientId } = req.params;

    // A. Datos del Paciente
    const patientData = await db.query(`
      SELECT p.*, u.nombre, u.apellido, u.email, u.telefono, u.fecha_nacimiento, u.foto_perfil,
             u.direccion
      FROM Pacientes p
      JOIN Usuarios u ON p.id_usuario = u.id_usuario
      WHERE p.id_paciente = $1
    `, [patientId]);

    if (patientData.rows.length === 0) {
        return res.status(404).render('error', { 
            message: 'Paciente no encontrado', 
            user: req.session.user,
            error: { status: 404 }
        });
    }

    // B. Sesiones (CORREGIDO: Usando nombres de columnas reales de tu BD)
    // Se cambió 'fecha_hora_inicio' por 'fecha_hora'
    // Se simula 'modalidad' y 'tipo_consulta' si no existen, o se usa enlace
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

    // C. Reportes de Progreso existentes
    const reports = await db.query(`
      SELECT id_reporte, tipo_reporte, periodo_inicio, periodo_fin, fecha_generacion, resumen_evolucion
      FROM Reportes_Progreso
      WHERE id_paciente = $1
      ORDER BY fecha_generacion DESC
    `, [patientId]);

    res.render('reports/patient-history', {
      title: `Historial - ${patientData.rows[0].nombre}`,
      user: req.session.user,
      patient: patientData.rows[0],
      sessions: sessions.rows,
      reports: reports.rows
    });

  } catch (error) {
    console.error("Error en renderPatientHistoryView:", error);
    res.status(500).render('error', { 
        message: 'Error cargando historial del paciente. Detalles en consola.', 
        user: req.session.user,
        error: error 
    });
  }
};

// 3. Renderizar formulario para crear nuevo Reporte de Progreso
const renderCreateProgressView = async (req, res) => {
  try {
    const { patientId } = req.params;
    const patient = await db.query(`
        SELECT p.id_paciente, u.nombre, u.apellido 
        FROM Pacientes p JOIN Usuarios u ON p.id_usuario = u.id_usuario 
        WHERE p.id_paciente = $1`, [patientId]);

    if (patient.rows.length === 0) {
        throw new Error('Paciente no encontrado');
    }

    res.render('reports/create-progress', {
      title: 'Nuevo Reporte de Progreso',
      user: req.session.user,
      patient: patient.rows[0]
    });
  } catch (error) {
    console.error("Error en renderCreateProgressView:", error);
    res.status(500).render('error', { 
        message: 'Error al cargar formulario', 
        user: req.session.user,
        error: error
    });
  }
};

// 4. Renderizar Analytics Dashboard (Admin)
const renderAnalyticsDashboard = async (req, res) => {
    try {
        const { period } = req.query;
        
        // Filtros de fecha para SQL
        // Usamos 'fecha_registro' para usuarios, 'fecha_hora' para citas/checkins
        
        let userFilter = "";
        let citFilter = "";
        let chkFilter = "";

        if (period === 'week') {
            userFilter = "AND fecha_registro >= NOW() - INTERVAL '7 days'";
            citFilter = "AND fecha_hora >= NOW() - INTERVAL '7 days'";
            chkFilter = "AND fecha_hora >= NOW() - INTERVAL '7 days'";
        } else if (period === 'month') {
            userFilter = "AND fecha_registro >= NOW() - INTERVAL '1 month'";
            citFilter = "AND fecha_hora >= NOW() - INTERVAL '1 month'";
            chkFilter = "AND fecha_hora >= NOW() - INTERVAL '1 month'";
        } else if (period === 'year') {
            userFilter = "AND fecha_registro >= NOW() - INTERVAL '1 year'";
            citFilter = "AND fecha_hora >= NOW() - INTERVAL '1 year'";
            chkFilter = "AND fecha_hora >= NOW() - INTERVAL '1 year'";
        }

        const stats = {
            usuarios: (await db.query(`SELECT COUNT(*) FROM Usuarios WHERE estado = true ${userFilter}`)).rows[0].count,
            citas: (await db.query(`SELECT COUNT(*) FROM Citas WHERE estado = 'completada' ${citFilter}`)).rows[0].count,
            checkins: (await db.query(`SELECT COUNT(*) FROM Checkins_Emocionales WHERE 1=1 ${chkFilter}`)).rows[0].count,
            pacientes_activos: (await db.query("SELECT COUNT(*) FROM Pacientes WHERE estado_tratamiento = 'activo'")).rows[0].count
        };

        res.render('reports/analytics', {
            title: 'Analytics & Reportes',
            user: req.session.user,
            stats: stats,
            period: period || 'all'
        });
    } catch (error) {
        console.error("Error en renderAnalyticsDashboard:", error);
        res.status(500).render('error', { 
            message: 'Error cargando analytics', 
            user: req.session.user, 
            error: error 
        });
    }
};

// --- MÉTODOS DE LÓGICA (POST/API) ---

const generateProgressReport = async (req, res) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const { patientId, tipo_reporte, periodo_inicio, periodo_fin, resumen_evolucion, recomendaciones } = req.body;

    const therapistResult = await client.query(
      'SELECT id_terapeuta FROM Terapeutas WHERE id_usuario = $1',
      [req.session.user.id_usuario]
    );

    if (therapistResult.rows.length === 0) {
        throw new Error('Usuario no es terapeuta');
    }
    const idTerapeuta = therapistResult.rows[0].id_terapeuta;

    // CORREGIDO: Usando 'fecha_hora' en lugar de 'fecha_hora_inicio'
    const sessionsCount = await client.query(
      `SELECT COUNT(*) as total FROM Citas
       WHERE id_paciente = $1 AND estado = 'completada' AND fecha_hora BETWEEN $2 AND $3`,
      [patientId, periodo_inicio, periodo_fin]
    );

    const metricas = {
      total_sesiones: parseInt(sessionsCount.rows[0].total),
      generado_automaticamente: true
    };

    await client.query(
      `INSERT INTO Reportes_Progreso (id_paciente, id_terapeuta, tipo_reporte, periodo_inicio, periodo_fin, resumen_evolucion, metricas_principales, recomendaciones, firmado_por, fecha_firma)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
      [patientId, idTerapeuta, tipo_reporte, periodo_inicio, periodo_fin, resumen_evolucion, JSON.stringify(metricas), recomendaciones, req.session.user.id_usuario]
    );

    await client.query('COMMIT');
    
    res.redirect(`/reports/patient/${patientId}/view`);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error generando reporte:', error);
    res.status(500).render('error', { 
        message: 'Error al generar reporte: ' + error.message, 
        user: req.session.user,
        error: error
    });
  } finally {
    client.release();
  }
};

// APIs JSON para uso futuro o gráficos
const getPlatformAnalytics = async (req, res) => {
    // Reutilizamos la lógica si es necesario
    res.json({ message: "Endpoint JSON de Analytics disponible" });
};

const getAuditLog = async (req, res) => {
    res.json({ message: "Endpoint AuditLog disponible" });
};
// ... código existente ...

// 5. Actualizar Nota de Sesión (POST)
const updateSessionNote = async (req, res) => {
    const client = await db.pool.connect();
    try {
        const { sessionId, patientId, notas } = req.body;
        
        // Validar que el usuario sea terapeuta (Seguridad básica)
        if (req.session.user.nombre_rol !== 'Terapeuta') {
            return res.status(403).send('Acceso denegado');
        }

        // Actualizar en BD (Upsert: Si no existe la sesión en Sesiones_Terapia, la crea?)
        // Asumimos que ya existe porque la estamos viendo. Solo hacemos UPDATE.
        await client.query(
            `UPDATE Sesiones_Terapia SET notas_terapeuta = $1, fecha_registro = NOW() WHERE id_cita = $2`,
            [notas, sessionId]
        );
        
        // Redirigir al mismo expediente
        res.redirect(`/reports/patient/${patientId}/view`);

    } catch (error) {
        console.error("Error actualizando nota:", error);
        res.redirect('back'); // Volver atrás si falla
    } finally {
        client.release();
    }
};

// Asegúrate de exportarlo al final:
module.exports = {
  renderHistoryDashboard,
  renderPatientHistoryView,
  renderCreateProgressView,
  renderAnalyticsDashboard,
  generateProgressReport,
  updateSessionNote, // <--- NUEVO
  getPlatformAnalytics,
  getAuditLog
};

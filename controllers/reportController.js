const db = require('../config/database');

// ====================================================================
// 1. DASHBOARD DE HISTORIAL (Lista de Pacientes)
// ====================================================================
const renderHistoryDashboard = async (req, res) => {
  try {
    const idUsuario = req.session.user.id_usuario; 
    const role = req.session.user.nombre_rol;
    let patients = [];

    // LÓGICA DE SEGURIDAD (FUSIÓN):
    // Si es Terapeuta -> Solo sus pacientes.
    // Si es Renan (Gestor) o Admin -> Todos los pacientes.
    
    if (role === 'Terapeuta') {
        const therapistResult = await db.query('SELECT id_terapeuta FROM Terapeutas WHERE id_usuario = $1', [idUsuario]);
        if (therapistResult.rows.length > 0) {
            const idTerapeuta = therapistResult.rows[0].id_terapeuta;
            const result = await db.query(`
                SELECT p.id_paciente, u.nombre, u.apellido, u.foto_perfil, u.email,
                       p.estado_tratamiento, p.fecha_inicio_tratamiento,
                       (SELECT COUNT(*) FROM Citas c WHERE c.id_paciente = p.id_paciente AND c.estado = 'completada') as sesiones_completadas
                FROM Pacientes p
                JOIN Usuarios u ON p.id_usuario = u.id_usuario
                WHERE p.id_terapeuta = $1
                ORDER BY u.apellido ASC
            `, [idTerapeuta]);
            patients = result.rows;
        }
    } else {
        // Para GestorHistorial (Renan), Monitorista, Admin
        const result = await db.query(`
            SELECT p.id_paciente, u.nombre, u.apellido, u.foto_perfil, u.email,
                   p.estado_tratamiento, p.fecha_inicio_tratamiento,
                   (SELECT nombre || ' ' || apellido FROM Usuarios WHERE id_usuario = (SELECT id_usuario FROM Terapeutas WHERE id_terapeuta = p.id_terapeuta)) as nombre_terapeuta,
                   (SELECT COUNT(*) FROM Citas c WHERE c.id_paciente = p.id_paciente AND c.estado = 'completada') as sesiones_completadas
            FROM Pacientes p
            JOIN Usuarios u ON p.id_usuario = u.id_usuario
            ORDER BY u.apellido ASC
        `);
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
// 2. EXPEDIENTE CLÍNICO DETALLADO (Vista Individual + SOAP)
// ====================================================================
const renderPatientHistoryView = async (req, res) => {
  try {
    const { patientId } = req.params;
    const idUsuario = req.session.user.id_usuario;
    const role = req.session.user.nombre_rol;

    // A. Datos del Paciente
    const patientResult = await db.query(`
      SELECT p.*, u.nombre, u.apellido, u.email, u.telefono, u.fecha_nacimiento, u.foto_perfil, u.direccion
      FROM Pacientes p
      JOIN Usuarios u ON p.id_usuario = u.id_usuario
      WHERE p.id_paciente = $1
    `, [patientId]);

    if (patientResult.rows.length === 0) {
        return res.status(404).render('error', { message: 'Paciente no encontrado', user: req.session.user, error: { status: 404 } });
    }
    const patientData = patientResult.rows[0];

    // SEGURIDAD: Verificar acceso si es terapeuta
    if (role === 'Terapeuta') {
        const therapistCheck = await db.query('SELECT id_terapeuta FROM Terapeutas WHERE id_usuario = $1', [idUsuario]);
        if (therapistCheck.rows.length > 0) {
            const myTherapistId = therapistCheck.rows[0].id_terapeuta;
            if (patientData.id_terapeuta !== myTherapistId) {
                return res.status(403).render('error', { title: 'Acceso Denegado', message: 'No tienes permiso para ver este expediente.', user: req.session.user, error: { status: 403 } });
            }
        }
    }

    // B. Sesiones (SOAP)
    // Usamos 'fecha_hora' que es la columna real en tu BD actual
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

    // D. Datos Gráficos (Opcional, para contexto)
    const checkins = await db.query(`SELECT fecha_hora, valencia, emocion_principal FROM Checkins_Emocionales WHERE id_paciente = $1 ORDER BY fecha_hora ASC`, [patientId]);
    
    res.render('reports/patient-history', {
      title: `Expediente: ${patientData.nombre} ${patientData.apellido}`,
      user: req.session.user,
      patient: patientData,
      sessions: sessions.rows,
      reports: reports.rows,
      checkins: checkins.rows
    });

  } catch (error) {
    console.error("Error renderPatientHistoryView:", error);
    res.status(500).render('error', { message: 'Error interno', user: req.session.user, error });
  }
};

// ====================================================================
// 3. GENERAR REPORTE DE PROGRESO (POST)
// ====================================================================
const generateProgressReport = async (req, res) => {
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        const { patientId } = req.params;
        const { tipo_reporte, periodo_inicio, periodo_fin, resumen_evolucion, recomendaciones } = req.body;
        
        // Buscar ID Terapeuta (Si es Renan, usamos el asignado al paciente o NULL si no hay)
        let idTerapeuta = null;
        if (req.session.user.nombre_rol === 'Terapeuta') {
            const tRes = await client.query('SELECT id_terapeuta FROM Terapeutas WHERE id_usuario = $1', [req.session.user.id_usuario]);
            if (tRes.rows.length > 0) idTerapeuta = tRes.rows[0].id_terapeuta;
        } else {
            // Si es Gestor, buscamos el terapeuta del paciente para asociarlo
            const pRes = await client.query('SELECT id_terapeuta FROM Pacientes WHERE id_paciente = $1', [patientId]);
            if (pRes.rows.length > 0) idTerapeuta = pRes.rows[0].id_terapeuta;
        }

        // Métricas automáticas
        const sessionsCount = await client.query(
            `SELECT COUNT(*) as total FROM Citas WHERE id_paciente = $1 AND estado = 'completada' AND fecha_hora BETWEEN $2 AND $3`,
            [patientId, periodo_inicio, periodo_fin]
        );
        const metricas = { total_sesiones: parseInt(sessionsCount.rows[0].total), generado_automaticamente: true };

        await client.query(
            `INSERT INTO Reportes_Progreso (id_paciente, id_terapeuta, tipo_reporte, periodo_inicio, periodo_fin, resumen_evolucion, metricas_principales, recomendaciones, firmado_por, fecha_firma)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
            [patientId, idTerapeuta, tipo_reporte, periodo_inicio, periodo_fin, resumen_evolucion, JSON.stringify(metricas), recomendaciones, req.session.user.id_usuario]
        );

        await client.query('COMMIT');
        res.redirect(`/reports/patient/${patientId}/view?success=report_created`);

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error generando reporte:', error);
        res.redirect(`/reports/patient/${req.params.patientId}/create-report?error=server_error`);
    } finally {
        client.release();
    }
};

// ====================================================================
// 4. RENDERIZAR FORMULARIO DE REPORTE
// ====================================================================
const renderCreateProgressView = async (req, res) => {
    try {
        const { patientId } = req.params;
        const patient = await db.query(`SELECT p.id_paciente, u.nombre, u.apellido FROM Pacientes p JOIN Usuarios u ON p.id_usuario = u.id_usuario WHERE p.id_paciente = $1`, [patientId]);
        
        if (patient.rows.length === 0) return res.status(404).send("Paciente no encontrado");

        res.render('reports/create-progress', {
            title: 'Crear Reporte',
            user: req.session.user,
            patient: patient.rows[0]
        });
    } catch (error) {
        console.error(error);
        res.status(500).send("Error al cargar formulario");
    }
};

// ====================================================================
// 5. ACTUALIZAR NOTA SOAP (POST)
// ====================================================================
const updateSessionNote = async (req, res) => {
    const client = await db.pool.connect();
    try {
        const { sessionId, patientId, notas } = req.body;
        // Permitir a Terapeutas y Gestores editar notas
        const allowedRoles = ['Terapeuta', 'GestorHistorial', 'Administrador'];
        if (!allowedRoles.includes(req.session.user.nombre_rol)) {
            return res.status(403).send('Acceso denegado');
        }

        // Upsert de la sesión (Si no existe registro en Sesiones_Terapia, lo crea)
        // Primero verificamos si existe
        const check = await client.query('SELECT id_sesion FROM Sesiones_Terapia WHERE id_cita = $1', [sessionId]);
        
        if (check.rows.length > 0) {
             await client.query(`UPDATE Sesiones_Terapia SET notas_terapeuta = $1, fecha_registro = NOW() WHERE id_cita = $2`, [notas, sessionId]);
        } else {
             await client.query(`INSERT INTO Sesiones_Terapia (id_cita, notas_terapeuta, fecha_registro) VALUES ($1, $2, NOW())`, [sessionId, notas]);
        }
        
        res.redirect(`/reports/patient/${patientId}/view`);
    } catch (error) {
        console.error("Error actualizando nota:", error);
        res.redirect('back');
    } finally {
        client.release();
    }
};

// Analytics (Placeholder para que no falle la ruta)
const renderAnalyticsDashboard = async (req, res) => {
    res.render('reports/analytics', { title: 'Analytics', user: req.session.user, stats: {}, period: 'all' });
};
const getPlatformAnalytics = async (req, res) => { res.json({ msg: "OK" }); };
const getAuditLog = async (req, res) => { res.json({ msg: "OK" }); };

module.exports = {
  renderHistoryDashboard,
  renderPatientHistoryView,
  renderCreateProgressView,
  generateProgressReport,
  updateSessionNote,
  renderAnalyticsDashboard,
  getPlatformAnalytics,
  getAuditLog
};
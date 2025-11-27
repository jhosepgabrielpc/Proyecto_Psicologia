const db = require('../config/database');
const { generateSessionToken } = require('../utils/helpers');
//Controller para manejar citas
const getAvailableSlots = async (req, res) => {
  try {
    const { therapistId, date } = req.query;

    const result = await db.query(
      `SELECT bh.*
       FROM Bloques_Horarios bh
       WHERE bh.id_terapeuta = $1 AND bh.fecha = $2 AND bh.estado = 'disponible'
       ORDER BY bh.hora_inicio ASC`,
      [therapistId, date]
    );

    res.json({ availableSlots: result.rows });

  } catch (error) {
    console.error('Error obteniendo horarios disponibles:', error);
    res.status(500).json({ error: 'Error al obtener horarios disponibles' });
  }
};
//Crear citas
const createAppointment = async (req, res) => {
  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    const { id_terapeuta, fecha_hora_inicio, duracion_minutos, motivo_consulta } = req.body;

    const patientResult = await client.query(
      'SELECT id_paciente FROM Pacientes WHERE id_usuario = $1',
      [req.user.id_usuario]
    );

    if (patientResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Paciente no encontrado' });
    }

    const idPaciente = patientResult.rows[0].id_paciente;

    const fechaInicio = new Date(fecha_hora_inicio);
    const fechaFin = new Date(fechaInicio.getTime() + duracion_minutos * 60000);

    const conflictResult = await client.query(
      `SELECT * FROM Citas
       WHERE id_terapeuta = $1
       AND estado NOT IN ('cancelada', 'no_asistio')
       AND ((fecha_hora_inicio <= $2 AND fecha_hora_fin > $2)
            OR (fecha_hora_inicio < $3 AND fecha_hora_fin >= $3)
            OR (fecha_hora_inicio >= $2 AND fecha_hora_fin <= $3))`,
      [id_terapeuta, fechaInicio, fechaFin]
    );

    if (conflictResult.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'El horario seleccionado ya está ocupado' });
    }

    const sessionToken = generateSessionToken();
    const sessionLink = `${process.env.BASE_URL}/session/${sessionToken}`;

    const appointmentResult = await client.query(
      `INSERT INTO Citas (id_paciente, id_terapeuta, fecha_hora_inicio, fecha_hora_fin, duracion_minutos, motivo_consulta, enlace_sesion, token_sesion, estado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'programada') RETURNING *`,
      [idPaciente, id_terapeuta, fechaInicio, fechaFin, duracion_minutos, motivo_consulta, sessionLink, sessionToken]
    );

    await client.query(
      `INSERT INTO Notificaciones (id_usuario, titulo, mensaje, datos_adicionales)
       SELECT u.id_usuario, 'Nueva Cita Programada', $1, $2
       FROM Terapeutas t
       JOIN Usuarios u ON t.id_usuario = u.id_usuario
       WHERE t.id_terapeuta = $3`,
      [
        `Tienes una nueva cita programada para el ${fechaInicio.toLocaleString('es-BO')}`,
        JSON.stringify({ id_cita: appointmentResult.rows[0].id_cita }),
        id_terapeuta
      ]
    );

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Cita programada exitosamente',
      appointment: appointmentResult.rows[0]
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creando cita:', error);
    res.status(500).json({ error: 'Error al programar la cita' });
  } finally {
    client.release();
  }
};

const getAppointments = async (req, res) => {
  try {
    const role = req.user.nombre_rol;
    let query;

    if (role === 'Paciente') {
      query = `
        SELECT c.*, t.id_terapeuta, u.nombre || ' ' || u.apellido as terapeuta_nombre,
               u.foto_perfil as terapeuta_foto, e.nombre_especialidad
        FROM Citas c
        JOIN Terapeutas t ON c.id_terapeuta = t.id_terapeuta
        JOIN Usuarios u ON t.id_usuario = u.id_usuario
        LEFT JOIN Especialidades e ON t.id_especialidad = e.id_especialidad
        JOIN Pacientes p ON c.id_paciente = p.id_paciente
        WHERE p.id_usuario = $1
        ORDER BY c.fecha_hora_inicio DESC
      `;
    } else if (role === 'Terapeuta') {
      query = `
        SELECT c.*, p.id_paciente, u.nombre || ' ' || u.apellido as paciente_nombre,
               u.foto_perfil as paciente_foto
        FROM Citas c
        JOIN Pacientes p ON c.id_paciente = p.id_paciente
        JOIN Usuarios u ON p.id_usuario = u.id_usuario
        JOIN Terapeutas t ON c.id_terapeuta = t.id_terapeuta
        WHERE t.id_usuario = $1
        ORDER BY c.fecha_hora_inicio DESC
      `;
    }

    const result = await db.query(query, [req.user.id_usuario]);
    res.json({ appointments: result.rows });

  } catch (error) {
    console.error('Error obteniendo citas:', error);
    res.status(500).json({ error: 'Error al obtener citas' });
  }
};

const updateAppointmentStatus = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const { estado } = req.body;

    const result = await db.query(
      'UPDATE Citas SET estado = $1 WHERE id_cita = $2 RETURNING *',
      [estado, appointmentId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Cita no encontrada' });
    }

    res.json({
      message: 'Estado de cita actualizado',
      appointment: result.rows[0]
    });

  } catch (error) {
    console.error('Error actualizando estado de cita:', error);
    res.status(500).json({ error: 'Error al actualizar estado de cita' });
  }
};

const saveSessionNotes = async (req, res) => {
  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    const { appointmentId } = req.params;
    const { notas_terapeuta, objetivos_trabajados, tareas_asignadas, duracion_real_minutos, calidad_sesion } = req.body;

    const sessionResult = await client.query(
      `INSERT INTO Sesiones_Terapia (id_cita, notas_terapeuta, objetivos_trabajados, tareas_asignadas, duracion_real_minutos, calidad_sesion)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id_cita) DO UPDATE
       SET notas_terapeuta = $2, objetivos_trabajados = $3, tareas_asignadas = $4,
           duracion_real_minutos = $5, calidad_sesion = $6
       RETURNING *`,
      [appointmentId, notas_terapeuta, objetivos_trabajados, tareas_asignadas, duracion_real_minutos, calidad_sesion]
    );

    await client.query(
      'UPDATE Citas SET estado = $1 WHERE id_cita = $2',
      ['completada', appointmentId]
    );

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Notas de sesión guardadas exitosamente',
      session: sessionResult.rows[0]
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error guardando notas de sesión:', error);
    res.status(500).json({ error: 'Error al guardar notas de sesión' });
  } finally {
    client.release();
  }
};

module.exports = {
  getAvailableSlots,
  createAppointment,
  getAppointments,
  updateAppointmentStatus,
  saveSessionNotes
};
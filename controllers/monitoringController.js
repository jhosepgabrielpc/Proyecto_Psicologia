const db = require('../config/database');
const { interpretPHQ9Score, interpretGAD7Score, checkForCriticalAlert } = require('../utils/helpers');

const submitEmotionalCheckIn = async (req, res) => {
  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    const { valencia_personal, activacion_personal, notas_paciente, id_emocion } = req.body;

    const patientResult = await client.query(
      'SELECT id_paciente FROM Pacientes WHERE id_usuario = $1',
      [req.user.id_usuario]
    );

    if (patientResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Paciente no encontrado' });
    }

    const idPaciente = patientResult.rows[0].id_paciente;

    const checkInResult = await client.query(
      `INSERT INTO Checkins_Emocionales (id_paciente, id_emocion, valencia_personal, activacion_personal, notas_paciente)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [idPaciente, id_emocion, valencia_personal, activacion_personal, notas_paciente]
    );

    if (valencia_personal <= 2 || activacion_personal >= 4) {
      await client.query(
        `INSERT INTO Alertas_Automaticas (id_paciente, tipo_alerta, fuente, datos_deteccion, severidad)
         VALUES ($1, 'Estado emocional bajo', 'check-in', $2, 'media')`,
        [idPaciente, JSON.stringify({ valencia: valencia_personal, activacion: activacion_personal })]
      );
    }

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Check-in emocional registrado exitosamente',
      checkIn: checkInResult.rows[0]
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error en check-in emocional:', error);
    res.status(500).json({ error: 'Error al registrar check-in emocional' });
  } finally {
    client.release();
  }
};

const submitScaleResponse = async (req, res) => {
  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    const { id_asignacion, respuestas, observaciones_paciente, tiempo_completacion } = req.body;

    const assignmentResult = await client.query(
      `SELECT ea.*, te.nombre_escala, te.puntuacion_maxima, p.id_paciente, p.id_terapeuta_principal
       FROM Escalas_Asignadas ea
       JOIN Tipos_Escala te ON ea.id_tipo_escala = te.id_tipo_escala
       JOIN Pacientes p ON ea.id_paciente = p.id_paciente
       WHERE ea.id_asignacion = $1 AND ea.estado = 'activa'`,
      [id_asignacion]
    );

    if (assignmentResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Asignación de escala no encontrada o ya completada' });
    }

    const assignment = assignmentResult.rows[0];

    const puntuacionTotal = Object.values(respuestas).reduce((sum, val) => sum + parseInt(val), 0);

    let interpretacion;
    if (assignment.nombre_escala === 'PHQ-9') {
      interpretacion = interpretPHQ9Score(puntuacionTotal);
    } else if (assignment.nombre_escala === 'GAD-7') {
      interpretacion = interpretGAD7Score(puntuacionTotal);
    }

    const resultadoInsert = await client.query(
      `INSERT INTO Resultados_Escalas (id_asignacion, puntuacion_total, respuestas, interpretacion_automatica, observaciones_paciente, tiempo_completacion_minutos)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [id_asignacion, puntuacionTotal, JSON.stringify(respuestas), interpretacion?.descripcion, observaciones_paciente, tiempo_completacion]
    );

    await client.query(
      'UPDATE Escalas_Asignadas SET estado = $1 WHERE id_asignacion = $2',
      ['completada', id_asignacion]
    );

    const alertSeverity = checkForCriticalAlert(assignment.nombre_escala, puntuacionTotal);

    if (alertSeverity) {
      await client.query(
        `INSERT INTO Alertas_Clinicas (id_paciente, id_terapeuta, tipo_alerta, severidad, descripcion, datos_origen)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          assignment.id_paciente,
          assignment.id_terapeuta_principal,
          `Puntuación ${alertSeverity} en ${assignment.nombre_escala}`,
          alertSeverity,
          `El paciente obtuvo ${puntuacionTotal} puntos en ${assignment.nombre_escala}: ${interpretacion.descripcion}`,
          JSON.stringify({ escala: assignment.nombre_escala, puntuacion: puntuacionTotal, interpretacion })
        ]
      );
    }

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Escala completada exitosamente',
      resultado: resultadoInsert.rows[0],
      interpretacion
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al procesar escala:', error);
    res.status(500).json({ error: 'Error al procesar respuesta de escala' });
  } finally {
    client.release();
  }
};

const getPatientEmotionalHistory = async (req, res) => {
  try {
    const { patientId } = req.params;
    const { days = 30 } = req.query;

    const checkInsResult = await db.query(
      `SELECT ce.*, em.nombre as emocion_nombre, em.color_hex
       FROM Checkins_Emocionales ce
       LEFT JOIN Emociones_Modelo em ON ce.id_emocion = em.id_emocion
       WHERE ce.id_paciente = $1 AND ce.fecha_registro >= NOW() - INTERVAL '${parseInt(days)} days'
       ORDER BY ce.fecha_registro DESC`,
      [patientId]
    );

    const scalesResult = await db.query(
      `SELECT re.*, ea.id_tipo_escala, te.nombre_escala
       FROM Resultados_Escalas re
       JOIN Escalas_Asignadas ea ON re.id_asignacion = ea.id_asignacion
       JOIN Tipos_Escala te ON ea.id_tipo_escala = te.id_tipo_escala
       WHERE ea.id_paciente = $1 AND re.fecha_completacion >= NOW() - INTERVAL '${parseInt(days)} days'
       ORDER BY re.fecha_completacion DESC`,
      [patientId]
    );

    res.json({
      checkIns: checkInsResult.rows,
      scaleResults: scalesResult.rows
    });

  } catch (error) {
    console.error('Error obteniendo historial emocional:', error);
    res.status(500).json({ error: 'Error al obtener historial emocional' });
  }
};

const getPendingScales = async (req, res) => {
  try {
    const patientResult = await db.query(
      'SELECT id_paciente FROM Pacientes WHERE id_usuario = $1',
      [req.user.id_usuario]
    );

    if (patientResult.rows.length === 0) {
      return res.status(404).json({ error: 'Paciente no encontrado' });
    }

    const result = await db.query(
      `SELECT ea.*, te.nombre_escala, te.descripcion as escala_descripcion
       FROM Escalas_Asignadas ea
       JOIN Tipos_Escala te ON ea.id_tipo_escala = te.id_tipo_escala
       WHERE ea.id_paciente = $1 AND ea.estado = 'activa'
       ORDER BY ea.fecha_limite ASC`,
      [patientResult.rows[0].id_paciente]
    );

    res.json({ pendingScales: result.rows });

  } catch (error) {
    console.error('Error obteniendo escalas pendientes:', error);
    res.status(500).json({ error: 'Error al obtener escalas pendientes' });
  }
};

module.exports = {
  submitEmotionalCheckIn,
  submitScaleResponse,
  getPatientEmotionalHistory,
  getPendingScales
};
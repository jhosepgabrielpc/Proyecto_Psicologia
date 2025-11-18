const db = require('../config/database');

const getConversations = async (req, res) => {
  try {
    const userId = req.user.id_usuario;
    const role = req.user.nombre_rol;

    let query;
    if (role === 'Paciente') {
      query = `
        SELECT c.*, t.id_terapeuta, u.nombre || ' ' || u.apellido as terapeuta_nombre, u.foto_perfil as terapeuta_foto
        FROM Conversaciones c
        JOIN Terapeutas t ON c.id_terapeuta = t.id_terapeuta
        JOIN Usuarios u ON t.id_usuario = u.id_usuario
        JOIN Pacientes p ON c.id_paciente = p.id_paciente
        WHERE p.id_usuario = $1 AND c.estado = 'activa'
        ORDER BY c.ultimo_mensaje DESC NULLS LAST
      `;
    } else {
      query = `
        SELECT c.*, p.id_paciente, u.nombre || ' ' || u.apellido as paciente_nombre, u.foto_perfil as paciente_foto
        FROM Conversaciones c
        JOIN Pacientes p ON c.id_paciente = p.id_paciente
        JOIN Usuarios u ON p.id_usuario = u.id_usuario
        JOIN Terapeutas t ON c.id_terapeuta = t.id_terapeuta
        WHERE t.id_usuario = $1 AND c.estado = 'activa'
        ORDER BY c.ultimo_mensaje DESC NULLS LAST
      `;
    }

    const result = await db.query(query, [userId]);
    res.json({ conversations: result.rows });

  } catch (error) {
    console.error('Error obteniendo conversaciones:', error);
    res.status(500).json({ error: 'Error al obtener conversaciones' });
  }
};

const getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;

    const messages = await db.query(
      `SELECT m.*, u.nombre || ' ' || u.apellido as remitente_nombre, u.foto_perfil as remitente_foto
       FROM Mensajes_Seguros m
       JOIN Usuarios u ON m.id_remitente = u.id_usuario
       WHERE m.id_conversacion = $1
       ORDER BY m.fecha_envio ASC`,
      [conversationId]
    );

    await db.query(
      'UPDATE Mensajes_Seguros SET leido = true, fecha_lectura = NOW() WHERE id_conversacion = $1 AND id_remitente != $2 AND leido = false',
      [conversationId, req.user.id_usuario]
    );

    res.json({ messages: messages.rows });

  } catch (error) {
    console.error('Error obteniendo mensajes:', error);
    res.status(500).json({ error: 'Error al obtener mensajes' });
  }
};

const sendMessage = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { mensaje, tipo_mensaje } = req.body;

    const result = await db.query(
      `INSERT INTO Mensajes_Seguros (id_conversacion, id_remitente, mensaje, tipo_mensaje)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [conversationId, req.user.id_usuario, mensaje, tipo_mensaje || 'texto']
    );

    await db.query(
      'UPDATE Conversaciones SET ultimo_mensaje = NOW() WHERE id_conversacion = $1',
      [conversationId]
    );

    if (global.io) {
      global.io.to(`conversation_${conversationId}`).emit('new-message', result.rows[0]);
    }

    res.status(201).json({ message: result.rows[0] });

  } catch (error) {
    console.error('Error enviando mensaje:', error);
    res.status(500).json({ error: 'Error al enviar mensaje' });
  }
};

const getNotifications = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT n.*, tn.nombre_tipo
       FROM Notificaciones n
       LEFT JOIN Tipos_Notificacion tn ON n.id_tipo_notificacion = tn.id_tipo_notificacion
       WHERE n.id_usuario = $1
       ORDER BY n.fecha_creacion DESC
       LIMIT 50`,
      [req.user.id_usuario]
    );

    res.json({ notifications: result.rows });

  } catch (error) {
    console.error('Error obteniendo notificaciones:', error);
    res.status(500).json({ error: 'Error al obtener notificaciones' });
  }
};

const markNotificationAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;

    await db.query(
      'UPDATE Notificaciones SET leida = true, fecha_lectura = NOW() WHERE id_notificacion = $1 AND id_usuario = $2',
      [notificationId, req.user.id_usuario]
    );

    res.json({ message: 'Notificación marcada como leída' });

  } catch (error) {
    console.error('Error actualizando notificación:', error);
    res.status(500).json({ error: 'Error al actualizar notificación' });
  }
};

const getClinicalAlerts = async (req, res) => {
  try {
    const role = req.user.nombre_rol;
    let query;

    if (role === 'Terapeuta') {
      query = `
        SELECT a.*, p.id_paciente, u.nombre || ' ' || u.apellido as paciente_nombre
        FROM Alertas_Clinicas a
        JOIN Pacientes p ON a.id_paciente = p.id_paciente
        JOIN Usuarios u ON p.id_usuario = u.id_usuario
        JOIN Terapeutas t ON a.id_terapeuta = t.id_terapeuta
        WHERE t.id_usuario = $1 AND a.estado = 'activa'
        ORDER BY a.severidad DESC, a.fecha_creacion DESC
      `;
    } else {
      query = `
        SELECT a.*
        FROM Alertas_Clinicas a
        ORDER BY a.severidad DESC, a.fecha_creacion DESC
      `;
    }

    const result = await db.query(query, [req.user.id_usuario]);
    res.json({ alerts: result.rows });

  } catch (error) {
    console.error('Error obteniendo alertas:', error);
    res.status(500).json({ error: 'Error al obtener alertas clínicas' });
  }
};

module.exports = {
  getConversations,
  getMessages,
  sendMessage,
  getNotifications,
  markNotificationAsRead,
  getClinicalAlerts
};
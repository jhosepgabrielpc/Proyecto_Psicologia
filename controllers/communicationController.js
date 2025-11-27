const db = require('../config/database');

// ====================================================================
// 1. VISTA PRINCIPAL DEL CHAT
// ====================================================================
const getChatInterface = async (req, res) => {
    try {
        const userId = req.session.user.id_usuario;
        const role = req.session.user.nombre_rol;

        // Obtener lista de contactos (Usuarios con los que puede hablar)
        // Si es Paciente -> Ve a su Terapeuta y a Jimmy
        // Si es Terapeuta -> Ve a sus Pacientes y a Jimmy
        // Si es Jimmy -> Ve a Todos
        let contactsQuery = ``;
        let params = [];

        if (role === 'Paciente') {
            contactsQuery = `
                SELECT u.id_usuario, u.nombre, u.apellido, u.foto_perfil, r.nombre_rol 
                FROM Usuarios u 
                JOIN Roles r ON u.id_rol = r.id_rol
                WHERE u.id_usuario IN (
                    SELECT id_usuario FROM Terapeutas WHERE id_terapeuta = (SELECT id_terapeuta FROM Pacientes WHERE id_usuario = $1)
                ) OR r.nombre_rol = 'GestorComunicacion'
            `;
            params = [userId];
        } else if (role === 'Terapeuta') {
            contactsQuery = `
                SELECT u.id_usuario, u.nombre, u.apellido, u.foto_perfil, 'Paciente' as nombre_rol
                FROM Usuarios u 
                JOIN Pacientes p ON u.id_usuario = p.id_usuario
                WHERE p.id_terapeuta = (SELECT id_terapeuta FROM Terapeutas WHERE id_usuario = $1)
                UNION
                SELECT u.id_usuario, u.nombre, u.apellido, u.foto_perfil, r.nombre_rol 
                FROM Usuarios u JOIN Roles r ON u.id_rol = r.id_rol WHERE r.nombre_rol = 'GestorComunicacion'
            `;
            params = [userId];
        } else {
            // Jimmy / Admin ven a todos
            contactsQuery = `
                SELECT u.id_usuario, u.nombre, u.apellido, u.foto_perfil, r.nombre_rol
                FROM Usuarios u 
                JOIN Roles r ON u.id_rol = r.id_rol
                WHERE u.id_usuario != $1 AND u.estado = true
                ORDER BY u.nombre ASC
            `;
            params = [userId];
        }

        const contacts = await db.query(contactsQuery, params);
        
        // Si hay un chat seleccionado en la URL (?chat=ID), cargamos mensajes
        let selectedChat = null;
        let messages = [];
        if (req.query.chat) {
            const chatPartnerId = req.query.chat;
            
            // Info del contacto
            const contactRes = await db.query('SELECT id_usuario, nombre, apellido, foto_perfil FROM Usuarios WHERE id_usuario = $1', [chatPartnerId]);
            if (contactRes.rows.length > 0) selectedChat = contactRes.rows[0];

            // Mensajes
            const msgsRes = await db.query(`
                SELECT * FROM Mensajes_Seguros 
                WHERE (id_remitente = $1 AND id_destinatario = $2) 
                   OR (id_remitente = $2 AND id_destinatario = $1)
                ORDER BY fecha_envio ASC
            `, [userId, chatPartnerId]);
            messages = msgsRes.rows;
        }

        res.render('dashboard/communication', {
            title: 'Centro de Comunicación',
            user: req.session.user,
            contacts: contacts.rows,
            selectedChat: selectedChat,
            messages: messages
        });

    } catch (error) {
        console.error('Error chat:', error);
        res.redirect('/dashboard');
    }
};

// ====================================================================
// 2. ENVIAR MENSAJE (API)
// ====================================================================
const sendMessage = async (req, res) => {
    const { recipientId, content } = req.body;
    const senderId = req.session.user.id_usuario;

    try {
        const newMsg = await db.query(`
            INSERT INTO Mensajes_Seguros (id_remitente, id_destinatario, contenido, leido, fecha_envio)
            VALUES ($1, $2, $3, false, NOW())
            RETURNING *
        `, [senderId, recipientId, content]);

        const messageData = newMsg.rows[0];

        // SOCKET.IO: Usamos global.io para evitar importar server.js
        if (global.io) {
            global.io.emit('receive-message', {
                senderId: senderId,
                recipientId: recipientId,
                content: content,
                timestamp: messageData.fecha_envio
            });
            
            // Notificación tiempo real
            global.io.emit('new-notification', {
                userId: recipientId,
                message: `Nuevo mensaje de ${req.session.user.nombre}`
            });
        }

        res.json({ success: true, message: messageData });

    } catch (error) {
        console.error('Error enviando mensaje:', error);
        res.status(500).json({ success: false });
    }
};

// ====================================================================
// 3. OBTENER NOTIFICACIONES (API JSON)
// ====================================================================
const getNotifications = async (req, res) => {
    try {
        const result = await db.query(`
            SELECT * FROM Notificaciones 
            WHERE id_usuario = $1 
            ORDER BY fecha_creacion DESC LIMIT 10
        `, [req.session.user.id_usuario]);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json([]);
    }
};

// ====================================================================
// 4. MARCAR LEÍDA
// ====================================================================
const markNotificationAsRead = async (req, res) => {
    try {
        await db.query('UPDATE Notificaciones SET leido = true WHERE id_notificacion = $1', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false });
    }
};

module.exports = {
    getChatInterface,
    sendMessage,
    getNotifications,
    markNotificationAsRead
};
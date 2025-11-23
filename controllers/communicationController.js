const db = require('../config/database');

// ====================================================================
// 1. INTERFAZ PRINCIPAL DEL CHAT (VISTA)
// ====================================================================
// Carga la lista de contactos (izquierda) y el historial de chat (derecha)
// Fusiona la lógica de tu código anterior con la nueva estructura DB.
// ====================================================================
const getChatInterface = async (req, res) => {
    // Verificar sesión
    if (!req.session.user) return res.redirect('/auth/login');

    const userId = req.session.user.id_usuario;
    const userRole = req.session.user.nombre_rol; // 'Paciente', 'Terapeuta', 'Administrador'
    const selectedChatId = req.query.chat || null; // ID del usuario con quien chateamos

    try {
        let contacts = [];

        // -------------------------------------------------------
        // A. OBTENER LISTA DE CONTACTOS (SIDEBAR)
        // -------------------------------------------------------
        // La consulta varía según el rol para mantener la privacidad.
        
        let queryContacts = "";
        
        if (userRole === 'Paciente') {
            // Paciente ve: Su Terapeuta asignado + Administradores
            queryContacts = `
                SELECT u.id_usuario, u.nombre, u.apellido, u.foto_perfil, r.nombre_rol,
                       (SELECT COUNT(*) FROM Mensajes_Seguros WHERE id_remitente = u.id_usuario AND id_destinatario = $1 AND leido = false) as sin_leer
                FROM Usuarios u
                JOIN Roles r ON u.id_rol = r.id_rol
                WHERE u.id_usuario IN (
                    SELECT id_terapeuta FROM Pacientes WHERE id_usuario = $1
                ) 
                OR r.nombre_rol = 'Administrador'
                OR u.id_usuario IN (SELECT id_destinatario FROM Mensajes_Seguros WHERE id_remitente = $1) -- También con quien ya hablé antes
            `;
        } 
        else if (userRole === 'Terapeuta') {
            // Terapeuta ve: Sus Pacientes asignados + Administradores
            queryContacts = `
                SELECT u.id_usuario, u.nombre, u.apellido, u.foto_perfil, r.nombre_rol,
                       (SELECT COUNT(*) FROM Mensajes_Seguros WHERE id_remitente = u.id_usuario AND id_destinatario = $1 AND leido = false) as sin_leer
                FROM Usuarios u
                JOIN Roles r ON u.id_rol = r.id_rol
                WHERE u.id_usuario IN (
                    SELECT p.id_usuario FROM Pacientes p 
                    JOIN Terapeutas t ON p.id_terapeuta = t.id_terapeuta 
                    WHERE t.id_usuario = $1
                )
                OR r.nombre_rol = 'Administrador'
                OR u.id_usuario IN (SELECT id_destinatario FROM Mensajes_Seguros WHERE id_remitente = $1)
            `;
        } 
        else {
            // Admin ve: A TODOS (Para soporte)
            queryContacts = `
                SELECT u.id_usuario, u.nombre, u.apellido, u.foto_perfil, r.nombre_rol,
                       (SELECT COUNT(*) FROM Mensajes_Seguros WHERE id_remitente = u.id_usuario AND id_destinatario = $1 AND leido = false) as sin_leer
                FROM Usuarios u
                JOIN Roles r ON u.id_rol = r.id_rol
                WHERE u.id_usuario != $1 -- No mostrarse a sí mismo
                ORDER BY u.nombre ASC
            `;
        }

        const contactsResult = await db.query(queryContacts, [userId]);
        contacts = contactsResult.rows;

        // -------------------------------------------------------
        // B. OBTENER HISTORIAL DE CHAT (SI SELECCIONADO)
        // -------------------------------------------------------
        let chatHistory = [];
        let activeContact = null;

        if (selectedChatId) {
            // 1. Marcar mensajes como leídos
            await db.query(`
                UPDATE Mensajes_Seguros 
                SET leido = true 
                WHERE id_remitente = $1 AND id_destinatario = $2 AND leido = false
            `, [selectedChatId, userId]);

            // 2. Obtener datos del contacto activo (Header del chat)
            const contactRes = await db.query(`
                SELECT id_usuario, nombre, apellido, foto_perfil, r.nombre_rol 
                FROM Usuarios u
                JOIN Roles r ON u.id_rol = r.id_rol 
                WHERE id_usuario = $1
            `, [selectedChatId]);
            
            if (contactRes.rows.length > 0) {
                activeContact = contactRes.rows[0];
            }

            // 3. Obtener los mensajes (Ida y Vuelta)
            const historyRes = await db.query(`
                SELECT m.*, u.nombre as remitente_nombre 
                FROM Mensajes_Seguros m
                JOIN Usuarios u ON m.id_remitente = u.id_usuario
                WHERE (m.id_remitente = $1 AND m.id_destinatario = $2) 
                   OR (m.id_remitente = $2 AND m.id_destinatario = $1)
                ORDER BY m.fecha_envio ASC
            `, [userId, selectedChatId]);
            
            chatHistory = historyRes.rows;
        }

        // -------------------------------------------------------
        // C. RENDERIZAR VISTA
        // -------------------------------------------------------
        res.render('dashboard/communication', {
            title: 'Centro de Mensajes',
            user: req.session.user,
            contacts: contacts,
            activeChat: activeContact,
            messages: chatHistory
        });

    } catch (error) {
        console.error('Error obteniendo interfaz de chat:', error);
        res.status(500).render('error', {
            title: 'Error de Comunicación',
            message: 'No se pudo cargar el sistema de mensajería.',
            error: error,
            user: req.session.user
        });
    }
};

// ====================================================================
// 2. ENVIAR MENSAJE (API AJAX)
// ====================================================================
const sendMessage = async (req, res) => {
    try {
        const { id_destinatario, contenido, tipo_mensaje } = req.body;
        const id_remitente = req.session.user.id_usuario;

        // 1. Insertar Mensaje en BD
        const result = await db.query(`
            INSERT INTO Mensajes_Seguros (id_remitente, id_destinatario, contenido, tipo_mensaje, fecha_envio)
            VALUES ($1, $2, $3, $4, NOW())
            RETURNING *
        `, [id_remitente, id_destinatario, contenido, tipo_mensaje || 'texto']);

        const nuevoMensaje = result.rows[0];

        // 2. Crear Notificación Interna para el destinatario
        await db.query(`
            INSERT INTO Notificaciones (id_usuario, tipo, mensaje, enlace_accion, fecha_creacion)
            VALUES ($1, 'mensaje', 'Tienes un nuevo mensaje de ' || (SELECT nombre FROM Usuarios WHERE id_usuario = $2), $3, NOW())
        `, [id_destinatario, id_remitente, `/dashboard/communication?chat=${id_remitente}`]);

        // 3. Emitir evento Socket.IO (Tiempo Real)
        if (global.io) {
            // Enviar a la sala del destinatario
            global.io.to(`user-${id_destinatario}`).emit('receive-message', {
                senderId: id_remitente,
                content: contenido,
                timestamp: new Date()
            });
        }

        res.status(201).json({ success: true, message: nuevoMensaje });

    } catch (error) {
        console.error('Error enviando mensaje:', error);
        res.status(500).json({ success: false, error: 'Error al enviar mensaje' });
    }
};

// ====================================================================
// 3. OBTENER NOTIFICACIONES (API) - RESTAURADO
// ====================================================================
const getNotifications = async (req, res) => {
    try {
        const userId = req.session.user.id_usuario;

        const result = await db.query(`
            SELECT * FROM Notificaciones
            WHERE id_usuario = $1
            ORDER BY fecha_creacion DESC
            LIMIT 20
        `, [userId]);

        res.json({ notifications: result.rows });

    } catch (error) {
        console.error('Error obteniendo notificaciones:', error);
        res.status(500).json({ error: 'Error al cargar notificaciones' });
    }
};

// ====================================================================
// 4. MARCAR NOTIFICACIÓN COMO LEÍDA (API) - RESTAURADO
// ====================================================================
const markNotificationAsRead = async (req, res) => {
    try {
        const { id } = req.params; // ID de la notificación
        const userId = req.session.user.id_usuario;

        await db.query(`
            UPDATE Notificaciones 
            SET leida = true 
            WHERE id_notificacion = $1 AND id_usuario = $2
        `, [id, userId]);

        res.json({ success: true, message: 'Notificación marcada' });

    } catch (error) {
        console.error('Error marcando notificación:', error);
        res.status(500).json({ error: 'Error interno' });
    }
};

module.exports = {
    getChatInterface,
    sendMessage,
    getNotifications,
    markNotificationAsRead
};
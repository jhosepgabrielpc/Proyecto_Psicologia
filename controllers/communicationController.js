const db = require('../config/database');

// ====================================================================
// 1. INTERFAZ PRINCIPAL DEL CHAT (CEREBRO DE COMUNICACIÓN) 🧠
// ====================================================================
const getChatInterface = async (req, res) => {
    const userId = req.session.user.id_usuario;
    const userRole = req.session.user.nombre_rol;
    const targetId = req.query.chat ? parseInt(req.query.chat) : null;

    try {
        // A. OBTENER MIS CONTACTOS (Gente con la que ya hablé)
        const contactsQuery = `
            SELECT DISTINCT ON (u.id_usuario) 
                u.id_usuario, u.nombre, u.apellido, u.foto_perfil, r.nombre_rol, u.email,
                m.contenido as ultimo_mensaje, m.fecha_envio,
                (SELECT COUNT(*) FROM Mensajes_Seguros 
                 WHERE id_remitente = u.id_usuario AND id_destinatario = $1 AND leido = false) as no_leidos
            FROM Usuarios u
            JOIN Roles r ON u.id_rol = r.id_rol
            JOIN Mensajes_Seguros m ON (m.id_remitente = u.id_usuario AND m.id_destinatario = $1) 
                                    OR (m.id_remitente = $1 AND m.id_destinatario = u.id_usuario)
            WHERE u.id_usuario != $1
            ORDER BY u.id_usuario, m.fecha_envio DESC
        `;
        let contactsRes = await db.query(contactsQuery, [userId]);
        let contacts = contactsRes.rows.sort((a, b) => new Date(b.fecha_envio) - new Date(a.fecha_envio));

        // B. OBTENER LISTA DE TODOS LOS USUARIOS (Para iniciar nuevos chats)
        // Filtramos para que un paciente solo vea doctores y gestores, y viceversa (Regla de negocio opcional)
        // Por ahora, dejamos que vean a todos menos a sí mismos para máxima flexibilidad.
        const allUsersQuery = `
            SELECT u.id_usuario, u.nombre, u.apellido, r.nombre_rol, u.foto_perfil 
            FROM Usuarios u 
            JOIN Roles r ON u.id_rol = r.id_rol 
            WHERE u.id_usuario != $1 AND u.estado = true
            ORDER BY u.nombre ASC
        `;
        const allUsersRes = await db.query(allUsersQuery, [userId]);

        // C. LOGICA DE CHAT ACTIVO
        let activeChat = null;
        let messages = [];

        if (targetId) {
            // 1. Verificar si el usuario destino existe
            const targetRes = await db.query(`
                SELECT u.id_usuario, u.nombre, u.apellido, u.foto_perfil, r.nombre_rol, u.email, u.ultimo_login
                FROM Usuarios u 
                JOIN Roles r ON u.id_rol = r.id_rol 
                WHERE u.id_usuario = $1
            `, [targetId]);

            if (targetRes.rows.length > 0) {
                const targetUser = targetRes.rows[0];

                // 2. Cargar historial de mensajes
                const msgsRes = await db.query(`
                    SELECT id_mensaje, id_remitente, contenido, fecha_envio, leido
                    FROM Mensajes_Seguros
                    WHERE (id_remitente = $1 AND id_destinatario = $2)
                       OR (id_remitente = $2 AND id_destinatario = $1)
                    ORDER BY fecha_envio ASC
                `, [userId, targetId]);
                messages = msgsRes.rows;

                // 3. Marcar como leídos (Visto azul)
                await db.query(`
                    UPDATE Mensajes_Seguros SET leido = true 
                    WHERE id_remitente = $1 AND id_destinatario = $2
                `, [targetId, userId]);

                // 4. Construir objeto de chat activo
                activeChat = {
                    ...targetUser,
                    messages: messages
                };

                // 5. Si es un chat nuevo (no está en contactos), lo simulamos en la lista visualmente
                const existsInContacts = contacts.find(c => c.id_usuario === targetId);
                if (!existsInContacts && messages.length === 0) {
                    // Es un chat virgen, lo añadimos temporalmente al inicio de la lista
                    contacts.unshift({
                        id_usuario: targetUser.id_usuario,
                        nombre: targetUser.nombre,
                        apellido: targetUser.apellido,
                        foto_perfil: targetUser.foto_perfil,
                        nombre_rol: targetUser.nombre_rol,
                        ultimo_mensaje: 'Nueva conversación',
                        fecha_envio: new Date(),
                        no_leidos: 0
                    });
                }
            } else {
                // Si el ID no existe, redirigir al inbox limpio
                return res.redirect('/dashboard/communication');
            }
        }

        // D. RENDERIZAR
        res.render('dashboard/communication', {
            title: 'Centro de Mensajería',
            user: req.session.user,
            contacts: contacts,
            allUsers: allUsersRes.rows, // <--- Nueva lista para el buscador global
            activeChat: activeChat
        });

    } catch (error) {
        console.error('Error Chat System:', error);
        res.status(500).render('error', { 
            title: 'Error de Comunicación', 
            message: 'No se pudo conectar con el servidor de mensajería.', 
            error, user: req.session.user 
        });
    }
};

// ====================================================================
// 2. ENVIAR MENSAJE (MOTOR DE TIEMPO REAL) 🚀
// ====================================================================
const sendMessage = async (req, res) => {
    const { receiverId, content } = req.body; // El frontend debe mandar 'receiverId' (no 'id_destinatario' para ser consistente con JS)
    const senderId = req.session.user.id_usuario;

    // Adaptador por si el frontend manda nombres diferentes
    const destId = receiverId || req.body.id_destinatario; 
    const texto = content || req.body.contenido;

    try {
        if (!texto || !destId) return res.status(400).json({ success: false, error: 'Mensaje vacío o destinatario inválido' });

        // 1. Guardar en BD
        const result = await db.query(`
            INSERT INTO Mensajes_Seguros (id_remitente, id_destinatario, contenido, fecha_envio, leido)
            VALUES ($1, $2, $3, NOW(), false)
            RETURNING id_mensaje, fecha_envio
        `, [senderId, destId, texto]);

        const newMsg = result.rows[0];

        // 2. Notificar (Campanita) solo si no es un mensaje repetitivo
        // Verificamos si ya hay una notificación no leída de este usuario para no hacer spam
        const checkNotif = await db.query(`
            SELECT id_notificacion FROM Notificaciones 
            WHERE id_usuario = $1 AND tipo = 'mensaje' AND leido = false 
            AND mensaje LIKE $2
        `, [destId, `%${req.session.user.nombre}%`]);

        if (checkNotif.rows.length === 0) {
            await db.query(`
                INSERT INTO Notificaciones (id_usuario, tipo, mensaje, enlace_accion, fecha_creacion)
                VALUES ($1, 'mensaje', 'Nuevo mensaje de ' || $2, '/dashboard/communication?chat=' || $3, NOW())
            `, [destId, req.session.user.nombre, senderId]);
        }

        // 3. Responder Éxito
        res.json({ 
            success: true, 
            message: 'Enviado', 
            data: { 
                id: newMsg.id_mensaje, 
                content: texto, 
                time: newMsg.fecha_envio 
            } 
        });

    } catch (error) {
        console.error('Error enviando mensaje:', error);
        res.status(500).json({ success: false, error: 'Error interno de mensajería' });
    }
};

// ====================================================================
// 3. API AUXILIARES
// ====================================================================
const getNotifications = async (req, res) => {
    try {
        const result = await db.query(`SELECT * FROM Notificaciones WHERE id_usuario = $1 ORDER BY fecha_creacion DESC LIMIT 10`, [req.session.user.id_usuario]);
        res.json(result.rows);
    } catch (error) { res.status(500).json([]); }
};

const markNotificationAsRead = async (req, res) => {
    try {
        await db.query('UPDATE Notificaciones SET leido = true WHERE id_notificacion = $1', [req.params.id]);
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false }); }
};

module.exports = {
    getChatInterface,
    sendMessage,
    getNotifications,
    markNotificationAsRead
};
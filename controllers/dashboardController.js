const db = require('../config/database');
const { hashPassword } = require('../utils/helpers');

// 1. DASHBOARD PRINCIPAL
const getAdminDashboard = async (req, res) => {
    try {
        // Estadísticas
        const statsQuery = await db.query(`
            SELECT 
                (SELECT COUNT(*) FROM Usuarios) as total_usuarios,
                (SELECT COUNT(*) FROM Pacientes) as total_pacientes,
                (SELECT COUNT(*) FROM Terapeutas) as total_terapeutas,
                (SELECT COUNT(*) FROM Citas WHERE fecha_hora >= CURRENT_DATE) as citas_pendientes
        `);
        const stats = statsQuery.rows[0];

        // Lista de Usuarios
        const usersQuery = await db.query(`
            SELECT u.id_usuario, u.nombre, u.apellido, u.email, u.estado, r.nombre_rol, u.fecha_registro
            FROM Usuarios u
            JOIN Roles r ON u.id_rol = r.id_rol
            ORDER BY u.fecha_registro DESC
            LIMIT 20
        `);

        res.render('dashboard/admin', {
            title: 'Panel de Administración',
            user: req.session.user,
            stats: stats,
            users: usersQuery.rows,
            msg: req.query.msg || null
        });

    } catch (error) {
        console.error(error);
        res.status(500).render('error', { 
            title: 'Error del Sistema',
            message: 'Error cargando el panel', 
            error: error,
            user: req.session.user 
        });
    }
};

// 2. CREAR USUARIO
const showCreateUserForm = async (req, res) => {
    res.render('dashboard/create-user', {
        title: 'Nuevo Usuario',
        user: req.session.user,
        error: null,
        formData: {}
    });
};

const createUser = async (req, res) => {
    const { nombre, apellido, email, password, rol, telefono } = req.body;
    const client = await db.pool.connect();

    try {
        await client.query('BEGIN');
        
        // Validar email único
        const existing = await client.query('SELECT email FROM Usuarios WHERE email = $1', [email]);
        if (existing.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.render('dashboard/create-user', {
                title: 'Nuevo Usuario',
                user: req.session.user,
                error: 'El correo electrónico ya está registrado.',
                formData: req.body
            });
        }

        const hashedPassword = await hashPassword(password);
        const roleRes = await client.query('SELECT id_rol FROM Roles WHERE nombre_rol = $1', [rol]);
        
        const userRes = await client.query(`
            INSERT INTO Usuarios (id_rol, nombre, apellido, email, password_hash, telefono, estado, email_verificado, fecha_registro)
            VALUES ($1, $2, $3, $4, $5, $6, true, true, NOW())
            RETURNING id_usuario`,
            [roleRes.rows[0].id_rol, nombre, apellido, email, hashedPassword, telefono]
        );

        const newUserId = userRes.rows[0].id_usuario;

        if (rol === 'Paciente') {
            await client.query('INSERT INTO Pacientes (id_usuario) VALUES ($1)', [newUserId]);
        } else if (rol === 'Terapeuta') {
            await client.query('INSERT INTO Terapeutas (id_usuario) VALUES ($1)', [newUserId]);
        }

        await client.query('COMMIT');
        res.redirect('/dashboard/admin?msg=created');

    } catch (error) {
        await client.query('ROLLBACK');
        console.error(error);
        res.render('dashboard/create-user', {
            title: 'Nuevo Usuario',
            user: req.session.user,
            error: 'Error: ' + error.message,
            formData: req.body
        });
    } finally {
        client.release();
    }
};

// 3. EDITAR USUARIO
const showEditUserForm = async (req, res) => {
    const { id } = req.params;
    try {
        // Buscamos al usuario por ID
        const result = await db.query(`
            SELECT u.*, r.nombre_rol 
            FROM Usuarios u 
            JOIN Roles r ON u.id_rol = r.id_rol 
            WHERE u.id_usuario = $1`, [id]);

        if (result.rows.length === 0) {
            return res.redirect('/dashboard/admin'); // Si no existe, volver al admin
        }

        res.render('dashboard/edit-user', {
            title: 'Editar Usuario',
            user: req.session.user,
            editUser: result.rows[0], // Pasamos los datos del usuario a editar
            error: null
        });
    } catch (error) {
        console.error(error);
        res.redirect('/dashboard/admin');
    }
};

// 6. PROCESAR EDICIÓN (POST) - BLINDADO
const updateUser = async (req, res) => {
    const { id } = req.params;
    const { nombre, apellido, email, telefono, password, rol, estado } = req.body; 
    const client = await db.pool.connect();

    try {
        await client.query('BEGIN');

        // 1. VERIFICACIÓN DE SEGURIDAD: ¿A quién estamos editando?
        // Consultamos el rol actual del usuario en la BD antes de tocar nada
        const checkUser = await client.query(`
            SELECT r.nombre_rol 
            FROM Usuarios u 
            JOIN Roles r ON u.id_rol = r.id_rol 
            WHERE u.id_usuario = $1`, 
            [id]
        );

        let estadoBool = estado === 'true'; // Convertir input a booleano

        // SI EL USUARIO ES ADMIN -> FORZAR SIEMPRE ACTIVO (true)
        if (checkUser.rows.length > 0) {
            const currentRole = checkUser.rows[0].nombre_rol;
            if (currentRole === 'Administrador' || currentRole === 'Admin') {
                estadoBool = true; // ¡Protección activada!
            }
        }

        // 2. Actualizar datos básicos + ESTADO FORZADO
        await client.query(`
            UPDATE Usuarios 
            SET nombre = $1, apellido = $2, email = $3, telefono = $4, estado = $5
            WHERE id_usuario = $6`,
            [nombre, apellido, email, telefono, estadoBool, id]
        );

        // 3. Actualizar contraseña si existe
        if (password && password.trim() !== '') {
            const hashedPassword = await hashPassword(password);
            await client.query('UPDATE Usuarios SET password_hash = $1 WHERE id_usuario = $2', [hashedPassword, id]);
        }

        // 4. Actualizar rol
        const roleRes = await client.query('SELECT id_rol FROM Roles WHERE nombre_rol = $1', [rol]);
        if (roleRes.rows.length > 0) {
             await client.query('UPDATE Usuarios SET id_rol = $1 WHERE id_usuario = $2', [roleRes.rows[0].id_rol, id]);
        }

        await client.query('COMMIT');
        res.redirect('/dashboard/admin?msg=updated');

    } catch (error) {
        await client.query('ROLLBACK');
        console.error(error);
        const userReload = { ...req.body, id_usuario: id, nombre_rol: rol }; 
        res.render('dashboard/edit-user', {
            title: 'Editar Usuario',
            user: req.session.user,
            editUser: userReload,
            error: 'Error actualizando: ' + error.message
        });
    } finally {
        client.release();
    }
};

// ... (resto del código igual) ...

// 4. CAMBIAR ESTADO (Bloquear/Desbloquear) - CON PROTECCIÓN DE ADMIN
const toggleUserStatus = async (req, res) => {
    const { id } = req.params;
    const client = await db.pool.connect(); // Usamos cliente para consultas seguras

    try {
        // 1. Averiguar qué rol tiene el usuario que intentan bloquear
        const checkQuery = await client.query(`
            SELECT r.nombre_rol 
            FROM Usuarios u 
            JOIN Roles r ON u.id_rol = r.id_rol 
            WHERE u.id_usuario = $1`, 
            [id]
        );

        if (checkQuery.rows.length > 0) {
            const roleName = checkQuery.rows[0].nombre_rol;

            // 2. SI ES ADMIN -> PROHIBIDO TOCAR
            if (roleName === 'Administrador' || roleName === 'Admin') {
                return res.redirect('/dashboard/admin?msg=admin_protected');
            }
        }

        // 3. Si no es admin, procedemos a cambiar el estado
        await client.query('UPDATE Usuarios SET estado = NOT estado WHERE id_usuario = $1', [id]);
        res.redirect('/dashboard/admin?msg=status_changed');

    } catch (error) {
        console.error(error);
        res.redirect('/dashboard/admin?msg=error');
    } finally {
        client.release();
    }
};

module.exports = {
    getAdminDashboard,
    showCreateUserForm,
    createUser,
    showEditUserForm,
    updateUser,
    toggleUserStatus
};
const db = require('../config/database');
const { hashPassword } = require('../utils/helpers');

// ==========================================
// 1. DASHBOARD PRINCIPAL (EL CEREBRO)
// ==========================================
const getAdminDashboard = async (req, res) => {
    try {
        // A. ESTADÍSTICAS GENERALES (KPIs)
        const statsQuery = await db.query(`
            SELECT 
                (SELECT COUNT(*) FROM Usuarios) as total_usuarios,
                (SELECT COUNT(*) FROM Pacientes) as total_pacientes,
                (SELECT COUNT(*) FROM Terapeutas) as total_terapeutas,
                (SELECT COUNT(*) FROM Citas WHERE fecha_hora >= CURRENT_DATE) as citas_pendientes
        `);
        const stats = statsQuery.rows[0];

        // B. LISTA DE USUARIOS (Para la tabla de gestión)
        const usersQuery = await db.query(`
            SELECT u.id_usuario, u.nombre, u.apellido, u.email, u.estado, r.nombre_rol, u.fecha_registro
            FROM Usuarios u
            JOIN Roles r ON u.id_rol = r.id_rol
            ORDER BY u.fecha_registro DESC
            LIMIT 20
        `);

        // C. MATCHMAKING: Pacientes SIN Terapeuta
        const unassignedPatients = await db.query(`
            SELECT p.id_paciente, u.nombre, u.apellido, u.email, p.fecha_inicio_tratamiento
            FROM Pacientes p
            JOIN Usuarios u ON p.id_usuario = u.id_usuario
            WHERE p.id_terapeuta IS NULL
        `);

        // D. LISTA DE TERAPEUTAS (Para el selector de asignación)
        const therapistsList = await db.query(`
            SELECT t.id_terapeuta, u.nombre, u.apellido, t.especialidad 
            FROM Terapeutas t
            JOIN Usuarios u ON t.id_usuario = u.id_usuario
            WHERE u.estado = true
        `);

        // E. MONITOR DE CRISIS
        // --- DEBUGGER TEMPORAL ---
        console.log(">>> DIAGNÓSTICO DE TABLAS <<<");
        
        const checkTable = await db.query("SELECT * FROM Checkins_Emocionales");
        console.log(`Total Checkins en BD: ${checkTable.rowCount}`);
        
        if (checkTable.rowCount > 0) {
            console.log("Primer Checkin:", checkTable.rows[0]);
        }
        
        console.log("Alertas detectadas por la query:", riskAlerts.rowCount);
        console.log("Pacientes sin doctor:", unassignedPatients.rowCount);
        console.log(">>>>>>>>>>>>>>>>>>>>>>>>>>>>>");
        // -------------------------s
        // RENDERIZAR VISTA CON TODOS LOS DATOS
        res.render('dashboard/admin', {
            title: 'Centro de Comando MindCare',
            user: req.session.user,
            stats: stats,
            users: usersQuery.rows,
            unassignedPatients: unassignedPatients.rows, // Nuevo
            therapists: therapistsList.rows,             // Nuevo
            alerts: riskAlerts.rows,                     // Nuevo
            msg: req.query.msg || null
        });

    } catch (error) {
        console.error('Error en Dashboard:', error);
        res.status(500).render('error', { 
            title: 'Error del Sistema',
            message: 'Error crítico cargando el panel de administración.', 
            error: error,
            user: req.session.user 
        });
    }
};

// ==========================================
// 2. FUNCIONALIDAD: ASIGNAR TERAPEUTA
// ==========================================
const assignTherapist = async (req, res) => {
    const { id_paciente, id_terapeuta } = req.body;
    
    try {
        await db.query(`
            UPDATE Pacientes 
            SET id_terapeuta = $1, estado_tratamiento = 'activo' 
            WHERE id_paciente = $2`, 
            [id_terapeuta, id_paciente]
        );
        res.redirect('/dashboard/admin?msg=assigned');
    } catch (error) {
        console.error('Error asignando terapeuta:', error);
        res.redirect('/dashboard/admin?msg=error');
    }
};

// ==========================================
// 3. FUNCIONALIDAD: CREAR USUARIO
// ==========================================
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
        
        // Obtener ID Rol
        const roleRes = await client.query('SELECT id_rol FROM Roles WHERE nombre_rol = $1', [rol]);
        
        // Insertar Usuario
        const userRes = await client.query(`
            INSERT INTO Usuarios (id_rol, nombre, apellido, email, password_hash, telefono, estado, email_verificado, fecha_registro)
            VALUES ($1, $2, $3, $4, $5, $6, true, true, NOW())
            RETURNING id_usuario`,
            [roleRes.rows[0].id_rol, nombre, apellido, email, hashedPassword, telefono]
        );

        const newUserId = userRes.rows[0].id_usuario;

        // Insertar en tabla vinculada según rol
        if (rol === 'Paciente') {
            await client.query('INSERT INTO Pacientes (id_usuario, estado_tratamiento, fecha_inicio_tratamiento) VALUES ($1, $2, CURRENT_DATE)', [newUserId, 'activo']);
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

// ==========================================
// 4. FUNCIONALIDAD: EDITAR USUARIO
// ==========================================
const showEditUserForm = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await db.query(`
            SELECT u.*, r.nombre_rol 
            FROM Usuarios u 
            JOIN Roles r ON u.id_rol = r.id_rol 
            WHERE u.id_usuario = $1`, [id]);

        if (result.rows.length === 0) return res.redirect('/dashboard/admin');

        res.render('dashboard/edit-user', {
            title: 'Editar Usuario',
            user: req.session.user,
            editUser: result.rows[0],
            error: null
        });
    } catch (error) {
        console.error(error);
        res.redirect('/dashboard/admin');
    }
};

const updateUser = async (req, res) => {
    const { id } = req.params;
    const { nombre, apellido, email, telefono, password, rol, estado } = req.body; 
    const client = await db.pool.connect();

    try {
        await client.query('BEGIN');

        // -- PROTECCIÓN DE ADMIN --
        const checkUser = await client.query(`
            SELECT r.nombre_rol 
            FROM Usuarios u JOIN Roles r ON u.id_rol = r.id_rol 
            WHERE u.id_usuario = $1`, [id]
        );

        let estadoBool = estado === 'true';

        // Si es Admin, forzamos estado activo para evitar auto-bloqueo
        if (checkUser.rows.length > 0) {
            const currentRole = checkUser.rows[0].nombre_rol;
            if (currentRole === 'Administrador' || currentRole === 'Admin') {
                estadoBool = true; 
            }
        }

        // Actualizar Datos Básicos + Estado
        await client.query(`
            UPDATE Usuarios 
            SET nombre = $1, apellido = $2, email = $3, telefono = $4, estado = $5
            WHERE id_usuario = $6`,
            [nombre, apellido, email, telefono, estadoBool, id]
        );

        // Actualizar Password (si viene)
        if (password && password.trim() !== '') {
            const hashedPassword = await hashPassword(password);
            await client.query('UPDATE Usuarios SET password_hash = $1 WHERE id_usuario = $2', [hashedPassword, id]);
        }

        // Actualizar Rol (con lógica para IDs)
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

// ==========================================
// 5. FUNCIONALIDAD: CAMBIAR ESTADO (Rápido)
// ==========================================
const toggleUserStatus = async (req, res) => {
    const { id } = req.params;
    const client = await db.pool.connect();

    try {
        // Verificar si es Admin antes de bloquear
        const checkQuery = await client.query(`
            SELECT r.nombre_rol FROM Usuarios u JOIN Roles r ON u.id_rol = r.id_rol 
            WHERE u.id_usuario = $1`, [id]
        );

        if (checkQuery.rows.length > 0) {
            const roleName = checkQuery.rows[0].nombre_rol;
            if (roleName === 'Administrador' || roleName === 'Admin') {
                return res.redirect('/dashboard/admin?msg=admin_protected');
            }
        }

        // Cambiar estado
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
    assignTherapist,    // <--- Matchmaking
    showCreateUserForm, // <--- CRUD Create (Form)
    createUser,         // <--- CRUD Create (Logic)
    showEditUserForm,   // <--- CRUD Edit (Form)
    updateUser,         // <--- CRUD Edit (Logic)
    toggleUserStatus    // <--- Soft Delete
};
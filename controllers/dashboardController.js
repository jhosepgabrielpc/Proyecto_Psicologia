const db = require('../config/database');
const { hashPassword } = require('../utils/helpers');

// ==================================================================================
// 1. DASHBOARD PRINCIPAL (LÓGICA DE CARGA PASO A PASO + AUTO-REPARACIÓN)
// ==================================================================================
// Este controlador gestiona la vista principal del Administrador.
// Carga 5 bloques de datos distintos de forma secuencial y segura.
// ==================================================================================
const getAdminDashboard = async (req, res) => {
    console.log("========================================");
    console.log("⚡ INICIANDO CARGA DEL DASHBOARD ADMIN");
    console.log("========================================");

    // 1. VERIFICACIÓN DE SEGURIDAD
    // Si por alguna razón la sesión se perdió, redirigimos antes de intentar cargar nada.
    if (!req.session || !req.session.user || !req.session.user.id_usuario) {
        console.log("⚠️ Sesión no encontrada o usuario inválido. Redirigiendo al login.");
        return res.redirect('/auth/login');
    }

    // 2. INICIALIZACIÓN DE VARIABLES
    // Definimos valores por defecto para evitar errores 'undefined' en la vista EJS
    // si alguna consulta a la base de datos falla.
    let currentUser = req.session.user;
    let statsData = { 
        total_usuarios: 0, 
        total_pacientes: 0, 
        total_terapeutas: 0, 
        citas_pendientes: 0 
    };
    let usersData = [];
    let matchData = []; // Pacientes sin asignar
    let therapistsData = [];
    let alertsData = [];

    try {
        // ---------------------------------------------------------------
        // PASO 0: REFRESCO DE USUARIO (AUTO-REPARACIÓN DE SESIÓN)
        // ---------------------------------------------------------------
        // Consultamos la BD para obtener los datos más frescos del usuario actual.
        // Esto corrige el error "reading 'nombre_rol' of undefined" si la cookie es vieja.
        try {
            const refreshUser = await db.query(`
                SELECT u.*, COALESCE(r.nombre_rol, 'Usuario') as nombre_rol 
                FROM Usuarios u 
                LEFT JOIN Roles r ON u.id_rol = r.id_rol 
                WHERE u.id_usuario = $1
            `, [req.session.user.id_usuario]);
            
            if (refreshUser.rows.length > 0) {
                // Actualizamos la sesión en memoria con los datos frescos de la BD
                req.session.user = refreshUser.rows[0]; 
                currentUser = req.session.user;
                console.log(`   ✓ Sesión refrescada para: ${currentUser.nombre} (${currentUser.nombre_rol})`);
            }
        } catch (e) {
            console.error("   ⚠️ No se pudo refrescar la sesión (usando datos en cache):", e.message);
        }

        // ---------------------------------------------------------------
        // PASO 1: OBTENER KPIs (Estadísticas Generales)
        // ---------------------------------------------------------------
        console.log("--> Paso 1: Cargando Estadísticas (KPIs)...");
        try {
            const statsQuery = await db.query(`
                SELECT 
                    (SELECT COUNT(*) FROM Usuarios)::int as total_usuarios,
                    (SELECT COUNT(*) FROM Pacientes)::int as total_pacientes,
                    (SELECT COUNT(*) FROM Terapeutas)::int as total_terapeutas,
                    (SELECT COUNT(*) FROM Citas WHERE fecha_hora >= CURRENT_DATE)::int as citas_pendientes
            `);
            
            if (statsQuery.rows.length > 0) {
                statsData = statsQuery.rows[0];
            }
            console.log("   ✓ KPIs cargados correctamente.");
        } catch (errorStats) {
            console.error("   X ERROR EN KPIs:", errorStats.message);
            // No detenemos la ejecución, seguimos con los siguientes datos
        }

        // ---------------------------------------------------------------
        // PASO 2: OBTENER LISTA DE USUARIOS (Tabla Principal)
        // ---------------------------------------------------------------
        // Usamos LEFT JOIN y COALESCE para evitar nulos en 'nombre_rol'
        console.log("--> Paso 2: Cargando Lista de Usuarios...");
        try {
            const usersQuery = await db.query(`
                SELECT 
                    u.id_usuario, 
                    u.nombre, 
                    u.apellido, 
                    u.email, 
                    u.estado, 
                    COALESCE(r.nombre_rol, 'Usuario') as nombre_rol, 
                    u.fecha_registro
                FROM Usuarios u
                LEFT JOIN Roles r ON u.id_rol = r.id_rol
                ORDER BY u.fecha_registro DESC
                LIMIT 20
            `);
            usersData = usersQuery.rows;
            console.log(`   ✓ Usuarios cargados: ${usersData.length}`);
        } catch (errorUsers) {
            console.error("   X ERROR EN USUARIOS:", errorUsers.message);
        }

        // ---------------------------------------------------------------
        // PASO 3: MATCHMAKING (Pacientes sin Terapeuta)
        // ---------------------------------------------------------------
        console.log("--> Paso 3: Buscando pacientes sin asignar...");
        try {
            const unassignedQuery = await db.query(`
                SELECT p.id_paciente, u.nombre, u.apellido, u.email, p.fecha_inicio_tratamiento
                FROM Pacientes p
                JOIN Usuarios u ON p.id_usuario = u.id_usuario
                WHERE p.id_terapeuta IS NULL
            `);
            matchData = unassignedQuery.rows;
            console.log(`   ✓ Pacientes pendientes: ${matchData.length}`);
        } catch (errorMatch) {
            console.error("   X ERROR EN MATCHMAKING:", errorMatch.message);
        }

        // ---------------------------------------------------------------
        // PASO 4: LISTA DE TERAPEUTAS (Para el Dropdown)
        // ---------------------------------------------------------------
        console.log("--> Paso 4: Cargando lista de terapeutas...");
        try {
            const therapistsQuery = await db.query(`
                SELECT t.id_terapeuta, u.nombre, u.apellido, t.especialidad 
                FROM Terapeutas t
                JOIN Usuarios u ON t.id_usuario = u.id_usuario
                WHERE u.estado = true
            `);
            therapistsData = therapistsQuery.rows;
            console.log(`   ✓ Terapeutas disponibles: ${therapistsData.length}`);
        } catch (errorTherapists) {
            console.error("   X ERROR EN TERAPEUTAS:", errorTherapists.message);
        }

        // ---------------------------------------------------------------
        // PASO 5: MONITOR DE CRISIS (Torre de Control)
        // ---------------------------------------------------------------
        console.log("--> Paso 5: Escaneando alertas de crisis...");
        try {
            const riskQuery = await db.query(`
                SELECT c.id_checkin, c.valencia, c.emocion_principal, c.notas, c.fecha_hora, 
                       u.nombre, u.apellido, u.id_usuario
                FROM Checkins_Emocionales c
                JOIN Pacientes p ON c.id_paciente = p.id_paciente
                JOIN Usuarios u ON p.id_usuario = u.id_usuario
                WHERE c.requiere_atencion = true OR c.valencia <= 2
                ORDER BY c.fecha_hora DESC
                LIMIT 5
            `);
            alertsData = riskQuery.rows;
            console.log(`   ✓ Alertas detectadas: ${alertsData.length}`);
        } catch (errorAlerts) {
            // Es común que falle si la tabla no existe aún, así que lo manejamos suavemente
            console.error("   X ERROR EN ALERTAS (Posiblemente tabla vacía o inexistente):", errorAlerts.message);
            alertsData = []; // Aseguramos que sea un array vacío
        }

        // ---------------------------------------------------------------
        // PASO 6: RENDERIZADO FINAL
        // ---------------------------------------------------------------
        console.log("--> Paso 6: Renderizando vista 'dashboard/admin'...");
        
        res.render('dashboard/admin', {
            title: 'Centro de Comando MindCare',
            user: currentUser, // Usamos el usuario fresco
            
            // Datos Blindados (Nunca serán undefined)
            stats: statsData,
            users: usersData,
            unassignedPatients: matchData,
            therapists: therapistsData,
            alerts: alertsData,
            
            msg: req.query.msg || null // Mensajes flash (created, updated, error)
        });
        
        console.log("✅ DASHBOARD CARGADO EXITOSAMENTE");
        console.log("========================================");

    } catch (errorGlobal) {
        // CATCH FINAL: Si algo explota catastróficamente
        console.error("🔥 ERROR FATAL EN DASHBOARD CONTROLLER:", errorGlobal);
        
        res.status(500).render('error', { 
            title: 'Error Crítico del Sistema',
            message: 'No se pudo cargar el Panel de Control debido a un error interno.', 
            error: process.env.NODE_ENV === 'development' ? errorGlobal : {},
            user: req.session.user 
        });
    }
};

// ==================================================================================
// 2. FUNCIONALIDAD: ASIGNAR TERAPEUTA (MATCHMAKING)
// ==================================================================================
const assignTherapist = async (req, res) => {
    console.log("--> Intentando asignar terapeuta...");
    const { id_paciente, id_terapeuta } = req.body;
    
    try {
        if (!id_paciente || !id_terapeuta) {
            throw new Error("Faltan IDs para la asignación.");
        }

        await db.query(`
            UPDATE Pacientes 
            SET id_terapeuta = $1, estado_tratamiento = 'activo', fecha_inicio_tratamiento = NOW()
            WHERE id_paciente = $2`, 
            [id_terapeuta, id_paciente]
        );
        
        console.log(`   ✓ Paciente ${id_paciente} asignado a Terapeuta ${id_terapeuta}`);
        res.redirect('/dashboard/admin?msg=assigned');

    } catch (error) {
        console.error("   X Error asignando terapeuta:", error.message);
        res.redirect('/dashboard/admin?msg=error');
    }
};

// ==================================================================================
// 3. FUNCIONALIDAD: MOSTRAR FORMULARIO CREAR USUARIO
// ==================================================================================
const showCreateUserForm = async (req, res) => {
    // Renderiza la vista pasando objetos vacíos necesarios
    res.render('dashboard/create-user', {
        title: 'Nuevo Usuario',
        user: req.session.user,
        error: null,
        formData: {} 
    });
};

// ==================================================================================
// 4. FUNCIONALIDAD: LÓGICA DE CREAR USUARIO (TRANSACCIÓN)
// ==================================================================================
const createUser = async (req, res) => {
    console.log("--> Iniciando creación de usuario...");
    const { nombre, apellido, email, password, rol, telefono } = req.body;
    
    const client = await db.pool.connect(); // Cliente para transacción

    try {
        await client.query('BEGIN'); // Inicio
        
        // 1. Validar email único
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

        // 2. Hashear Password
        const hashedPassword = await hashPassword(password);
        
        // 3. Obtener ID del Rol
        const roleRes = await client.query('SELECT id_rol FROM Roles WHERE nombre_rol = $1', [rol]);
        // Fallback: Si no encuentra el rol, asigna 'Paciente' (ID 6) por seguridad
        const idRol = roleRes.rows.length > 0 ? roleRes.rows[0].id_rol : 6;
        
        // 4. Insertar Usuario
        const userRes = await client.query(`
            INSERT INTO Usuarios (id_rol, nombre, apellido, email, password_hash, telefono, estado, email_verificado, fecha_registro)
            VALUES ($1, $2, $3, $4, $5, $6, true, true, NOW())
            RETURNING id_usuario`,
            [idRol, nombre, apellido, email, hashedPassword, telefono]
        );

        const newUserId = userRes.rows[0].id_usuario;

        // 5. Insertar en tabla dependiente
        if (rol === 'Paciente') {
            await client.query('INSERT INTO Pacientes (id_usuario, estado_tratamiento, fecha_inicio_tratamiento) VALUES ($1, $2, CURRENT_DATE)', [newUserId, 'activo']);
        } else if (rol === 'Terapeuta') {
            await client.query('INSERT INTO Terapeutas (id_usuario, especialidad) VALUES ($1, $2)', [newUserId, 'General']);
        }

        await client.query('COMMIT'); // Éxito
        console.log(`   ✓ Usuario creado: ${email}`);
        res.redirect('/dashboard/admin?msg=created');

    } catch (error) {
        await client.query('ROLLBACK'); // Error
        console.error("   X Error creando usuario:", error);
        res.render('dashboard/create-user', {
            title: 'Nuevo Usuario',
            user: req.session.user,
            error: 'Error del sistema: ' + error.message,
            formData: req.body
        });
    } finally {
        client.release();
    }
};

// ==================================================================================
// 5. FUNCIONALIDAD: MOSTRAR FORMULARIO DE EDICIÓN
// ==================================================================================
const showEditUserForm = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await db.query(`
            SELECT u.*, r.nombre_rol 
            FROM Usuarios u 
            LEFT JOIN Roles r ON u.id_rol = r.id_rol 
            WHERE u.id_usuario = $1`, [id]);

        if (result.rows.length === 0) {
            return res.redirect('/dashboard/admin');
        }

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

// ==================================================================================
// 6. FUNCIONALIDAD: ACTUALIZAR USUARIO
// ==================================================================================
const updateUser = async (req, res) => {
    const { id } = req.params;
    const { nombre, apellido, email, telefono, password, rol, estado } = req.body; 
    const client = await db.pool.connect();

    try {
        await client.query('BEGIN');

        // Protección: Verificar si es Admin
        const checkUser = await client.query(`
            SELECT r.nombre_rol 
            FROM Usuarios u JOIN Roles r ON u.id_rol = r.id_rol 
            WHERE u.id_usuario = $1`, [id]
        );

        let estadoBool = estado === 'true';

        // Si intentan bloquear a un Admin, lo impedimos forzosamente
        if (checkUser.rows.length > 0) {
            const currentRole = checkUser.rows[0].nombre_rol;
            if (currentRole === 'Administrador' || currentRole === 'Admin') {
                estadoBool = true; 
            }
        }

        // Update Usuario
        await client.query(`
            UPDATE Usuarios 
            SET nombre = $1, apellido = $2, email = $3, telefono = $4, estado = $5
            WHERE id_usuario = $6`,
            [nombre, apellido, email, telefono, estadoBool, id]
        );

        // Update Password (Opcional)
        if (password && password.trim() !== '') {
            const hashedPassword = await hashPassword(password);
            await client.query('UPDATE Usuarios SET password_hash = $1 WHERE id_usuario = $2', [hashedPassword, id]);
        }

        // Update Rol
        const roleRes = await client.query('SELECT id_rol FROM Roles WHERE nombre_rol = $1', [rol]);
        if (roleRes.rows.length > 0) {
             await client.query('UPDATE Usuarios SET id_rol = $1 WHERE id_usuario = $2', [roleRes.rows[0].id_rol, id]);
        }

        await client.query('COMMIT');
        res.redirect('/dashboard/admin?msg=updated');

    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Error actualizando:", error);
        
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

// ==================================================================================
// 7. FUNCIONALIDAD: BLOQUEO RÁPIDO (SOFT DELETE)
// ==================================================================================
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

        // Toggle Estado
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
    assignTherapist,
    showCreateUserForm,
    createUser,
    showEditUserForm,
    updateUser,
    toggleUserStatus
};
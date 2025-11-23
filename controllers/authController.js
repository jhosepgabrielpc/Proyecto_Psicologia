const db = require('../config/database');
const bcrypt = require('bcryptjs'); // O usa tu helper 'comparePassword' si prefieres
const { validationResult } = require('express-validator');
const { hashPassword, comparePassword, generateVerificationToken } = require('../utils/helpers');
// const { sendVerificationEmail } = require('../config/email'); // Descomenta si tienes email configurado

// ==================================================================
// 1. MÉTODOS DE VISTA (GET)
// ==================================================================

const showRegisterForm = (req, res) => {
    if (req.session && req.session.user) {
        return res.redirect('/dashboard');
    }
    res.render('auth/register', {
        title: 'Registro - MindCare',
        user: null,
        errors: [],
        formData: {}
    });
};

const showLoginForm = (req, res) => {
    if (req.session && req.session.user) {
        return res.redirect('/dashboard');
    }
    
    // Capturamos mensajes de error/éxito de la URL (ej: ?msg=auth_required)
    let errors = [];
    if (req.query.msg === 'auth_required') errors.push({ msg: 'Debes iniciar sesión para continuar.' });
    if (req.query.msg === 'logout_success') errors.push({ msg: 'Has cerrado sesión correctamente.' });
    if (req.query.msg === 'register_success') errors.push({ msg: 'Cuenta creada. Inicia sesión.' });

    res.render('auth/login', {
        title: 'Iniciar Sesión - MindCare',
        user: null,
        errors: errors,
        formData: {}
    });
};

// ==================================================================
// 2. MÉTODOS DE LÓGICA (POST)
// ==================================================================

// A. REGISTRO DE USUARIO
const register = async (req, res) => {
    // 1. Validación de formulario
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.render('auth/register', {
            title: 'Registro - MindCare',
            user: null,
            errors: errors.array(),
            formData: req.body
        });
    }

    const client = await db.pool.connect();
    const { email, password, nombre, apellido, telefono, rol } = req.body; // Añade campos según tu form

    try {
        await client.query('BEGIN');

        // 2. Verificar si ya existe el email
        const existingUser = await client.query('SELECT id_usuario FROM Usuarios WHERE email = $1', [email]);
        if (existingUser.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.render('auth/register', {
                title: 'Registro - MindCare',
                user: null,
                errors: [{ msg: 'El correo electrónico ya está registrado.' }],
                formData: req.body
            });
        }

        // 3. Obtener Rol (Default: Paciente)
        // Normalizamos para aceptar 'Paciente' o el ID directo si viniera
        const nombreRol = rol || 'Paciente';
        const roleResult = await client.query('SELECT id_rol FROM Roles WHERE nombre_rol = $1', [nombreRol]);
        
        if (roleResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.render('auth/register', {
                title: 'Registro',
                user: null,
                errors: [{ msg: 'El rol seleccionado no es válido.' }],
                formData: req.body
            });
        }
        const idRol = roleResult.rows[0].id_rol;

        // 4. Crear Usuario
        // Asegúrate de usar tu helper de hash o bcrypt directo
        const hashedPassword = await hashPassword(password); 
        
        const userResult = await client.query(
            `INSERT INTO Usuarios (id_rol, email, password_hash, nombre, apellido, telefono, fecha_registro, estado, email_verificado)
             VALUES ($1, $2, $3, $4, $5, $6, NOW(), true, false) 
             RETURNING id_usuario`,
            [idRol, email, hashedPassword, nombre, apellido, telefono]
        );

        const newUserId = userResult.rows[0].id_usuario;

        // 5. Crear entrada vinculada
        if (nombreRol === 'Paciente') {
            await client.query(
                'INSERT INTO Pacientes (id_usuario, estado_tratamiento, fecha_inicio_tratamiento) VALUES ($1, $2, CURRENT_DATE)',
                [newUserId, 'activo']
            );
        } else if (nombreRol === 'Terapeuta') {
            await client.query('INSERT INTO Terapeutas (id_usuario) VALUES ($1)', [newUserId]);
        }

        await client.query('COMMIT');

        // 6. Email (Opcional, no bloqueante)
        // try { await sendVerificationEmail(...) } catch(e) { ... }

        res.redirect('/auth/login?msg=register_success');

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error en registro:', error);
        res.render('auth/register', {
            title: 'Registro',
            user: null,
            errors: [{ msg: 'Error del servidor: ' + error.message }],
            formData: req.body
        });
    } finally {
        client.release();
    }
};

// B. INICIO DE SESIÓN (LOGIN)
const login = async (req, res) => {
    // 1. Validación básica
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.render('auth/login', {
            title: 'Iniciar Sesión',
            user: null,
            errors: errors.array(),
            formData: { email: req.body.email }
        });
    }

    const { email, password } = req.body;

    try {
        // 2. Buscar Usuario + ROL (JOIN IMPORTANTE)
        const result = await db.query(`
            SELECT u.*, r.nombre_rol
            FROM Usuarios u
            JOIN Roles r ON u.id_rol = r.id_rol
            WHERE u.email = $1
        `, [email]);

        // Función helper para error de login
        const returnError = (msg) => {
            return res.render('auth/login', {
                title: 'Iniciar Sesión',
                user: null,
                errors: [{ msg }],
                formData: { email }
            });
        };

        // 3. Verificar existencia
        if (result.rows.length === 0) return returnError('Credenciales inválidas.');

        const user = result.rows[0];

        // 4. Verificar Estado
        if (!user.estado) return returnError('Tu cuenta ha sido desactivada. Contacta a soporte.');

        // 5. Verificar Contraseña
        // Usa tu helper o bcrypt directo
        const isValid = await comparePassword(password, user.password_hash);
        if (!isValid) return returnError('Contraseña incorrecta.');

        // 6. CREAR SESIÓN (LA CLAVE DEL ÉXITO)
        // Guardamos nombre_rol explícitamente para que el middleware lo encuentre
        req.session.user = {
            id_usuario: user.id_usuario,
            email: user.email,
            nombre: user.nombre,
            apellido: user.apellido,
            id_rol: user.id_rol,
            nombre_rol: user.nombre_rol, // ¡ESTO ES CRÍTICO!
            foto_perfil: user.foto_perfil
        };

        // Actualizar último login
        await db.query('UPDATE Usuarios SET ultimo_login = NOW() WHERE id_usuario = $1', [user.id_usuario]);

        console.log(`✅ Login: ${user.email} entró como ${user.nombre_rol}`);

        // 7. Redirección Centralizada
        // Enviamos al usuario al "Lobby" (/dashboard) y que él decida a dónde mandarlo
        res.redirect('/dashboard');

    } catch (error) {
        console.error('Error en login:', error);
        res.render('auth/login', {
            title: 'Error',
            user: null,
            errors: [{ msg: 'Error interno del servidor.' }],
            formData: { email }
        });
    }
};

// C. CERRAR SESIÓN
const logout = (req, res) => {
    req.session.destroy((err) => {
        if (err) console.error('Error logout:', err);
        res.redirect('/auth/login?msg=logout_success');
    });
};

module.exports = {
    showRegisterForm,
    showLoginForm,
    register,
    login,
    logout
};
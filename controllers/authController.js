const db = require('../config/database');
const bcrypt = require('bcryptjs');
const { validationResult } = require('express-validator');

// ==================================================================
// 1. VISTAS (GET)
// ==================================================================

// Login (Sin cambios)
const showLoginForm = (req, res) => {
    if (req.session && req.session.user) return res.redirect('/dashboard');
    
    let errors = [];
    if (req.query.msg === 'auth_required') errors.push({ msg: 'Debes iniciar sesión para continuar.' });
    if (req.query.msg === 'logout_success') errors.push({ msg: 'Has cerrado sesión correctamente.' });
    if (req.query.msg === 'register_success') errors.push({ msg: 'Cuenta creada. Inicia sesión.' });
    if (req.query.msg === 'therapist_created') errors.push({ msg: 'Perfil profesional creado. Espere validación.' });

    res.render('auth/login', {
        title: 'Iniciar Sesión - MindCare',
        user: null,
        errors: errors,
        formData: {}
    });
};

// Registro Paciente (Público)
const showRegisterForm = (req, res) => {
    if (req.session && req.session.user) return res.redirect('/dashboard');
    res.render('auth/register', { title: 'Registro Paciente', user: null, errors: [], formData: {} });
};

// Registro Terapeuta (Profesional - NUEVO)
const showTherapistRegisterForm = (req, res) => {
    if (req.session && req.session.user) return res.redirect('/dashboard');
    res.render('auth/register-therapist', { title: 'Portal Profesional', user: null, errors: [], formData: {} });
};

// ==================================================================
// 2. LÓGICA (POST)
// ==================================================================

// A. LOGIN (Mantenemos tu lógica que ya funciona)
const login = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.render('auth/login', { title: 'Iniciar Sesión', user: null, errors: errors.array(), formData: { email: req.body.email } });
    }

    const { email, password } = req.body;

    try {
        const result = await db.query(`
            SELECT u.*, r.nombre_rol
            FROM Usuarios u
            JOIN Roles r ON u.id_rol = r.id_rol
            WHERE u.email = $1
        `, [email]);

        const returnError = (msg) => {
            return res.render('auth/login', { title: 'Iniciar Sesión', user: null, errors: [{ msg }], formData: { email } });
        };

        if (result.rows.length === 0) return returnError('Credenciales inválidas.');
        const user = result.rows[0];

        if (!user.estado) return returnError('Tu cuenta ha sido desactivada. Contacta a soporte.');

        const isValid = await bcrypt.compare(password, user.password_hash);
        if (!isValid) return returnError('Contraseña incorrecta.');

        // Crear Sesión
        req.session.user = {
            id_usuario: user.id_usuario,
            email: user.email,
            nombre: user.nombre,
            apellido: user.apellido,
            id_rol: user.id_rol,
            nombre_rol: user.nombre_rol,
            foto_perfil: user.foto_perfil
        };

        await db.query('UPDATE Usuarios SET ultimo_login = NOW() WHERE id_usuario = $1', [user.id_usuario]);
        console.log(`✅ Login: ${user.email} entró como ${user.nombre_rol}`);
        res.redirect('/dashboard');

    } catch (error) {
        console.error('Error en login:', error);
        res.render('auth/login', { title: 'Error', user: null, errors: [{ msg: 'Error interno del servidor.' }], formData: { email } });
    }
};

// B. REGISTRO DE PACIENTE (Simplificado)
const register = async (req, res) => {
    const { email, password, nombre, apellido, telefono, fecha_nacimiento } = req.body;
    const client = await db.pool.connect();

    try {
        await client.query('BEGIN');

        // Verificar duplicados
        const existingUser = await client.query('SELECT id_usuario FROM Usuarios WHERE email = $1', [email]);
        if (existingUser.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.render('auth/register', { title: 'Registro', user: null, errors: [{ msg: 'El correo ya está registrado.' }], formData: req.body });
        }

        // Rol Paciente
        const roleResult = await client.query("SELECT id_rol FROM Roles WHERE nombre_rol = 'Paciente'");
        const idRol = roleResult.rows[0].id_rol;

        // Crear Usuario
        const hashedPassword = await bcrypt.hash(password, 10);
        const userResult = await client.query(
            `INSERT INTO Usuarios (id_rol, email, password_hash, nombre, apellido, telefono, fecha_registro, estado)
             VALUES ($1, $2, $3, $4, $5, $6, NOW(), true) RETURNING id_usuario`,
            [idRol, email, hashedPassword, nombre, apellido, telefono]
        );
        const newUserId = userResult.rows[0].id_usuario;

        // Crear Paciente
        await client.query(
            'INSERT INTO Pacientes (id_usuario, fecha_nacimiento, estado_tratamiento, fecha_inicio_tratamiento) VALUES ($1, $2, $3, CURRENT_DATE)',
            [newUserId, fecha_nacimiento || null, 'activo']
        );

        await client.query('COMMIT');
        res.redirect('/auth/login?msg=register_success');

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error registro paciente:', error);
        res.render('auth/register', { title: 'Registro', user: null, errors: [{ msg: 'Error técnico: ' + error.message }], formData: req.body });
    } finally {
        client.release();
    }
};

// C. REGISTRO DE TERAPEUTA (NUEVO - Protegido)
// C. REGISTRO DE TERAPEUTA (ACTUALIZADO CON EDAD Y TELÉFONO)
const registerTherapist = async (req, res) => {
    // Obtenemos los nuevos campos del body
    const { nombre, apellido, email, password, especialidad, licencia, codigo_acceso, telefono, fecha_nacimiento } = req.body;
    const client = await db.pool.connect();

    // 1. Validar Código Maestro (Seguridad Base)
    if (codigo_acceso !== 'ADMIN_MINDCARE_2025') {
        return res.render('auth/register-therapist', { 
            title: 'Portal Profesional', 
            user: null, 
            errors: [{ msg: '⛔ CÓDIGO DE ACCESO DENEGADO.' }], 
            formData: req.body 
        });
    }

    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.render('auth/register-therapist', { title: 'Portal Profesional', user: null, errors: errors.array(), formData: req.body });
        }

        await client.query('BEGIN');

        // Verificar duplicados
        const existingUser = await client.query('SELECT id_usuario FROM Usuarios WHERE email = $1', [email]);
        if (existingUser.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.render('auth/register-therapist', { title: 'Portal Profesional', user: null, errors: [{ msg: 'Correo institucional ya registrado.' }], formData: req.body });
        }

        // Rol Terapeuta
        const roleResult = await client.query("SELECT id_rol FROM Roles WHERE nombre_rol = 'Terapeuta'");
        const idRol = roleResult.rows[0].id_rol;

        // Crear Usuario (Incluye Teléfono)
        const hashedPassword = await bcrypt.hash(password, 10);
        const userResult = await client.query(
            `INSERT INTO Usuarios (id_rol, email, password_hash, nombre, apellido, telefono, fecha_registro, estado)
             VALUES ($1, $2, $3, $4, $5, $6, NOW(), true) RETURNING id_usuario`,
            [idRol, email, hashedPassword, nombre, apellido, telefono]
        );
        const newUserId = userResult.rows[0].id_usuario;

        // Crear Terapeuta (Incluye Fecha Nacimiento y Datos Profesionales)
        await client.query(
            'INSERT INTO Terapeutas (id_usuario, especialidad, numero_licencia, fecha_nacimiento) VALUES ($1, $2, $3, $4)',
            [newUserId, especialidad, licencia, fecha_nacimiento]
        );

        await client.query('COMMIT');
        res.redirect('/auth/login?msg=therapist_created');

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error registro terapeuta:', error);
        res.render('auth/register-therapist', { title: 'Portal Profesional', user: null, errors: [{ msg: 'Error técnico: ' + error.message }], formData: req.body });
    } finally {
        client.release();
    }
};

// D. LOGOUT
const logout = (req, res) => {
    req.session.destroy((err) => {
        if (err) console.error('Error logout:', err);
        res.redirect('/auth/login?msg=logout_success');
    });
};

module.exports = {
    showLoginForm,
    showRegisterForm,
    showTherapistRegisterForm,
    login,
    register,
    registerTherapist,
    logout
};
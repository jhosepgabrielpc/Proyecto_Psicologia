const db = require('../config/database');
const {
    hashPassword,
    comparePassword,
    generateToken,
    generateVerificationToken
} = require('../utils/helpers');
const { sendVerificationEmail } = require('../config/email');
const { validationResult } = require('express-validator');

// Código maestro para registro de terapeutas (FIJO)
const THERAPIST_MASTER_CODE = 'ADMIN_MINDCARE_2025';

// ==========================================
// MÉTODOS DE VISTA (GET)
// ==========================================

// Formulario de registro de PACIENTE
const showRegisterForm = (req, res) => {
    res.render('auth/register', {
        title: 'Registro - MindCare',
        user: null,
        errors: [],
        formData: {}
    });
};

// Formulario de login
const showLoginForm = (req, res) => {
    let successMessage = null;
    let errorMessage = null;

    if (req.query.registered === 'true') {
        successMessage = '¡Registro completado! Verifica tu email para iniciar sesión.';
    } else if (req.query.verified === 'true') {
        successMessage = 'Email verificado con éxito. Ya puedes iniciar sesión.';
    } else if (req.query.error) {
        errorMessage = req.query.error.replace(/_/g, ' ');
    }

    res.render('auth/login', {
        title: 'Iniciar Sesión - MindCare',
        user: null,
        success: successMessage,
        errors: errorMessage ? [{ msg: errorMessage }] : [],
        formData: {}
    });
};

// Formulario de registro de TERAPEUTA
const showTherapistRegisterForm = (req, res) => {
    res.render('auth/register-therapist', {
        title: 'Registro Profesional - MindCare',
        user: null,
        errors: [],
        formData: {}
    });
};

// CERRAR SESIÓN
const logout = (req, res) => {
    res.clearCookie('token');
    req.session.destroy((err) => {
        if (err) {
            console.error('Error logout:', err);
            return res.status(500).redirect('/');
        }
        res.redirect('/auth/login?msg=Cerró_sesión_correctamente.');
    });
};

// ==========================================
// REGISTRO PACIENTE
// ==========================================

const register = async (req, res) => {
    const errors = validationResult(req);
    const {
        email,
        password,
        nombre,
        apellido,
        telefono,
        fecha_nacimiento,
        genero
    } = req.body;

    if (!errors.isEmpty()) {
        return res.render('auth/register', {
            title: 'Registro - MindCare',
            user: null,
            errors: errors.array(),
            formData: req.body
        });
    }

    const client = await db.pool.connect();

    try {
        await client.query('BEGIN');

        // Verificar si ya existe
        const existingUser = await client.query(
            'SELECT * FROM usuarios WHERE email = $1',
            [email]
        );

        if (existingUser.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.render('auth/register', {
                title: 'Registro - MindCare',
                user: null,
                errors: [{ msg: 'El correo electrónico ya está registrado.' }],
                formData: req.body
            });
        }

        // Rol Paciente
        const roleResult = await client.query(
            'SELECT id_rol FROM roles WHERE nombre_rol = $1',
            ['Paciente']
        );
        const idRol = roleResult.rows[0].id_rol;

        const hashedPassword = await hashPassword(password);
        const verificationToken = generateVerificationToken();

        const userResult = await client.query(
            `INSERT INTO usuarios 
                (id_rol, email, password_hash, nombre, apellido, telefono, fecha_nacimiento, genero, token_verificacion, fecha_registro)
             VALUES 
                ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
             RETURNING id_usuario, email, nombre, apellido`,
            [idRol, email, hashedPassword, nombre, apellido, telefono, fecha_nacimiento, genero, verificationToken]
        );

        const newUser = userResult.rows[0];

        // Crear paciente
        await client.query(
            `INSERT INTO pacientes (id_usuario, estado_tratamiento, fecha_inicio_tratamiento)
             VALUES ($1, $2, CURRENT_DATE)`,
            [newUser.id_usuario, 'activo']
        );

        await client.query('COMMIT');

        try {
            // await sendVerificationEmail(email, verificationToken, nombre);
            console.log(`Email de verificación simulado enviado a ${email} con token: ${verificationToken}`);
        } catch (emailError) {
            console.error('Error simulado enviando email:', emailError);
        }

        return res.redirect('/auth/login?registered=true');

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error en registro:', error);
        return res.render('auth/register', {
            title: 'Registro - MindCare',
            user: null,
            errors: [{ msg: 'Error interno del servidor. Intente nuevamente.' }],
            formData: req.body
        });
    } finally {
        client.release();
    }
};

// ==========================================
// REGISTRO TERAPEUTA
// ==========================================

const registerTherapist = async (req, res) => {
    const errors = validationResult(req);
    const {
        email,
        password,
        nombre,
        apellido,
        telefono,
        fecha_nacimiento,
        genero,
        especialidad,
        licencia,
        experiencia_anios,
        biografia,
        codigo_acceso
    } = req.body;

    // Errores de express-validator
    if (!errors.isEmpty()) {
        return res.render('auth/register-therapist', {
            title: 'Registro Profesional - MindCare',
            user: null,
            errors: errors.array(),
            formData: req.body
        });
    }

    // Validar código maestro fijo
    if (codigo_acceso !== THERAPIST_MASTER_CODE) {
        return res.render('auth/register-therapist', {
            title: 'Registro Profesional - MindCare',
            user: null,
            errors: [{ msg: 'Código maestro inválido. Contacta al administrador.' }],
            formData: req.body
        });
    }

    const client = await db.pool.connect();

    try {
        await client.query('BEGIN');

        // Verificar email duplicado
        const existingUser = await client.query(
            'SELECT * FROM usuarios WHERE email = $1',
            [email]
        );

        if (existingUser.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.render('auth/register-therapist', {
                title: 'Registro Profesional - MindCare',
                user: null,
                errors: [{ msg: 'El correo electrónico ya está registrado.' }],
                formData: req.body
            });
        }

        // Rol Terapeuta
        const roleResult = await client.query(
            'SELECT id_rol FROM roles WHERE nombre_rol = $1',
            ['Terapeuta']
        );
        const idRol = roleResult.rows[0].id_rol;

        const hashedPassword = await hashPassword(password);
        const verificationToken = generateVerificationToken();

        const userResult = await client.query(
            `INSERT INTO usuarios 
                (id_rol, email, password_hash, nombre, apellido, telefono, fecha_nacimiento, genero, token_verificacion, fecha_registro)
             VALUES 
                ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
             RETURNING id_usuario, email, nombre, apellido`,
            [idRol, email, hashedPassword, nombre, apellido, telefono, fecha_nacimiento, genero, verificationToken]
        );

        const newUser = userResult.rows[0];

        // Normalizar experiencia
        let expAnios = null;
        if (experiencia_anios && experiencia_anios !== '') {
            const n = parseInt(experiencia_anios, 10);
            if (!isNaN(n) && n >= 0 && n <= 80) {
                expAnios = n;
            }
        }

        // Crear terapeuta
        await client.query(
            `INSERT INTO terapeutas 
                (id_usuario, especialidad, nro_licencia, experiencia_anios, biografia, fecha_nacimiento)
             VALUES 
                ($1, $2, $3, $4, $5, $6)`,
            [
                newUser.id_usuario,
                especialidad,
                licencia,
                expAnios,
                biografia || null,
                fecha_nacimiento || null
            ]
        );

        await client.query('COMMIT');

        try {
            // await sendVerificationEmail(email, verificationToken, nombre);
            console.log(`Email de verificación (TERAPEUTA) simulado enviado a ${email} con token: ${verificationToken}`);
        } catch (emailError) {
            console.error('Error simulado enviando email terapeuta:', emailError);
        }

        return res.redirect('/auth/login?registered=true');

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error en registro de terapeuta:', error);
        return res.render('auth/register-therapist', {
            title: 'Registro Profesional - MindCare',
            user: null,
            errors: [{ msg: 'Error interno del servidor. Intente nuevamente.' }],
            formData: req.body
        });
    } finally {
        client.release();
    }
};

// ==========================================
// LOGIN
// ==========================================

const login = async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.render('auth/login', {
            title: 'Iniciar Sesión - MindCare',
            user: null,
            errors: errors.array(),
            formData: { email: req.body.email }
        });
    }

    const { email, password } = req.body;

    try {
        const result = await db.query(
            `SELECT u.*, r.nombre_rol 
             FROM usuarios u 
             JOIN roles r ON u.id_rol = r.id_rol 
             WHERE u.email = $1`,
            [email]
        );

        const returnLoginError = (msg) => {
            return res.render('auth/login', {
                title: 'Iniciar Sesión - MindCare',
                user: null,
                errors: [{ msg }],
                formData: { email }
            });
        };

        if (result.rows.length === 0) {
            return returnLoginError('Credenciales inválidas.');
        }

        const user = result.rows[0];

        if (user.estado === false) {
            return returnLoginError('Cuenta desactivada. Contacta al administrador.');
        }

        if (user.bloqueado_hasta && new Date(user.bloqueado_hasta) > new Date()) {
            return returnLoginError('Tu cuenta está temporalmente bloqueada. Intenta más tarde.');
        }

        const isValidPassword = await comparePassword(password, user.password_hash);

        if (!isValidPassword) {
            await db.query(
                `UPDATE usuarios 
                 SET intentos_login = intentos_login + 1 
                 WHERE id_usuario = $1`,
                [user.id_usuario]
            );
            return returnLoginError('Credenciales inválidas.');
        }

        await db.query(
            `UPDATE usuarios 
             SET intentos_login = 0, ultimo_login = NOW(), bloqueado_hasta = NULL 
             WHERE id_usuario = $1`,
            [user.id_usuario]
        );

        req.session.user = {
            id_usuario: user.id_usuario,
            nombre: user.nombre,
            apellido: user.apellido,
            nombre_rol: user.nombre_rol
        };

        let redirectPath = '/dashboard/patient';

        switch (user.nombre_rol) {
            case 'Administrador':
                redirectPath = '/dashboard/admin';
                break;
            case 'Terapeuta':
                redirectPath = '/dashboard/clinical';
                break;
            case 'Paciente':
            default:
                redirectPath = '/dashboard/patient';
                break;
        }

        return res.redirect(redirectPath);

    } catch (error) {
        console.error('Error en login:', error);
        return res.render('auth/login', {
            title: 'Iniciar Sesión - MindCare',
            user: null,
            errors: [{ msg: 'Error al conectar con el servidor.' }],
            formData: { email }
        });
    }
};

// Stub de verificación de email
const verifyEmail = async (req, res) => {
    return res.redirect('/auth/login?verified=true');
};

const getCurrentUser = async (req, res) => {
    if (!req.session || !req.session.user) {
        return res.status(401).json({ error: 'No autenticado' });
    }
    return res.json({ user: req.session.user });
};

module.exports = {
    showRegisterForm,
    showLoginForm,
    showTherapistRegisterForm,
    register,
    registerTherapist,
    login,
    logout,
    verifyEmail,
    getCurrentUser
};

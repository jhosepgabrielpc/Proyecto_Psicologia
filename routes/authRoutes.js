// routes/authRoutes.js

const express = require('express');
const router = express.Router();
const { check } = require('express-validator');

const authController = require('../controllers/authController');

// ==================================================================
// VALIDADORES PERSONALIZADOS (Lógica Reutilizable)
// ==================================================================

// 1. Validador de Edad (+18, no futuro, sin edades absurdas)
const validarEdad = (value) => {
    if (!value) {
        throw new Error('La fecha de nacimiento es obligatoria');
    }

    const fechaNacimiento = new Date(value);
    if (Number.isNaN(fechaNacimiento.getTime())) {
        throw new Error('La fecha de nacimiento no es válida');
    }

    const hoy = new Date();

    if (fechaNacimiento > hoy) {
        throw new Error('No puedes nacer en el futuro');
    }

    let edad = hoy.getFullYear() - fechaNacimiento.getFullYear();
    const mes = hoy.getMonth() - fechaNacimiento.getMonth();
    if (mes < 0 || (mes === 0 && hoy.getDate() < fechaNacimiento.getDate())) {
        edad--;
    }

    if (edad < 18) {
        throw new Error('Debes ser mayor de 18 años para registrarte');
    }
    if (edad > 100) {
        throw new Error('La edad ingresada no es válida');
    }

    return true;
};

// 2. Validador de Nombre / Apellido (Solo letras y espacios, 2-64 chars)
const validarNombre = (value) => {
    if (!value || typeof value !== 'string') {
        throw new Error('Este campo es obligatorio');
    }

    const limpio = value.trim();

    if (limpio.length < 2 || limpio.length > 64) {
        throw new Error('Debe tener entre 2 y 64 caracteres');
    }

    // Letras (a-z), acentos, Ñ/ñ y espacios
    const regex = /^[a-zA-ZÀ-ÿ\u00f1\u00d1\s]+$/;
    if (!regex.test(limpio)) {
        throw new Error('Solo se permiten letras y espacios');
    }

    return true;
};

// 3. Validador de Celular (Bolivia: Empieza con 6 o 7, exactamente 8 dígitos)
const validarCelular = (value) => {
    if (!value) {
        throw new Error('El celular es obligatorio');
    }

    const limpio = value.trim();
    const regex = /^[67]\d{7}$/; // 6/7 + 7 dígitos = 8 en total

    if (!regex.test(limpio)) {
        throw new Error(
            'El celular debe tener exactamente 8 dígitos y empezar con 6 o 7'
        );
    }

    return true;
};

// 4. Validador de Password (8-128 chars, mayús, minús, número, símbolo)
const validarPassword = (value) => {
    if (!value) {
        throw new Error('La contraseña es obligatoria');
    }

    if (value.length < 8 || value.length > 128) {
        throw new Error('La contraseña debe tener entre 8 y 128 caracteres');
    }

    if (!/[A-Z]/.test(value)) {
        throw new Error(
            'La contraseña debe incluir al menos una letra mayúscula'
        );
    }
    if (!/[a-z]/.test(value)) {
        throw new Error(
            'La contraseña debe incluir al menos una letra minúscula'
        );
    }
    if (!/[0-9]/.test(value)) {
        throw new Error(
            'La contraseña debe incluir al menos un número'
        );
    }
    if (!/[\W_]/.test(value)) {
        throw new Error(
            'La contraseña debe incluir al menos un símbolo (@, #, !, etc.)'
        );
    }

    return true;
};

// ==================================================================
// 1. RUTAS DE VISTA (GET)
// ==================================================================
router.get('/login', authController.showLoginForm);
router.get('/register', authController.showRegisterForm);
router.get('/register-therapist', authController.showTherapistRegisterForm);
router.get('/logout', authController.logout);

// Verificación de email (stub, pero ya conectada)
router.get('/verify-email', authController.verifyEmail);

// API para obtener usuario actual (útil para front)
router.get('/me', authController.getCurrentUser);

// ==================================================================
// 2. RUTAS DE LÓGICA (POST)
// ==================================================================

// A. LOGIN
router.post(
    '/login',
    [
        check('email')
            .trim()
            .notEmpty()
            .withMessage('El email es obligatorio')
            .isEmail()
            .withMessage('El formato del email no es válido')
            .isLength({ max: 254 })
            .withMessage('El email es demasiado largo')
            .normalizeEmail(),
        check('password', 'La contraseña es obligatoria').not().isEmpty()
    ],
    authController.login
);

// B. REGISTRO PACIENTE
router.post(
    '/register',
    [
        check('nombre').custom(validarNombre),
        check('apellido').custom(validarNombre),
        check('telefono').custom(validarCelular),
        check('fecha_nacimiento').custom(validarEdad),
        check('email')
            .trim()
            .notEmpty()
            .withMessage('El email es obligatorio')
            .isEmail()
            .withMessage('El formato del email no es válido')
            .isLength({ max: 254 })
            .withMessage('El email es demasiado largo')
            .normalizeEmail(),
        check('password').custom(validarPassword)
    ],
    authController.register
);

// C. REGISTRO TERAPEUTA
router.post(
    '/register-pro',
    [
        check('nombre').custom(validarNombre),
        check('apellido').custom(validarNombre),
        check('telefono').custom(validarCelular),
        check('fecha_nacimiento').custom(validarEdad),
        check('email')
            .trim()
            .notEmpty()
            .withMessage('El email es obligatorio')
            .isEmail()
            .withMessage('Agrega un email institucional válido')
            .isLength({ max: 254 })
            .withMessage('El email es demasiado largo')
            .normalizeEmail(),
        check('password').custom(validarPassword),
        check('especialidad', 'La especialidad es obligatoria').not().isEmpty(),
        check('licencia')
            .not()
            .isEmpty()
            .withMessage('La matrícula es obligatoria')
            .isAlphanumeric()
            .withMessage('La matrícula debe ser alfanumérica'),
        check('codigo_acceso', 'El código maestro es requerido')
            .not()
            .isEmpty()
    ],
    authController.registerTherapist
);

module.exports = router;

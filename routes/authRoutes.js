const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { check } = require('express-validator');

// ==================================================================
// 1. RUTAS DE VISTA (GET)
// ==================================================================
router.get('/login', authController.showLoginForm);
router.get('/register', authController.showRegisterForm);
router.get('/register-pro', authController.showTherapistRegisterForm);
router.get('/logout', authController.logout);

// ==================================================================
// VALIDATORS PERSONALIZADOS (Lógica Reutilizable)
// ==================================================================

// 1. Validador de Edad (+18 y No Futuro)
const validarEdad = (value) => {
    if (!value) throw new Error('La fecha de nacimiento es obligatoria');
    const fechaNacimiento = new Date(value);
    const hoy = new Date();
    
    // Check Fechas Futuras
    if (fechaNacimiento > hoy) {
        throw new Error('No puedes nacer en el futuro');
    }

    // Cálculo exacto de edad
    let edad = hoy.getFullYear() - fechaNacimiento.getFullYear();
    const mes = hoy.getMonth() - fechaNacimiento.getMonth();
    if (mes < 0 || (mes === 0 && hoy.getDate() < fechaNacimiento.getDate())) {
        edad--;
    }

    if (edad < 18) {
        throw new Error('Debes ser mayor de 18 años para registrarte');
    }
    return true;
};

// 2. Validador de Nombre (Solo letras y espacios)
const validarNombre = (value) => {
    // Regex: Letras (a-z), Acentos (À-ÿ), Ñ (u00f1/D1), Espacios (\s)
    const regex = /^[a-zA-ZÀ-ÿ\u00f1\u00d1\s]+$/;
    if (!regex.test(value)) {
        throw new Error('No se permiten números ni símbolos en el nombre');
    }
    return true;
};

// 3. Validador de Celular (Bolivia: Empieza con 6 o 7, longitud 8)
const validarCelular = (value) => {
    const regex = /^[67]\d{7}$/; // Empieza con 6 o 7, seguido de 7 dígitos
    if (!regex.test(value)) {
        throw new Error('El celular debe tener 8 dígitos y empezar con 6 o 7');
    }
    return true;
};

// 4. Validador de Password (8 chars + 1 especial)
const validarPassword = (value) => {
    if (value.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres');
    // Regex: Al menos un caracter que NO sea letra ni número (\W) o guión bajo (_)
    if (!/[\W_]/.test(value)) {
        throw new Error('La contraseña debe incluir al menos un carácter especial (@, #, !, etc.)');
    }
    return true;
};

// ==================================================================
// 2. RUTAS DE LÓGICA (POST) - SISTEMA BLINDADO
// ==================================================================

// A. LOGIN
router.post('/login', [
    check('email', 'El email es obligatorio').isEmail(),
    check('password', 'La contraseña es obligatoria').not().isEmpty()
], authController.login);

// B. REGISTRO PACIENTE
router.post('/register', [
    check('nombre').custom(validarNombre),
    check('apellido').custom(validarNombre),
    
    check('telefono').custom(validarCelular),
    
    check('fecha_nacimiento').custom(validarEdad),

    check('email', 'El formato del email no es válido').isEmail(),
    
    check('password').custom(validarPassword)
], authController.register);

// C. REGISTRO TERAPEUTA
// C. REGISTRO TERAPEUTA (BLINDADO TOTAL)
router.post('/register-pro', [
    check('nombre').custom(validarNombre),
    check('apellido').custom(validarNombre),

    // Nuevas validaciones
    check('telefono').custom(validarCelular),
    check('fecha_nacimiento').custom(validarEdad),

    check('email', 'Agrega un email institucional válido').isEmail(),
    
    check('password').custom(validarPassword),
    
    check('especialidad', 'La especialidad es obligatoria').not().isEmpty(),
    
    // Matrícula alfanumérica
    check('licencia')
        .isAlphanumeric().withMessage('La matrícula debe ser alfanumérica')
        .not().isEmpty().withMessage('La matrícula es obligatoria'),
    
    check('codigo_acceso', 'El código maestro es requerido').not().isEmpty()
], authController.registerTherapist);

module.exports = router;
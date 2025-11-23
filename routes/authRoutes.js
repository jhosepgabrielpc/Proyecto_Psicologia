const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { check } = require('express-validator');

// ==================================================================
// 1. RUTAS DE VISTA (GET)
// ==================================================================

// Formulario de Registro
router.get('/register', authController.showRegisterForm);

// Formulario de Login
router.get('/login', authController.showLoginForm);

// Cerrar Sesión
router.get('/logout', authController.logout);


// ==================================================================
// 2. RUTAS DE LÓGICA (POST)
// ==================================================================

// Procesar Registro
router.post('/register', [
    check('nombre', 'El nombre es obligatorio').not().isEmpty(),
    check('apellido', 'El apellido es obligatorio').not().isEmpty(),
    check('email', 'Agrega un email válido').isEmail(),
    check('password', 'La contraseña debe tener al menos 6 caracteres').isLength({ min: 6 })
], authController.register);

// Procesar Login
router.post('/login', [
    check('email', 'El email es obligatorio').isEmail(),
    check('password', 'La contraseña es obligatoria').not().isEmpty()
], authController.login);


module.exports = router;
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Importamos los validadores (recuerda que ya les quitamos el handleValidationErrors)
const { validateRegistration, validateLogin } = require('../middleware/validation');
const { authenticateToken } = require('../middleware/auth');

// --- RUTAS GET (Vistas) ---
router.get('/register', authController.showRegisterForm);
router.get('/login', authController.showLoginForm);

// --- RUTAS POST (Procesamiento con Validación) ---
// El orden es: Ruta -> Validador -> Controlador
router.post('/register', validateRegistration, authController.register);
router.post('/login', validateLogin, authController.login);

// --- OTRAS RUTAS ---
router.get('/logout', authController.logout); // GET para que funcione con un simple enlace
router.get('/verify-email', authController.verifyEmail);
router.get('/me', authenticateToken, authController.getCurrentUser);

module.exports = router;
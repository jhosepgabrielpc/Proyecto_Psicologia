const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { validateRegistration, validateLogin } = require('../middleware/validation');
const { authenticateToken } = require('../middleware/auth');

router.get('/register', authController.showRegisterForm);
router.get('/login', authController.showLoginForm);
router.post('/register', validateRegistration, authController.register);
router.post('/login', validateLogin, authController.login);
router.post('/logout', authController.logout);
router.get('/verify-email', authController.verifyEmail);
router.get('/me', authenticateToken, authController.getCurrentUser);

module.exports = router;
// routes/userRoutes.js

const express = require('express');
const router = express.Router();

const { authenticateToken } = require('../middleware/auth');

// Todas las rutas requieren sesión activa
router.use(authenticateToken);

/**
 * GET /users/profile
 * Vista de perfil del usuario actual.
 */
router.get('/profile', async (req, res) => {
    return res.render('profile', {
        title: 'Mi Perfil',
        user: req.session.user
    });
});

module.exports = router;

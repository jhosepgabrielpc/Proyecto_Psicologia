const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
// Importamos el controlador (Asegúrate que el archivo exista en controllers)
const dashboardController = require('../controllers/dashboardController');

// Middleware para asegurar que solo Admin entre a rutas protegidas
const requireAdmin = (req, res, next) => {
    if (req.user.nombre_rol !== 'Admin' && req.user.nombre_rol !== 'Administrador') {
        return res.redirect('/dashboard');
    }
    next();
};

// --- 1. EL LOBBY (Ruta Raíz /dashboard) ---
router.get('/', authenticateToken, (req, res) => {
    const rol = req.user.nombre_rol;
    if (rol === 'Administrador' || rol === 'Admin') {
        return res.redirect('/dashboard/admin');
    } else if (rol === 'Terapeuta') {
        return res.redirect('/dashboard/therapist');
    } else {
        return res.redirect('/dashboard/patient');
    }
});

// --- 2. RUTAS DE ADMINISTRADOR ---

// Dashboard Principal
router.get('/admin', authenticateToken, requireAdmin, dashboardController.getAdminDashboard);

// Crear Usuario (Formulario y Acción)
router.get('/admin/create', authenticateToken, requireAdmin, dashboardController.showCreateUserForm);
router.post('/admin/create', authenticateToken, requireAdmin, dashboardController.createUser);

// Editar Usuario (AQUÍ ESTABA EL PROBLEMA DEL 404 - Asegúrate de tener esto)
router.get('/admin/edit/:id', authenticateToken, requireAdmin, dashboardController.showEditUserForm);
router.post('/admin/edit/:id', authenticateToken, requireAdmin, dashboardController.updateUser);

// Bloquear/Desbloquear Usuario
router.get('/admin/toggle-user/:id', authenticateToken, requireAdmin, dashboardController.toggleUserStatus);


// --- 3. RUTAS DE PACIENTE Y TERAPEUTA (Las mantenemos intactas) ---

router.get('/patient', authenticateToken, (req, res) => {
    if (req.user.nombre_rol !== 'Paciente') return res.redirect('/dashboard');
    res.render('dashboard/patient', { 
        title: 'Dashboard Paciente - MindCare', 
        user: req.session.user 
    });
});

router.get('/therapist', authenticateToken, (req, res) => {
    if (req.user.nombre_rol !== 'Terapeuta') return res.redirect('/dashboard');
    res.render('dashboard/therapist', { 
        title: 'Dashboard Terapeuta - MindCare', 
        user: req.session.user 
    });
});

module.exports = router;
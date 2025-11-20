const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const dashboardController = require('../controllers/dashboardController');

// Middleware de Seguridad Estricta por Rol
const checkRole = (allowedRoles) => {
    return (req, res, next) => {
        const userRole = req.user.nombre_rol;
        // Normalizamos Admin
        const role = (userRole === 'Admin') ? 'Administrador' : userRole;
        
        if (allowedRoles.includes(role)) {
            next();
        } else {
            // Si intenta entrar donde no debe, lo mandamos a SU lugar correcto
            res.redirect('/dashboard'); 
        }
    };
};

// --- 1. EL LOBBY (Ruta Raíz /dashboard) ---
// Distribuidor automático de tráfico
router.get('/', authenticateToken, (req, res) => {
    const rol = req.user.nombre_rol;
    if (rol === 'Administrador' || rol === 'Admin') return res.redirect('/dashboard/admin');
    if (rol === 'Monitorista') return res.redirect('/dashboard/monitoring');
    if (rol === 'GestorCitas') return res.redirect('/dashboard/appointments');
    if (rol === 'GestorHistorial') return res.redirect('/dashboard/history');
    if (rol === 'GestorComunicacion') return res.redirect('/dashboard/communication');
    if (rol === 'Terapeuta') return res.redirect('/dashboard/therapist');
    return res.redirect('/dashboard/patient');
});

// ==========================================
// 2. RUTAS DE FABIO (Administrador / Usuarios)
// ==========================================
router.get('/admin', authenticateToken, checkRole(['Administrador']), dashboardController.getAdminDashboard);
router.get('/admin/create', authenticateToken, checkRole(['Administrador']), dashboardController.showCreateUserForm);
router.post('/admin/create', authenticateToken, checkRole(['Administrador']), dashboardController.createUser);
router.get('/admin/edit/:id', authenticateToken, checkRole(['Administrador']), dashboardController.showEditUserForm);
router.post('/admin/edit/:id', authenticateToken, checkRole(['Administrador']), dashboardController.updateUser);
router.get('/admin/toggle-user/:id', authenticateToken, checkRole(['Administrador']), dashboardController.toggleUserStatus);
router.post('/admin/assign', authenticateToken, checkRole(['Administrador']), dashboardController.assignTherapist);

// ==========================================
// 3. RUTAS DEL EQUIPO (Dashboards Exclusivos)
// ==========================================

// JHOSEP (Monitoreo Emocional)
router.get('/monitoring', authenticateToken, checkRole(['Monitorista']), (req, res) => {
    res.render('dashboard/monitoring', { title: 'Monitoreo Emocional', user: req.session.user });
});

// ALAN (Gestión de Citas)
router.get('/appointments', authenticateToken, checkRole(['GestorCitas']), (req, res) => {
    res.render('dashboard/appointments', { title: 'Gestión de Citas', user: req.session.user });
});

// RENAN (Historial y Reportes)
router.get('/history', authenticateToken, checkRole(['GestorHistorial']), (req, res) => {
    res.render('dashboard/history', { title: 'Historial Clínico', user: req.session.user });
});

// JIMMY (Comunicación y Alertas)
router.get('/communication', authenticateToken, checkRole(['GestorComunicacion']), (req, res) => {
    res.render('dashboard/communication', { title: 'Centro de Comunicaciones', user: req.session.user });
});

// ==========================================
// 4. RUTAS USUARIOS NORMALES
// ==========================================
router.get('/patient', authenticateToken, checkRole(['Paciente']), (req, res) => {
    res.render('dashboard/patient', { title: 'Mi Bienestar', user: req.session.user });
});
router.get('/therapist', authenticateToken, checkRole(['Terapeuta']), (req, res) => {
    res.render('dashboard/therapist', { title: 'Panel Terapeuta', user: req.session.user });
});

module.exports = router;
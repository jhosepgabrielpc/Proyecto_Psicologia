const express = require('express');
const router = express.Router();

// CONTROLADORES
const dashboardController = require('../controllers/dashboardController');
const monitoringController = require('../controllers/monitoringController');
const testController = require('../controllers/testController'); // <--- NUEVO

const { isAuthenticated, requireAdmin } = require('../middleware/auth'); 

// ==================================================================
// 1. LOBBY / DISPATCHER (Ruta: /dashboard)
// ==================================================================
router.get('/', isAuthenticated, (req, res) => {
    if (!req.session || !req.session.user) {
        return res.redirect('/auth/login');
    }

    const role = req.session.user.nombre_rol;
    console.log(`[Dashboard Dispatcher] Usuario: ${req.session.user.email} - Rol: ${role}`);

    if (role === 'Administrador' || role === 'Admin') {
        return res.redirect('/dashboard/admin');
    } 
    else if (role === 'Paciente') {
        return res.redirect('/dashboard/patient'); 
    } 
    else if (role === 'Terapeuta') {
        return res.redirect('/dashboard/monitoring'); 
    } 
    else if (role === 'Monitorista') {
        return res.redirect('/dashboard/monitoring');
    }
    else if (role === 'GestorComunicacion') {
        return res.redirect('/dashboard/communication');
    }
    else {
        return res.redirect('/dashboard/monitoring');
    }
});

// ==================================================================
// 2. RUTAS DE ADMINISTRADOR (Ruta: /dashboard/admin/*)
// ==================================================================
router.get('/admin', isAuthenticated, requireAdmin, dashboardController.getAdminDashboard);
router.post('/admin/assign', isAuthenticated, requireAdmin, dashboardController.assignTherapist);
router.get('/admin/create', isAuthenticated, requireAdmin, dashboardController.showCreateUserForm);
router.post('/admin/create', isAuthenticated, requireAdmin, dashboardController.createUser);
router.get('/admin/edit/:id', isAuthenticated, requireAdmin, dashboardController.showEditUserForm);
router.post('/admin/edit/:id', isAuthenticated, requireAdmin, dashboardController.updateUser);
router.get('/admin/toggle-user/:id', isAuthenticated, requireAdmin, dashboardController.toggleUserStatus);


// ==================================================================
// 3. RUTA DASHBOARD PACIENTE
// ==================================================================
router.get('/patient', isAuthenticated, (req, res) => {
    if (req.session.user.nombre_rol !== 'Paciente') {
        return res.redirect('/dashboard');
    }
    res.render('dashboard/patient', { 
        title: 'Mi Espacio', 
        user: req.session.user 
    });
});

// ==================================================================
// 4. RUTAS DE TESTS PSICOLÓGICOS (CORREGIDO AQUÍ)
// ==================================================================

// Usamos 'testController' porque ahí movimos la función
router.get('/test/:type', isAuthenticated, testController.getTestView);

// Ruta para guardar el test (POST)
router.post('/test/save', isAuthenticated, testController.saveTestResult);


// ==================================================================
// 5. RUTAS PLACEHOLDER
// ==================================================================
router.get('/appointments', isAuthenticated, (req, res) => {
    res.render('dashboard/appointments', { 
        title: 'Gestión de Citas', 
        user: req.session.user 
    });
});

module.exports = router;
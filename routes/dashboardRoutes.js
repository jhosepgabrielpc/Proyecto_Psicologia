const express = require('express');
const router = express.Router();

// ==================================================================
// IMPORTACIÓN DE CONTROLADORES (AQUÍ ESTABA EL ERROR)
// ==================================================================
const dashboardController = require('../controllers/dashboardController');
const monitoringController = require('../controllers/monitoringController');
const testController = require('../controllers/testController');
const therapistController = require('../controllers/therapistController');
const managerController = require('../controllers/managerController'); // <--- ¡ESTA ES LA LÍNEA QUE FALTABA!

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
        return res.redirect('/dashboard/therapist'); 
    } 
    else if (role === 'Monitorista') {
        return res.redirect('/dashboard/monitoring');
    }
    else if (role === 'GestorComunicacion') {
        // CORREGIDO: Ahora Jimmy va a su panel de control
        return res.redirect('/dashboard/manager');
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
// 4. RUTA DE TERAPEUTA (Panel Principal y Registro)
// ==================================================================
router.get('/therapist', isAuthenticated, therapistController.getTherapistDashboard);
router.get('/register-patient', isAuthenticated, therapistController.showRegisterPatientForm);
router.post('/register-patient', isAuthenticated, therapistController.registerPatient);


// ==================================================================
// 5. RUTA DE GESTOR (JIMMY - Command Center)
// ==================================================================
router.get('/manager', isAuthenticated, managerController.getManagerDashboard);


// ==================================================================
// 6. RUTAS DE TESTS PSICOLÓGICOS
// ==================================================================
router.get('/test/:type', isAuthenticated, testController.getTestView);
router.post('/test/save', isAuthenticated, testController.saveTestResult);


// ==================================================================
// 7. RUTAS PLACEHOLDER
// ==================================================================
router.get('/appointments', isAuthenticated, (req, res) => {
    res.render('dashboard/appointments', { 
        title: 'Gestión de Citas', 
        user: req.session.user 
    });
});

module.exports = router;
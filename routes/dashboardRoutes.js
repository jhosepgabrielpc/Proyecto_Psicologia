const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');

// IMPORTACIÓN DE CEREBROS (CONTROLADORES)
const dashboardController = require('../controllers/dashboardController'); 
const reportController = require('../controllers/reportController');
const appointmentController = require('../controllers/appointmentController'); 
const testController = require('../controllers/testController');

// ==================================================================
// DESPACHADOR CENTRAL (LOBBY PRINCIPAL)
// Ruta Base: /dashboard
// ==================================================================

router.get('/', isAuthenticated, (req, res) => {
    const role = req.session.user.nombre_rol;

    // Redirección Inteligente según Rol
    switch (role) {
        case 'Paciente':
            res.redirect('/dashboard/patient');
            break;
        
        case 'Terapeuta':
            res.redirect('/dashboard/clinical');
            break;
        
        case 'GestorComunicacion':
            res.redirect('/dashboard/manager');
            break;
        
        case 'GestorCitas':
            res.redirect('/dashboard/appointments');
            break;
        
        case 'Monitorista':
            res.redirect('/dashboard/monitoring');
            break;
        
        case 'Admin':
        case 'Administrador':
             res.redirect('/dashboard/admin');
             break;

        default:
            res.render('dashboard/index', { 
                title: 'Bienvenido a MindCare', 
                user: req.session.user 
            });
            break;
    }
});

// ==================================================================
// RUTAS ESPECÍFICAS (Vinculadas a Controladores)
// ==================================================================

// 1. DASHBOARD DEL PACIENTE (AUTÓNOMO)
router.get('/patient', isAuthenticated, dashboardController.getPatientDashboard);

// 2. DASHBOARD ADMIN
router.get('/admin', isAuthenticated, dashboardController.getAdminDashboard);

// 3. DASHBOARD CLÍNICO (TERAPEUTA - CENTRO DE COMANDO)
router.get('/clinical', isAuthenticated, reportController.getClinicalDashboard);

// 4. GESTIÓN DE CRISIS (Jimmy)
router.get('/manager', isAuthenticated, (req, res) => {
    res.render('dashboard/manager', { 
        title: 'Gestión de Crisis', 
        user: req.session.user,
        incidencias: [] 
    });
});

// 5. GESTIÓN DE CITAS (CALENDARIO INTERACTIVO) 📅
// A. La Vista Principal
router.get('/appointments', isAuthenticated, appointmentController.getAppointmentsDashboard);

// B. La API del Calendario (Para que aparezcan los recuadros de colores)
router.get('/appointments/events', isAuthenticated, appointmentController.getCalendarEvents);

// C. Acciones (Crear y Cancelar)
router.post('/appointments/create', isAuthenticated, appointmentController.createAppointment);
router.post('/appointments/cancel', isAuthenticated, appointmentController.cancelAppointment);


// 6. RUTAS CRUD DE USUARIOS (Solo Admin)
router.get('/create-user', isAuthenticated, dashboardController.showCreateUserForm);
router.post('/create-user', isAuthenticated, dashboardController.createUser);
router.get('/edit-user/:id', isAuthenticated, dashboardController.showEditUserForm);
router.post('/edit-user/:id', isAuthenticated, dashboardController.updateUser);
router.post('/toggle-status/:id', isAuthenticated, dashboardController.toggleUserStatus);
router.post('/assign-therapist', isAuthenticated, dashboardController.assignTherapist);

// 7. SISTEMA DE TESTS PSICOLÓGICOS (NUEVO) ✅
router.get('/test/:type', isAuthenticated, testController.showTest);
router.post('/test/:type/save', isAuthenticated, testController.submitTest);

module.exports = router;
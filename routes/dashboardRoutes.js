const express = require('express');
const router = express.Router();
const { isAuthenticated, requireAdmin } = require('../middleware/auth');

// CONTROLADORES
const dashboardController = require('../controllers/dashboardController');
const reportController = require('../controllers/reportController');
const appointmentController = require('../controllers/appointmentController');
const testController = require('../controllers/testController');
const monitoringController = require('../controllers/monitoringController'); // 👈 nuevo

// ==================================================================
// DESPACHADOR CENTRAL /dashboard
// ==================================================================
router.get('/', isAuthenticated, (req, res) => {
    const role = req.session.user.nombre_rol;

    switch (role) {
        case 'Paciente':
            return res.redirect('/dashboard/patient');
        case 'Terapeuta':
            return res.redirect('/dashboard/clinical');
        case 'GestorComunicacion':
            return res.redirect('/dashboard/manager');
        case 'GestorCitas':
            return res.redirect('/dashboard/appointments');
        case 'Monitorista':
            return res.redirect('/dashboard/monitoring'); // 👈 aquí ya existía
        case 'Admin':
        case 'Administrador':
            return res.redirect('/dashboard/admin');
        default:
            return res.render('dashboard/index', {
                title: 'Bienvenido a MindCare',
                user: req.session.user
            });
    }
});

// ==================================================================
// 1. DASHBOARD PACIENTE
// ==================================================================
router.get('/patient', isAuthenticated, dashboardController.getPatientDashboard);

// ==================================================================
// 2. DASHBOARD ADMIN (Centro de Comando)
// ==================================================================
router.get(
    '/admin',
    isAuthenticated,
    requireAdmin,
    dashboardController.getAdminDashboard
);

// ==================================================================
// 3. DASHBOARD CLÍNICO (TERAPEUTA)
// ==================================================================
router.get(
    '/clinical',
    isAuthenticated,
    reportController.getClinicalDashboard
);

// ==================================================================
// 4. GESTIÓN DE CRISIS (Gestor de Comunicación)
// ==================================================================
router.get('/manager', isAuthenticated, (req, res) => {
    res.render('dashboard/manager', {
        title: 'Gestión de Crisis',
        user: req.session.user,
        incidencias: []
    });
});

// ==================================================================
// 5. CITAS (CALENDARIO)
// ==================================================================
router.get(
    '/appointments',
    isAuthenticated,
    appointmentController.getAppointmentsDashboard
);

router.get(
    '/appointments/events',
    isAuthenticated,
    appointmentController.getCalendarEvents
);

router.post(
    '/appointments/create',
    isAuthenticated,
    appointmentController.createAppointment
);

router.post(
    '/appointments/cancel',
    isAuthenticated,
    appointmentController.cancelAppointment
);

// ==================================================================
// 6. CRUD USUARIOS (ADMIN)  ✅
// Rutas tipo /dashboard/admin/...
// ==================================================================

// NUEVO USUARIO
router.get(
    '/admin/create',
    isAuthenticated,
    requireAdmin,
    dashboardController.showCreateUserForm
);

router.post(
    '/admin/create',
    isAuthenticated,
    requireAdmin,
    dashboardController.createUser
);

// EDITAR USUARIO
router.get(
    '/admin/edit/:id',
    isAuthenticated,
    requireAdmin,
    dashboardController.showEditUserForm
);

router.post(
    '/admin/edit/:id',
    isAuthenticated,
    requireAdmin,
    dashboardController.updateUser
);

// BLOQUEAR / DESBLOQUEAR
router.post(
    '/admin/toggle-user/:id',
    isAuthenticated,
    requireAdmin,
    dashboardController.toggleUserStatus
);

// ASIGNAR TERAPEUTA A PACIENTE (MATCHMAKING)
router.post(
    '/admin/assign',
    isAuthenticated,
    requireAdmin,
    dashboardController.assignTherapist
);

// ALIAS DE COMPATIBILIDAD (por si algo viejo usa estas rutas)
router.get(
    '/create-user',
    isAuthenticated,
    requireAdmin,
    dashboardController.showCreateUserForm
);
router.post(
    '/create-user',
    isAuthenticated,
    requireAdmin,
    dashboardController.createUser
);
router.get(
    '/edit-user/:id',
    isAuthenticated,
    requireAdmin,
    dashboardController.showEditUserForm
);
router.post(
    '/edit-user/:id',
    isAuthenticated,
    requireAdmin,
    dashboardController.updateUser
);
router.post(
    '/toggle-status/:id',
    isAuthenticated,
    requireAdmin,
    dashboardController.toggleUserStatus
);
router.post(
    '/assign-therapist',
    isAuthenticated,
    requireAdmin,
    dashboardController.assignTherapist
);

// ==================================================================
// 7. DASHBOARD MONITOREO (Monitorista + endpoints de pánico / check-in)
// ==================================================================

// Vista principal para el rol "Monitorista"
router.get(
    '/monitoring',
    isAuthenticated,
    monitoringController.getMonitoringDashboard
);

// Guardar check-in del paciente (formulario del paciente)
router.post(
    '/monitoring/checkin',
    isAuthenticated,
    monitoringController.saveCheckin
);

// Botón de pánico del paciente (llamado vía fetch desde el front)
router.post(
    '/monitoring/panic',
    isAuthenticated,
    monitoringController.triggerPanic
);

// (opcional) crear incidencia tipo "alert-jimmy" desde el panel de monitoreo
router.post(
    '/monitoring/alert-jimmy',
    isAuthenticated,
    monitoringController.createIncident
);

// ==================================================================
// 8. TESTS PSICOLÓGICOS
// ==================================================================
router.get('/test/:type', isAuthenticated, testController.showTest);
router.post('/test/:type/save', isAuthenticated, testController.submitTest);

module.exports = router;

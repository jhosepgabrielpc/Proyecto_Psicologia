// routes/dashboardRoutes.js
const express = require('express');
const router = express.Router();
const { isAuthenticated, requireAdmin } = require('../middleware/auth');

// CONTROLADORES
const dashboardController = require('../controllers/dashboardController');
const reportController = require('../controllers/reportController');
const appointmentController = require('../controllers/appointmentController');
const testController = require('../controllers/testController');
const monitoringController = require('../controllers/monitoringController');

// ==================================================================
// DESPACHADOR CENTRAL /dashboard
// Solo tres mundos: Paciente, Terapeuta, Admin
// ==================================================================
router.get('/', isAuthenticated, (req, res) => {
    const role = req.session.user?.nombre_rol;

    switch (role) {
        case 'Paciente':
            return res.redirect('/dashboard/patient');

        case 'Terapeuta':
            // Centro clínico del terapeuta (panel con pacientes, agenda, alertas)
            return res.redirect('/dashboard/clinical');

        case 'Admin':
        case 'Administrador':
            return res.redirect('/dashboard/admin');

        default:
            // Rol desconocido o sin rol asignado: vista neutra
            return res.render('dashboard/index', {
                title: 'Bienvenido a MindCare',
                user: req.session.user
            });
    }
});

// ==================================================================
// 1. DASHBOARD PACIENTE
// ==================================================================
router.get(
    '/patient',
    isAuthenticated,
    dashboardController.getPatientDashboard
);

// ==================================================================
// 2. DASHBOARD ADMIN (Centro de Comando)
// ==================================================================
router.get(
    '/admin',
    isAuthenticated,
    requireAdmin,
    dashboardController.getAdminDashboard
);

// CRUD USUARIOS (ADMIN)
// ----------------------

// Nuevo usuario
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

// Editar usuario
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

// Bloquear / Desbloquear
router.post(
    '/admin/toggle-user/:id',
    isAuthenticated,
    requireAdmin,
    dashboardController.toggleUserStatus
);

// Asignar terapeuta a paciente
router.post(
    '/admin/assign',
    isAuthenticated,
    requireAdmin,
    dashboardController.assignTherapist
);

// Alias de compatibilidad (por si tienes vistas viejas apuntando aquí)
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
// 3. DASHBOARD CLÍNICO (TERAPEUTA)
// Panel que ya montaste en reportController.getClinicalDashboard
// ==================================================================
router.get(
    '/clinical',
    isAuthenticated,
    reportController.getClinicalDashboard
);

// ==================================================================
// 4. CITAS (CALENDARIO)
// Paciente y/o terapeuta pueden usar estas vistas según tu lógica de UI
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
// 5. DASHBOARD MONITOREO (Paciente + Terapeuta)
// Sin “monitorista” ni gestores, solo seguimiento emocional
// ==================================================================

// Vista principal de monitoreo (se adapta según rol y query ?patient=)
router.get(
    '/monitoring',
    isAuthenticated,
    monitoringController.getMonitoringView
);

// Guardar check-in emocional (paciente)
router.post(
    '/monitoring/checkin',
    isAuthenticated,
    monitoringController.createCheckin
);

// Botón de pánico (si lo usas)
// Crea incidencia / alerta genérica usando la lógica de monitoringController
router.post(
    '/monitoring/panic',
    isAuthenticated,
    monitoringController.triggerPanic
);

// ⚠️ IMPORTANTE: Se elimina la ruta vieja que apuntaba a "alert-jimmy"
// Ya no hay gestores ni rutas específicas para Jimmy
// ❌ router.post('/monitoring/alert-jimmy', ...);

// ==================================================================
// 6. TESTS PSICOLÓGICOS (PHQ-9 / GAD-7, etc.)
// ==================================================================

// Mostrar test (runner clásico vía POST del formulario)
router.get(
    '/test/:type',
    isAuthenticated,
    testController.showTest
);

// Guardar test del runner clásico
router.post(
    '/test/:type/save',
    isAuthenticated,
    testController.submitTest
);

// Si más adelante quieres conectar la vista "test-phq9" que usa fetch
// a /dashboard/test/save, aquí puedes agregar una ruta AJAX tipo:
// router.post('/test/save', isAuthenticated, testController.submitTestAjax);

module.exports = router;

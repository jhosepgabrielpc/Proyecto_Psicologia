const express = require('express');
const router = express.Router();

// ==================================================================
// IMPORTACIÓN DE CONTROLADORES (TODOS LOS MÓDULOS)
// ==================================================================
const dashboardController = require('../controllers/dashboardController');
const monitoringController = require('../controllers/monitoringController');
const testController = require('../controllers/testController');
const therapistController = require('../controllers/therapistController');
const managerController = require('../controllers/managerController');
const appointmentController = require('../controllers/appointmentController'); 
const reportController = require('../controllers/reportController'); // <--- ¡NUEVO: MÓDULO DE RENAN!

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
        // CORREGIDO: El terapeuta ahora va a su Panel Clínico (Renan)
        return res.redirect('/dashboard/clinical'); 
    } 
    else if (role === 'Monitorista') {
        return res.redirect('/dashboard/monitoring');
    }
    else if (role === 'GestorComunicacion') {
        return res.redirect('/dashboard/manager'); // Jimmy
    }
    else if (role === 'GestorCitas') {
        return res.redirect('/dashboard/appointments'); // Alan
    }
    else {
        // Default fallback
        return res.redirect('/dashboard/monitoring');
    }
});

// ==================================================================
// 2. RUTAS DE ADMINISTRADOR (FABIO)
// ==================================================================
router.get('/admin', isAuthenticated, requireAdmin, dashboardController.getAdminDashboard);
router.post('/admin/assign', isAuthenticated, requireAdmin, dashboardController.assignTherapist);
router.get('/admin/create', isAuthenticated, requireAdmin, dashboardController.showCreateUserForm);
router.post('/admin/create', isAuthenticated, requireAdmin, dashboardController.createUser);
router.get('/admin/edit/:id', isAuthenticated, requireAdmin, dashboardController.showEditUserForm);
router.post('/admin/edit/:id', isAuthenticated, requireAdmin, dashboardController.updateUser);
router.get('/admin/toggle-user/:id', isAuthenticated, requireAdmin, dashboardController.toggleUserStatus);

// ==================================================================
// 3. RUTA DASHBOARD PACIENTE (LÓGICA MEJORADA)
// ==================================================================
router.get('/patient', isAuthenticated, async (req, res) => {
    if (req.session.user.nombre_rol !== 'Paciente') return res.redirect('/dashboard');
    
    const userId = req.session.user.id_usuario;

    try {
        // 1. Obtener ID Paciente
        const pRes = await require('../config/database').query('SELECT id_paciente FROM Pacientes WHERE id_usuario = $1', [userId]);
        if(pRes.rows.length === 0) return res.render('dashboard/patient', { title: 'Mi Espacio', user: req.session.user, nextAppointment: null, pastAppointments: [] });
        
        const patientId = pRes.rows[0].id_paciente;

        // 2. Buscar la PRÓXIMA CITA (Futura)
        const nextAppt = await require('../config/database').query(`
            SELECT c.*, u.nombre as doc_nombre, u.apellido as doc_apellido
            FROM Citas c
            JOIN Terapeutas t ON c.id_terapeuta = t.id_terapeuta
            JOIN Usuarios u ON t.id_usuario = u.id_usuario
            WHERE c.id_paciente = $1 
            AND c.fecha_hora_inicio >= NOW()
            AND c.estado = 'Programada'
            ORDER BY c.fecha_hora_inicio ASC
            LIMIT 1
        `, [patientId]);

        // 3. Buscar CITAS PASADAS (Historial)
        const historyAppts = await require('../config/database').query(`
            SELECT c.*, u.apellido as doc_apellido
            FROM Citas c
            JOIN Terapeutas t ON c.id_terapeuta = t.id_terapeuta
            JOIN Usuarios u ON t.id_usuario = u.id_usuario
            WHERE c.id_paciente = $1 
            AND c.fecha_hora_inicio < NOW()
            ORDER BY c.fecha_hora_inicio DESC
            LIMIT 3
        `, [patientId]);

        res.render('dashboard/patient', { 
            title: 'Mi Espacio', 
            user: req.session.user,
            nextAppointment: nextAppt.rows[0] || null, // Objeto cita o null
            pastAppointments: historyAppts.rows        // Array de citas
        });

    } catch (error) {
        console.error(error);
        res.render('dashboard/patient', { title: 'Mi Espacio', user: req.session.user, nextAppointment: null, pastAppointments: [] });
    }
});

// ==================================================================
// 4. RUTAS DE TERAPEUTA (PANEL Y REGISTRO)
// ==================================================================
// Nota: /therapist queda como acceso legacy, pero el principal es /clinical
router.get('/therapist', isAuthenticated, therapistController.getTherapistDashboard);
router.get('/register-patient', isAuthenticated, therapistController.showRegisterPatientForm);
router.post('/register-patient', isAuthenticated, therapistController.registerPatient);

// ==================================================================
// 5. RUTAS DE MONITOREO (JHOSEP)
// ==================================================================
router.get('/monitoring', isAuthenticated, monitoringController.getMonitoringDashboard);
router.post('/monitoring/alert-jimmy', isAuthenticated, monitoringController.createIncident);
router.post('/monitoring/checkin', isAuthenticated, monitoringController.saveCheckin);

// ==================================================================
// 6. RUTAS DE GESTIÓN DE COMUNICACIÓN (JIMMY)
// ==================================================================
router.get('/manager', isAuthenticated, managerController.getManagerDashboard);
router.post('/manager/escalate', isAuthenticated, managerController.escalateIncident);

// ==================================================================
// 7. RUTAS DE TESTS PSICOLÓGICOS
// ==================================================================
router.get('/test/:type', isAuthenticated, testController.getTestView);
router.post('/test/save', isAuthenticated, testController.saveTestResult);

// ==================================================================
// 8. RUTAS GESTIÓN DE CITAS (ALAN)
// ==================================================================
router.get('/appointments', isAuthenticated, appointmentController.getAppointmentsDashboard);
router.get('/appointments/api/events', isAuthenticated, appointmentController.getCalendarEvents);
router.post('/appointments/create', isAuthenticated, appointmentController.createAppointment);
router.post('/appointments/cancel', isAuthenticated, appointmentController.cancelAppointment);

// ==================================================================
// 9. RUTAS DE DIRECCIÓN CLÍNICA (RENAN) - ¡NUEVO!
// ==================================================================
// Esta es la ruta Home del Terapeuta ahora
router.get('/clinical', isAuthenticated, reportController.getClinicalDashboard);

module.exports = router;
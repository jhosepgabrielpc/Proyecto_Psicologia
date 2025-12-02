// routes/appointmentRoutes.js
const express = require('express');
const router = express.Router();

const appointmentController = require('../controllers/appointmentController');
const { isAuthenticated, requireTherapist } = require('../middleware/auth');
const { validateAppointment } = require('../middleware/validation');

/* ============================================================
 * TODAS LAS RUTAS DE ESTE MÓDULO REQUIEREN USUARIO AUTENTICADO
 * ============================================================ */
router.use(isAuthenticated);

/* ============================================================
 * 1. AGENDA CLÍNICA (DASHBOARD) - FULLCALENDAR + MODALES
 *    Vista: views/dashboard/appointments.ejs
 * ============================================================ */

// Vista principal de agenda clínica
// GET /dashboard/appointments
router.get('/', appointmentController.getAppointmentsDashboard);

// Eventos para FullCalendar
// GET /dashboard/appointments/events
router.get('/events', appointmentController.getCalendarEvents);

// Crear cita desde el modal "Nueva Cita" (vista nueva)
// POST /dashboard/appointments/create
router.post('/create', validateAppointment, appointmentController.createAppointment);

// Cancelar / eliminar cita desde el modal de detalles
// POST /dashboard/appointments/cancel
router.post('/cancel', appointmentController.cancelAppointment);

// Guardar nota clínica de la sesión desde el modal del dashboard
// POST /dashboard/appointments/session-notes
router.post(
    '/session-notes',
    requireTherapist,               // solo terapeuta / admin clínico
    appointmentController.saveSessionNotes
);

/* ============================================================
 * 2. RUTAS API CLÁSICAS (LEGACY / COMPATIBILIDAD)
 *    Solo se registran si el controlador tiene esas funciones,
 *    para evitar errores "callback undefined".
 * ============================================================ */

// Slots disponibles para un día (API antigua)
// GET /dashboard/appointments/available-slots
if (typeof appointmentController.getAvailableSlots === 'function') {
    router.get('/available-slots', appointmentController.getAvailableSlots);
}

// Crear cita vía API antigua (por si algo la usa todavía)
// POST /dashboard/appointments/
if (typeof appointmentController.createAppointment === 'function') {
    router.post('/', validateAppointment, appointmentController.createAppointment);
}

// Listar citas en modo API
// GET /dashboard/appointments/api
if (typeof appointmentController.getAppointments === 'function') {
    router.get('/api', appointmentController.getAppointments);
}

// Actualizar estado de cita (API antigua)
// PUT /dashboard/appointments/:appointmentId/status
if (typeof appointmentController.updateAppointmentStatus === 'function') {
    router.put('/:appointmentId/status', appointmentController.updateAppointmentStatus);
}

// Guardar notas vía API REST antigua
// POST /dashboard/appointments/:appointmentId/notes
if (typeof appointmentController.saveSessionNotes === 'function') {
    router.post(
        '/:appointmentId/notes',
        requireTherapist,
        (req, res, next) => {
            // Adaptamos al formato que espera saveSessionNotes (id_cita en el body)
            if (!req.body) req.body = {};
            req.body.id_cita = req.params.appointmentId;
            return appointmentController.saveSessionNotes(req, res, next);
        }
    );
}

module.exports = router;

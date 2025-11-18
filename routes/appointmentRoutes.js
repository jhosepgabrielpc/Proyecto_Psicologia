const express = require('express');
const router = express.Router();
const appointmentController = require('../controllers/appointmentController');
const { authenticateToken, requireTherapist } = require('../middleware/auth');
const { validateAppointment } = require('../middleware/validation');

router.use(authenticateToken);

router.get('/', (req, res) => {
    res.render('appointments/calendar', {
        title: 'Calendario de Citas - MindCare',
        user: req.session.user
    });
});

router.get('/calendar', (req, res) => {
    res.render('appointments/calendar', {
        title: 'Calendario de Citas - MindCare',
        user: req.session.user
    });
});

router.get('/schedule', (req, res) => {
    res.render('appointments/schedule', {
        title: 'Programar Cita - MindCare',
        user: req.session.user
    });
});

router.get('/available-slots', appointmentController.getAvailableSlots);
router.post('/', validateAppointment, appointmentController.createAppointment);
router.get('/api', appointmentController.getAppointments); // Cambiar ruta para API
router.put('/:appointmentId/status', appointmentController.updateAppointmentStatus);
router.post('/:appointmentId/notes', requireTherapist, appointmentController.saveSessionNotes);

module.exports = router;
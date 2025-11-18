const express = require('express');
const router = express.Router();
const appointmentController = require('../controllers/appointmentController');
const { authenticateToken, requireTherapist } = require('../middleware/auth');
const { validateAppointment } = require('../middleware/validation');

router.use(authenticateToken);

router.get('/available-slots', appointmentController.getAvailableSlots);
router.post('/', validateAppointment, appointmentController.createAppointment);
router.get('/', appointmentController.getAppointments);
router.put('/:appointmentId/status', appointmentController.updateAppointmentStatus);
router.post('/:appointmentId/notes', requireTherapist, appointmentController.saveSessionNotes);

module.exports = router;
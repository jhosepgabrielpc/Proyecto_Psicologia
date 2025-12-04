// routes/monitoringRoutes.js
const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const monitoringController = require('../controllers/monitoringController');

// Panel principal de monitoreo
// GET /dashboard/monitoring
router.get(
    '/',
    isAuthenticated,
    monitoringController.getMonitoringView
);

// Check-in del paciente (slider de ánimo, horas sueño, etc.)
// POST /dashboard/monitoring/checkin
router.post(
    '/checkin',
    isAuthenticated,
    monitoringController.createCheckin
);

// Botón de pánico (SOS) – llamado vía fetch desde el front
// Espera body: { modalidad: 'Virtual' | 'Presencial' }
router.post(
    '/panic',
    isAuthenticated,
    monitoringController.triggerPanic
);

module.exports = router;

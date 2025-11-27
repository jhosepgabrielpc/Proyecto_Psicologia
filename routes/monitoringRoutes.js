const express = require('express');
const router = express.Router();
const monitoringController = require('../controllers/monitoringController');
const { isAuthenticated } = require('../middleware/auth');

// ==================================================================
// RUTAS DE MONITOREO (JHOSEP)
// ==================================================================

// 1. Dashboard de Monitoreo
router.get('/', isAuthenticated, monitoringController.getMonitoringDashboard);

// 2. Guardar Check-in Diario (Paciente)
router.post('/checkin', isAuthenticated, monitoringController.saveCheckin);

// 3. Enviar Alerta a Jimmy (Monitorista -> Gestor)
router.post('/alert-jimmy', isAuthenticated, monitoringController.createIncident);

// 4. Botón de Pánico
router.post('/panic', isAuthenticated, monitoringController.triggerPanic);

module.exports = router;
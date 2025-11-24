const express = require('express');
const router = express.Router();
const monitoringController = require('../controllers/monitoringController');
const { isAuthenticated } = require('../middleware/auth');

// ==================================================================
// 1. DASHBOARD DE MONITOREO (Vista Principal)
// ==================================================================
// Ruta: GET /dashboard/monitoring
router.get('/', isAuthenticated, monitoringController.getMonitoringDashboard);


// ==================================================================
// 2. PROCESAMIENTO DE DATOS (Check-in Diario)
// ==================================================================
// Ruta: POST /dashboard/monitoring/checkin
router.post('/checkin', isAuthenticated, monitoringController.saveCheckin);


// NOTA: Las rutas de los tests (PHQ-9/GAD-7) fueron movidas a 
// 'dashboardRoutes.js' y usan 'testController.js'. 
// Por eso las eliminamos de aquí para evitar el error "Undefined".

module.exports = router;
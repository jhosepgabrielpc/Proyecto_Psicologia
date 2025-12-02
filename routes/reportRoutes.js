const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { isAuthenticated } = require('../middleware/auth');

// ==================================================================
// RUTAS DEL MÓDULO CLÍNICO (RENAN)
// ==================================================================

// 1. Analytics Global
router.get('/analytics', isAuthenticated, reportController.getAnalytics);

// 2. Expediente del Paciente (Historia Clínica)
router.get('/patient/:id/view', isAuthenticated, reportController.getPatientHistory);

// 3. Crear Reporte de Progreso (Formulario)
router.get('/patient/:id/create-report', isAuthenticated, reportController.getCreateReportForm);

// 4. Guardar Reporte (Acción)
router.post('/progress', isAuthenticated, reportController.saveProgressReport);

// 5. Actualizar Nota de Sesión (Desde el Expediente)
router.post('/session/update', isAuthenticated, reportController.updateSessionNote);



// ¡ESTA LÍNEA ES LA QUE FALTABA! SI NO ESTÁ, EL SERVER EXPLOTA
module.exports = router;
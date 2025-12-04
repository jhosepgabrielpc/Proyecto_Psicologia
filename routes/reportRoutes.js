// routes/reportRoutes.js

const express = require('express');
const router = express.Router();

// Middleware de auth / roles
const {
    isAuthenticated,
    requireTherapist
} = require('../middleware/auth');

// Controlador de reportes clínicos
const reportController = require('../controllers/reportController');

// ==================================================================
// MIDDLEWARE GLOBAL PARA TODAS LAS RUTAS DE REPORTES
// - Requieren sesión iniciada
// - Requieren rol clínico (Terapeuta, Admin, GestorHistorial, etc.)
// ==================================================================
router.use(isAuthenticated, requireTherapist);

// ==================================================================
// 1. ANALYTICS GENERAL (panel clínico / admin)
//    GET /reports/analytics
// ==================================================================
router.get(
    '/analytics',
    reportController.getAnalytics
);

// ==================================================================
// 2. EXPEDIENTE CLÍNICO HTML
//    GET /reports/patient/:id/view
// ==================================================================
router.get(
    '/patient/:id/view',
    reportController.getPatientHistory
);

// ==================================================================
// 3. FORMULARIO PARA CREAR REPORTE DE PROGRESO
//    GET /reports/patient/:id/create-report
// ==================================================================
router.get(
    '/patient/:id/create-report',
    reportController.getCreateReportForm
);

// ==================================================================
// 4. GUARDAR REPORTE DE PROGRESO
//    POST /reports/patient/:id/save-report
// ==================================================================
router.post(
    '/patient/:id/save-report',
    reportController.saveProgressReport
);

// ==================================================================
// 5. ACTUALIZAR NOTA DE SESIÓN DESDE EXPEDIENTE
//    POST /reports/patient/:id/update-session-note
// ==================================================================
router.post(
    '/patient/:id/update-session-note',
    reportController.updateSessionNote
);

// ==================================================================
// 6. REPORTE CLÍNICO EN PDF PROFESIONAL
//    GET /reports/patient/:id/pdf
// ==================================================================
router.get(
    '/patient/:id/pdf',
    reportController.generatePatientPdf
);

// ==================================================================
// 7. REPORTE CLÍNICO EN EXCEL
//    GET /reports/patient/:id/excel
// ==================================================================
router.get(
    '/patient/:id/excel',
    reportController.generatePatientExcel
);

module.exports = router;

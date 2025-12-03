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
// 1. ANALYTICS GENERAL (panel clínico / admin)
//    GET /reports/analytics
// ==================================================================
router.get(
    '/analytics',
    isAuthenticated,
    requireTherapist, // incluye Terapeuta + Admin + otros roles clínicos
    reportController.getAnalytics
);

// ==================================================================
// 2. EXPEDIENTE CLÍNICO HTML
//    GET /reports/patient/:id/view
// ==================================================================
router.get(
    '/patient/:id/view',
    isAuthenticated,
    requireTherapist,
    reportController.getPatientHistory
);

// ==================================================================
// 3. FORMULARIO PARA CREAR REPORTE DE PROGRESO
//    GET /reports/patient/:id/create-report
// ==================================================================
router.get(
    '/patient/:id/create-report',
    isAuthenticated,
    requireTherapist,
    reportController.getCreateReportForm
);

// ==================================================================
// 4. GUARDAR REPORTE DE PROGRESO
//    POST /reports/patient/:id/save-report
// ==================================================================
router.post(
    '/patient/:id/save-report',
    isAuthenticated,
    requireTherapist,
    reportController.saveProgressReport
);

// ==================================================================
// 5. ACTUALIZAR NOTA DE SESIÓN DESDE EXPEDIENTE
//    POST /reports/patient/:id/update-session-note
// ==================================================================
router.post(
    '/patient/:id/update-session-note',
    isAuthenticated,
    requireTherapist,
    reportController.updateSessionNote
);

// ==================================================================
// 6. REPORTE CLÍNICO EN PDF PROFESIONAL
//    GET /reports/patient/:id/pdf
//    (Admin + Terapeuta pueden generar)
// ==================================================================
router.get(
    '/patient/:id/pdf',
    isAuthenticated,
    requireTherapist,
    reportController.generatePatientPdf
);

// ==================================================================
// 7. REPORTE CLÍNICO EN EXCEL
//    GET /reports/patient/:id/excel
//    (Admin + Terapeuta pueden generar)
// ==================================================================
router.get(
    '/patient/:id/excel',
    isAuthenticated,
    requireTherapist,
    reportController.generatePatientExcel
);

module.exports = router;

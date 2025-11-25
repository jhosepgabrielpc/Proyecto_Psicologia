const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { authenticateToken, requireTherapist, requireAdmin } = require('../middleware/auth');

// Middleware global de protección
router.use(authenticateToken);

// --- VISTAS (Navegación) ---

// 1. Analytics (Solo Admin)
router.get('/analytics', requireAdmin, reportController.renderAnalyticsDashboard);

// 2. Dashboard de Historiales (Lista de Pacientes - Solo Terapeuta)
router.get('/history', requireTherapist, reportController.renderHistoryDashboard);

// 3. Ver Expediente Completo de un Paciente
router.get('/patient/:patientId/view', requireTherapist, reportController.renderPatientHistoryView);

// 4. Formulario para Crear Reporte de Progreso
router.get('/patient/:patientId/create-report', requireTherapist, reportController.renderCreateProgressView);

// --- ACCIONES (Formularios) ---

// Procesar creación de reporte
router.post('/progress', requireTherapist, reportController.generateProgressReport);

// --- API (JSON para gráficos o datos crudos) ---
router.get('/api/analytics', requireAdmin, reportController.getPlatformAnalytics);
router.get('/api/audit-log', requireAdmin, reportController.getAuditLog);


// ... rutas existentes ...

// Acción para editar nota de sesión
router.post('/session/update', requireTherapist, reportController.updateSessionNote);


module.exports = router;
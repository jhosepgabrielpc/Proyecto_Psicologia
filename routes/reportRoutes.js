const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { authenticateToken, requireTherapist, requireAdmin } = require('../middleware/auth');

router.use(authenticateToken);

router.get('/patient/:patientId/clinical-history', reportController.getPatientClinicalHistory);
router.post('/progress', requireTherapist, reportController.generateProgressReport);
router.get('/patient/:patientId/progress', reportController.getProgressReports);
router.get('/analytics', requireAdmin, reportController.getPlatformAnalytics);
router.get('/audit-log', requireAdmin, reportController.getAuditLog);

module.exports = router;
const express = require('express');
const router = express.Router();
const monitoringController = require('../controllers/monitoringController');
const { authenticateToken, requirePatient } = require('../middleware/auth');
const { validateEmotionalCheckIn } = require('../middleware/validation');

router.use(authenticateToken);

router.post('/check-in', requirePatient, validateEmotionalCheckIn, monitoringController.submitEmotionalCheckIn);
router.post('/scales/submit', requirePatient, monitoringController.submitScaleResponse);
router.get('/scales/pending', requirePatient, monitoringController.getPendingScales);
router.get('/patient/:patientId/history', monitoringController.getPatientEmotionalHistory);

module.exports = router;
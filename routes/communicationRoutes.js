const express = require('express');
const router = express.Router();
const communicationController = require('../controllers/communicationController');
const { authenticateToken } = require('../middleware/auth');
const { validateMessage } = require('../middleware/validation');

router.use(authenticateToken);

router.get('/conversations', communicationController.getConversations);
router.get('/conversations/:conversationId/messages', communicationController.getMessages);
router.post('/conversations/:conversationId/messages', validateMessage, communicationController.sendMessage);
router.get('/notifications', communicationController.getNotifications);
router.put('/notifications/:notificationId/read', communicationController.markNotificationAsRead);
router.get('/clinical-alerts', communicationController.getClinicalAlerts);

module.exports = router;
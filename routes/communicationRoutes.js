const express = require('express');
const router = express.Router();
const communicationController = require('../controllers/communicationController');
const { authenticateToken } = require('../middleware/auth');
const { validateMessage } = require('../middleware/validation');

router.use(authenticateToken);

router.get('/chat', (req, res) => {
    res.render('communication/chat', {
        title: 'Chat - MindCare',
        user: req.session.user
    });
});

router.get('/notifications', (req, res) => {
    res.render('communication/notifications', {
        title: 'Notificaciones - MindCare',
        user: req.session.user
    });
});

router.get('/alerts', (req, res) => {
    res.render('communication/alerts', {
        title: 'Alertas Clínicas - MindCare',
        user: req.session.user
    });
});

router.get('/conversations', communicationController.getConversations);
router.get('/conversations/:conversationId/messages', communicationController.getMessages);
router.post('/conversations/:conversationId/messages', validateMessage, communicationController.sendMessage);
router.get('/notifications', communicationController.getNotifications);
router.put('/notifications/:notificationId/read', communicationController.markNotificationAsRead);
router.get('/clinical-alerts', communicationController.getClinicalAlerts);

module.exports = router;
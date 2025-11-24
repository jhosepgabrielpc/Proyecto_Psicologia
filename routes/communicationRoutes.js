const express = require('express');
const router = express.Router();
const communicationController = require('../controllers/communicationController');
const { isAuthenticated } = require('../middleware/auth');

// ==================================================================
// RUTAS DEL SISTEMA DE CHAT
// (Montado en /dashboard/communication por server.js)
// ==================================================================

// 1. VISTA PRINCIPAL
// GET /dashboard/communication
// Carga la interfaz, contactos y mensajes.
router.get('/', isAuthenticated, communicationController.getChatInterface);

// 2. ENVIAR MENSAJE (API)
// POST /dashboard/communication/save
// Esta es la ruta que llama el fetch() del EJS. Es vital que se llame '/save'.
router.post('/save', isAuthenticated, communicationController.sendMessage);

// 3. NOTIFICACIONES (API)
// GET /dashboard/communication/notifications
// Obtiene las alertas para la campanita.
router.get('/notifications', isAuthenticated, communicationController.getNotifications);

// 4. LEER NOTIFICACIÓN (API)
// POST /dashboard/communication/notifications/:id/read
// Marca como leída.
router.post('/notifications/:id/read', isAuthenticated, communicationController.markNotificationAsRead);

module.exports = router;
const express = require('express');
const router = express.Router();
const communicationController = require('../controllers/communicationController');

// CORRECCIÓN AQUÍ: Apuntamos a 'auth' que es el nombre real de tu archivo
const { isAuthenticated } = require('../middleware/auth'); 

// ==================================================================
// 1. VISTAS (RENDERIZADO DEL HTML)
// ==================================================================

// GET /communication/
// Carga la interfaz principal: Lista de contactos + Chat + Historial
router.get('/', isAuthenticated, communicationController.getChatInterface);


// ==================================================================
// 2. API ENDPOINTS (PARA AJAX / FETCH / SOCKET)
// ==================================================================

// POST /communication/save
// Guarda un mensaje en la BD y crea la notificación
router.post('/save', isAuthenticated, communicationController.sendMessage);

// GET /communication/notifications
// Obtiene el JSON de notificaciones para la campanita del header
router.get('/notifications', isAuthenticated, communicationController.getNotifications);

// POST /communication/notifications/:id/read
// Marca una notificación específica como leída
router.post('/notifications/:id/read', isAuthenticated, communicationController.markNotificationAsRead);


module.exports = router;
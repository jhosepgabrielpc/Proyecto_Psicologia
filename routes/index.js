const express = require('express');
const router = express.Router();

// ==================================================================
// RUTA PRINCIPAL (LANDING PAGE)
// ==================================================================
router.get('/', (req, res) => {
    // Renderiza la vista 'index.ejs' pasando el usuario (si existe)
    res.render('index', { 
        title: 'Bienvenido a MindCare', 
        user: req.session.user || null 
    });
});

// ¡ESTA LÍNEA ES OBLIGATORIA PARA EVITAR EL ERROR "got a Object"!
module.exports = router;
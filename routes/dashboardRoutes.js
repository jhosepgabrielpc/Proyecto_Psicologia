const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');

router.get('/patient', authenticateToken, (req, res) => {
  if (req.user.nombre_rol !== 'Paciente') {
    return res.redirect('/dashboard/' + req.user.nombre_rol.toLowerCase());
  }
  res.render('dashboard/patient', {
    title: 'Dashboard Paciente - MindCare',
    user: req.session.user
  });
});

router.get('/therapist', authenticateToken, (req, res) => {
  if (req.user.nombre_rol !== 'Terapeuta') {
    return res.redirect('/dashboard/' + req.user.nombre_rol.toLowerCase());
  }
  res.render('dashboard/therapist', {
    title: 'Dashboard Terapeuta - MindCare',
    user: req.session.user
  });
});

router.get('/admin', authenticateToken, (req, res) => {
  if (req.user.nombre_rol !== 'Admin') {
    return res.redirect('/dashboard/' + req.user.nombre_rol.toLowerCase());
  }
  res.render('dashboard/admin', {
    title: 'Dashboard Admin - MindCare',
    user: req.session.user
  });
});

module.exports = router;
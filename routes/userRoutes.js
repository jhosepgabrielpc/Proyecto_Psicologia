const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

router.get('/profile', async (req, res) => {
  res.render('profile', { title: 'Mi Perfil', user: req.session.user });
});

module.exports = router;
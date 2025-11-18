const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

router.get('/', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT t.*, u.nombre, u.apellido, u.foto_perfil, e.nombre_especialidad
      FROM Terapeutas t
      JOIN Usuarios u ON t.id_usuario = u.id_usuario
      LEFT JOIN Especialidades e ON t.id_especialidad = e.id_especialidad
      WHERE t.estado_verificacion = 'aprobado' AND u.estado = true
      ORDER BY t.calificacion_promedio DESC
    `);

    res.json({ therapists: result.rows });
  } catch (error) {
    console.error('Error obteniendo terapeutas:', error);
    res.status(500).json({ error: 'Error al obtener terapeutas' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT t.*, u.nombre, u.apellido, u.email, u.telefono, u.foto_perfil, e.nombre_especialidad
      FROM Terapeutas t
      JOIN Usuarios u ON t.id_usuario = u.id_usuario
      LEFT JOIN Especialidades e ON t.id_especialidad = e.id_especialidad
      WHERE t.id_terapeuta = $1
    `, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Terapeuta no encontrado' });
    }

    res.json({ therapist: result.rows[0] });
  } catch (error) {
    console.error('Error obteniendo terapeuta:', error);
    res.status(500).json({ error: 'Error al obtener terapeuta' });
  }
});

module.exports = router;
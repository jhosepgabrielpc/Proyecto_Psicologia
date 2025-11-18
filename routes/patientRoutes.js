const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticateToken, requireTherapist } = require('../middleware/auth');

router.use(authenticateToken);

router.get('/my-patients', requireTherapist, async (req, res) => {
  try {
    const therapistResult = await db.query(
      'SELECT id_terapeuta FROM Terapeutas WHERE id_usuario = $1',
      [req.user.id_usuario]
    );

    if (therapistResult.rows.length === 0) {
      return res.status(404).json({ error: 'Terapeuta no encontrado' });
    }

    const result = await db.query(`
      SELECT p.*, u.nombre, u.apellido, u.email, u.telefono, u.foto_perfil
      FROM Pacientes p
      JOIN Usuarios u ON p.id_usuario = u.id_usuario
      WHERE p.id_terapeuta_principal = $1 AND p.estado_tratamiento = 'activo'
      ORDER BY u.nombre ASC
    `, [therapistResult.rows[0].id_terapeuta]);

    res.json({ patients: result.rows });
  } catch (error) {
    console.error('Error obteniendo pacientes:', error);
    res.status(500).json({ error: 'Error al obtener pacientes' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT p.*, u.nombre, u.apellido, u.email, u.telefono, u.fecha_nacimiento,
             u.genero, u.foto_perfil
      FROM Pacientes p
      JOIN Usuarios u ON p.id_usuario = u.id_usuario
      WHERE p.id_paciente = $1
    `, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Paciente no encontrado' });
    }

    res.json({ patient: result.rows[0] });
  } catch (error) {
    console.error('Error obteniendo paciente:', error);
    res.status(500).json({ error: 'Error al obtener paciente' });
  }
});

module.exports = router;
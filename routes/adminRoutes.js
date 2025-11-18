const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

router.use(authenticateToken);
router.use(requireAdmin);

router.get('/pending-therapists', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT t.*, u.nombre, u.apellido, u.email, u.telefono, e.nombre_especialidad
      FROM Terapeutas t
      JOIN Usuarios u ON t.id_usuario = u.id_usuario
      LEFT JOIN Especialidades e ON t.id_especialidad = e.id_especialidad
      WHERE t.estado_verificacion = 'pendiente'
      ORDER BY u.fecha_registro DESC
    `);

    res.json({ pendingTherapists: result.rows });
  } catch (error) {
    console.error('Error obteniendo terapeutas pendientes:', error);
    res.status(500).json({ error: 'Error al obtener terapeutas pendientes' });
  }
});

router.put('/therapist/:id/approve', async (req, res) => {
  try {
    const { motivo } = req.body;

    await db.query(
      `UPDATE Terapeutas SET estado_verificacion = 'aprobado', fecha_verificacion = NOW()
       WHERE id_terapeuta = $1`,
      [req.params.id]
    );

    res.json({ message: 'Terapeuta aprobado exitosamente' });
  } catch (error) {
    console.error('Error aprobando terapeuta:', error);
    res.status(500).json({ error: 'Error al aprobar terapeuta' });
  }
});

router.put('/therapist/:id/reject', async (req, res) => {
  try {
    const { motivo_rechazo } = req.body;

    await db.query(
      `UPDATE Terapeutas SET estado_verificacion = 'rechazado', motivo_rechazo = $1, fecha_verificacion = NOW()
       WHERE id_terapeuta = $2`,
      [motivo_rechazo, req.params.id]
    );

    res.json({ message: 'Terapeuta rechazado' });
  } catch (error) {
    console.error('Error rechazando terapeuta:', error);
    res.status(500).json({ error: 'Error al rechazar terapeuta' });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const totalUsers = await db.query('SELECT COUNT(*) as total FROM Usuarios');
    const totalPatients = await db.query('SELECT COUNT(*) as total FROM Pacientes');
    const totalTherapists = await db.query('SELECT COUNT(*) as total FROM Terapeutas WHERE estado_verificacion = \'aprobado\'');
    const totalAppointments = await db.query('SELECT COUNT(*) as total FROM Citas');
    const activeAlerts = await db.query('SELECT COUNT(*) as total FROM Alertas_Clinicas WHERE estado = \'activa\'');

    res.json({
      stats: {
        total_usuarios: parseInt(totalUsers.rows[0].total),
        total_pacientes: parseInt(totalPatients.rows[0].total),
        total_terapeutas: parseInt(totalTherapists.rows[0].total),
        total_citas: parseInt(totalAppointments.rows[0].total),
        alertas_activas: parseInt(activeAlerts.rows[0].total)
      }
    });
  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

module.exports = router;
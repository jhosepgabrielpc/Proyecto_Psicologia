// routes/adminRoutes.js

const express = require('express');
const router = express.Router();

const db = require('../config/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// ============================================================
// TODAS LAS RUTAS DE ESTE MÓDULO: LOGIN + ROL ADMIN
// ============================================================
router.use(authenticateToken);
router.use(requireAdmin);

/**
 * GET /admin/pending-therapists
 * Lista de terapeutas pendientes de verificación.
 */
router.get('/pending-therapists', async (req, res) => {
    try {
        const result = await db.query(
            `
            SELECT 
                t.*,
                u.nombre,
                u.apellido,
                u.email,
                u.telefono,
                e.nombre_especialidad
            FROM Terapeutas t
            JOIN Usuarios u ON t.id_usuario = u.id_usuario
            LEFT JOIN Especialidades e ON t.id_especialidad = e.id_especialidad
            WHERE t.estado_verificacion = 'pendiente'
            ORDER BY u.fecha_registro DESC
            `
        );

        return res.json({ pendingTherapists: result.rows });
    } catch (error) {
        console.error('Error obteniendo terapeutas pendientes:', error);
        return res
            .status(500)
            .json({ error: 'Error al obtener terapeutas pendientes' });
    }
});

/**
 * PUT /admin/therapist/:id/approve
 * Aprueba a un terapeuta pendiente.
 */
router.put('/therapist/:id/approve', async (req, res) => {
    const idTerapeuta = parseInt(req.params.id, 10);

    if (Number.isNaN(idTerapeuta)) {
        return res
            .status(400)
            .json({ error: 'Identificador de terapeuta inválido' });
    }

    try {
        const { motivo } = req.body || {};

        const result = await db.query(
            `
            UPDATE Terapeutas 
               SET estado_verificacion = 'aprobado',
                   fecha_verificacion = NOW()
             WHERE id_terapeuta = $1
            `,
            [idTerapeuta]
        );

        if (result.rowCount === 0) {
            return res
                .status(404)
                .json({ error: 'Terapeuta no encontrado para aprobación' });
        }

        // En el futuro aquí podrías agregar:
        // - Notificación al terapeuta
        // - Registro de auditoría con "motivo"

        return res.json({ message: 'Terapeuta aprobado exitosamente' });
    } catch (error) {
        console.error('Error aprobando terapeuta:', error);
        return res
            .status(500)
            .json({ error: 'Error al aprobar terapeuta' });
    }
});

/**
 * PUT /admin/therapist/:id/reject
 * Rechaza a un terapeuta pendiente.
 */
router.put('/therapist/:id/reject', async (req, res) => {
    const idTerapeuta = parseInt(req.params.id, 10);

    if (Number.isNaN(idTerapeuta)) {
        return res
            .status(400)
            .json({ error: 'Identificador de terapeuta inválido' });
    }

    try {
        const { motivo_rechazo } = req.body || {};

        const result = await db.query(
            `
            UPDATE Terapeutas 
               SET estado_verificacion = 'rechazado',
                   motivo_rechazo = $1,
                   fecha_verificacion = NOW()
             WHERE id_terapeuta = $2
            `,
            [motivo_rechazo || null, idTerapeuta]
        );

        if (result.rowCount === 0) {
            return res
                .status(404)
                .json({ error: 'Terapeuta no encontrado para rechazo' });
        }

        // Aquí también podrías:
        // - Notificar al terapeuta del rechazo
        // - Registrar auditoría

        return res.json({ message: 'Terapeuta rechazado' });
    } catch (error) {
        console.error('Error rechazando terapeuta:', error);
        return res
            .status(500)
            .json({ error: 'Error al rechazar terapeuta' });
    }
});

/**
 * GET /admin/stats
 * KPIs globales para panel admin (API JSON).
 */
router.get('/stats', async (req, res) => {
    try {
        // Un solo query con sub-consultas para evitar múltiples viajes
        const statsRes = await db.query(
            `
            SELECT 
                (SELECT COUNT(*) FROM Usuarios) AS total_usuarios,
                (SELECT COUNT(*) FROM Pacientes) AS total_pacientes,
                (SELECT COUNT(*) 
                   FROM Terapeutas 
                  WHERE estado_verificacion = 'aprobado') AS total_terapeutas,
                (SELECT COUNT(*) FROM Citas) AS total_citas,
                -- Usamos incidencias_clinicas como fuente de alertas activas
                (SELECT COUNT(*) 
                   FROM incidencias_clinicas 
                  WHERE estado != 'RESUELTO') AS alertas_activas
            `
        );

        const row = statsRes.rows[0] || {};

        return res.json({
            stats: {
                total_usuarios: parseInt(row.total_usuarios || 0, 10),
                total_pacientes: parseInt(row.total_pacientes || 0, 10),
                total_terapeutas: parseInt(row.total_terapeutas || 0, 10),
                total_citas: parseInt(row.total_citas || 0, 10),
                alertas_activas: parseInt(row.alertas_activas || 0, 10)
            }
        });
    } catch (error) {
        console.error('Error obteniendo estadísticas:', error);
        return res
            .status(500)
            .json({ error: 'Error al obtener estadísticas' });
    }
});

module.exports = router;

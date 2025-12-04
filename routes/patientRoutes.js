// routes/patientRoutes.js

const express = require('express');
const router = express.Router();

const db = require('../config/database');
const { authenticateToken, requireTherapist } = require('../middleware/auth');

// Todas las rutas requieren sesión activa
router.use(authenticateToken);

/**
 * GET /patients/my-patients
 * Lista los pacientes asignados al terapeuta actual (activo).
 * Solo roles clínicos (Terapeuta / Admin / etc.) gracias a requireTherapist.
 */
router.get('/my-patients', requireTherapist, async (req, res) => {
    try {
        const currentUser = req.session.user;

        const therapistResult = await db.query(
            'SELECT id_terapeuta FROM Terapeutas WHERE id_usuario = $1',
            [currentUser.id_usuario]
        );

        if (therapistResult.rows.length === 0) {
            return res
                .status(404)
                .json({ error: 'Terapeuta no encontrado para el usuario actual' });
        }

        const idTerapeuta = therapistResult.rows[0].id_terapeuta;

        const result = await db.query(
            `
            SELECT 
                p.*,
                u.nombre,
                u.apellido,
                u.email,
                u.telefono,
                u.foto_perfil
            FROM Pacientes p
            JOIN Usuarios u ON p.id_usuario = u.id_usuario
            WHERE p.id_terapeuta = $1
              AND p.estado_tratamiento = 'activo'
            ORDER BY u.nombre ASC, u.apellido ASC
            `,
            [idTerapeuta]
        );

        return res.json({ patients: result.rows });
    } catch (error) {
        console.error('Error obteniendo pacientes:', error);
        return res
            .status(500)
            .json({ error: 'Error al obtener pacientes' });
    }
});

/**
 * GET /patients/:id
 * Ficha básica de un paciente concreto.
 * Se protege con requireTherapist para que no la pueda pedir cualquiera.
 */
router.get('/:id', requireTherapist, async (req, res) => {
    const idPaciente = parseInt(req.params.id, 10);

    if (Number.isNaN(idPaciente)) {
        return res
            .status(400)
            .json({ error: 'Identificador de paciente inválido' });
    }

    try {
        const result = await db.query(
            `
            SELECT 
                p.*,
                u.nombre,
                u.apellido,
                u.email,
                u.telefono,
                u.fecha_nacimiento,
                u.genero,
                u.foto_perfil
            FROM Pacientes p
            JOIN Usuarios u ON p.id_usuario = u.id_usuario
            WHERE p.id_paciente = $1
            `,
            [idPaciente]
        );

        if (result.rows.length === 0) {
            return res
                .status(404)
                .json({ error: 'Paciente no encontrado' });
        }

        return res.json({ patient: result.rows[0] });
    } catch (error) {
        console.error('Error obteniendo paciente:', error);
        return res
            .status(500)
            .json({ error: 'Error al obtener paciente' });
    }
});

module.exports = router;

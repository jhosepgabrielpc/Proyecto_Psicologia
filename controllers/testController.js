const db = require('../config/database');

// ====================================================================
// 1. RENDERIZAR VISTA DEL TEST (GET)
// ====================================================================
const getTestView = (req, res) => {
    const { type } = req.params; 
    
    const validTests = ['phq9', 'gad7'];
    if (!validTests.includes(type)) {
        return res.redirect('/dashboard/patient');
    }

    res.render('dashboard/test-phq9', { 
        title: `Evaluación ${type.toUpperCase()}`, 
        user: req.session.user,
        testType: type 
    });
};

// ====================================================================
// 2. GUARDAR RESULTADO DEL TEST (POST)
// ====================================================================
const saveTestResult = async (req, res) => {
    const userId = req.session.user.id_usuario;
    const { tipo_test, respuestas } = req.body; 

    try {
        const pRes = await db.query('SELECT id_paciente, id_terapeuta FROM Pacientes WHERE id_usuario = $1', [userId]);
        
        if (pRes.rows.length === 0) {
            return res.status(403).json({error: 'No tienes perfil de paciente.'});
        }
        
        const { id_paciente, id_terapeuta } = pRes.rows[0];

        let puntajeTotal = 0;
        if (Array.isArray(respuestas)) {
            puntajeTotal = respuestas.reduce((a, b) => parseInt(a) + parseInt(b), 0);
        }

        let severidad = 'Ninguna';
        if (tipo_test === 'PHQ-9') {
            if (puntajeTotal >= 20) severidad = 'Depresión Severa';
            else if (puntajeTotal >= 15) severidad = 'Depresión Moderadamente Severa';
            else if (puntajeTotal >= 10) severidad = 'Depresión Moderada';
            else if (puntajeTotal >= 5) severidad = 'Depresión Leve';
        } 
        else if (tipo_test === 'GAD-7') {
            if (puntajeTotal >= 15) severidad = 'Ansiedad Severa';
            else if (puntajeTotal >= 10) severidad = 'Ansiedad Moderada';
            else if (puntajeTotal >= 5) severidad = 'Ansiedad Leve';
        }

        await db.query(`
            INSERT INTO Resultados_Tests (id_paciente, tipo_test, puntaje_total, nivel_severidad, respuestas_json, fecha_realizacion)
            VALUES ($1, $2, $3, $4, $5, NOW())`,
            [id_paciente, tipo_test, puntajeTotal, severidad, JSON.stringify(respuestas)]
        );

        if ((severidad.includes('Severa') || severidad.includes('Moderada')) && id_terapeuta) {
            const tRes = await db.query('SELECT id_usuario FROM Terapeutas WHERE id_terapeuta = $1', [id_terapeuta]);
            if (tRes.rows.length > 0) {
                await db.query(`
                    INSERT INTO Notificaciones (id_usuario, tipo, mensaje, enlace_accion, fecha_creacion)
                    VALUES ($1, 'alerta_medica', 'ALERTA TEST: El paciente ${req.session.user.nombre} presenta ${severidad}.', '/dashboard/monitoring?patient=${id_paciente}', NOW())
                `, [tRes.rows[0].id_usuario]);
            }
        }

        res.json({ success: true, severidad: severidad, puntaje: puntajeTotal });

    } catch (error) {
        console.error('Error guardando test:', error);
        res.status(500).json({ error: 'Error interno.' });
    }
};

// EXPORTACIÓN OBLIGATORIA
module.exports = {
    getTestView,
    saveTestResult
};
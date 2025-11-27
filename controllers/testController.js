const db = require('../config/database');

// BANCO DE PREGUNTAS (ESTÁNDAR INTERNACIONAL)
const TESTS_DATA = {
    'phq9': {
        title: 'Cuestionario PHQ-9',
        subtitle: 'Evaluación de Salud del Paciente',
        questions: [
            "Tener poco interés o placer en hacer las cosas",
            "Sentirse desanimado/a, deprimido/a o sin esperanza",
            "Con problemas para dormir o manteniéndose dormido/a, o durmiendo demasiado",
            "Sentirse cansado/a o con poca energía",
            "Tener poco apetito o comer en exceso",
            "Sentirse mal consigo mismo/a - o que es un fracaso o que le ha fallado a sí mismo/a o a su familia",
            "Tener dificultad para concentrarse en ciertas actividades, tales como leer el periódico o ver la televisión",
            "Moverse o hablar tan lentamente que otras personas podrían haberlo notado. O lo contrario, estar tan inquieto/a o agitado/a que se ha estado moviendo mucho más de lo normal",
            "Pensamientos de que sería mejor estar muerto/a o de querer hacerse daño de alguna forma"
        ]
    },
    'gad7': {
        title: 'Escala GAD-7',
        subtitle: 'Evaluación de Ansiedad Generalizada',
        questions: [
            "Sentirse nervioso/a, intranquilo/a o con los nervios de punta",
            "No poder dejar de preocuparse o no poder controlar la preocupación",
            "Preocuparse demasiado por diferentes cosas",
            "Tener dificultad para relajarse",
            "Estar tan inquieto/a que es difícil permanecer sentado/a tranquilamente",
            "Molestarse o irritarse fácilmente",
            "Sentir miedo como si algo terrible fuera a pasar"
        ]
    }
};

// ====================================================================
// 1. MOSTRAR EL TEST (GET)
// ====================================================================
const showTest = (req, res) => {
    const { type } = req.params;
    const testConfig = TESTS_DATA[type];

    if (!testConfig) {
        return res.redirect('/dashboard/patient?msg=error_test_not_found');
    }

    res.render('dashboard/test-runner', {
        title: testConfig.title,
        user: req.session.user,
        testType: type,
        testInfo: testConfig
    });
};

// ====================================================================
// 2. PROCESAR RESPUESTAS (POST)
// ====================================================================
const submitTest = async (req, res) => {
    const { type } = req.params;
    const { respuestas } = req.body; // Array de números [0, 1, 3, ...]
    const userId = req.session.user.id_usuario;

    try {
        // 1. Calcular Puntaje Total
        // Convertimos las respuestas (strings) a números y sumamos
        const scores = Array.isArray(respuestas) ? respuestas.map(Number) : [Number(respuestas)];
        const totalScore = scores.reduce((a, b) => a + b, 0);

        // 2. Determinar Severidad (Lógica Clínica)
        let severidad = 'Ninguna';
        if (type === 'phq9') {
            if (totalScore >= 20) severidad = 'Depresión Severa';
            else if (totalScore >= 15) severidad = 'Depresión Moderadamente Severa';
            else if (totalScore >= 10) severidad = 'Depresión Moderada';
            else if (totalScore >= 5) severidad = 'Depresión Leve';
        } else if (type === 'gad7') {
            if (totalScore >= 15) severidad = 'Ansiedad Severa';
            else if (totalScore >= 10) severidad = 'Ansiedad Moderada';
            else if (totalScore >= 5) severidad = 'Ansiedad Leve';
        }

        // 3. Identificar Paciente y Terapeuta
        const pRes = await db.query(`SELECT id_paciente, id_terapeuta, u.nombre FROM Pacientes p JOIN Usuarios u ON p.id_usuario = u.id_usuario WHERE p.id_usuario = $1`, [userId]);
        if (pRes.rows.length === 0) throw new Error('Paciente no encontrado');
        const { id_paciente, id_terapeuta, nombre } = pRes.rows[0];

        // 4. Guardar en Base de Datos
        await db.query(`
            INSERT INTO resultados_tests (id_paciente, tipo_test, puntaje_total, nivel_severidad, respuestas_json, fecha_realizacion)
            VALUES ($1, $2, $3, $4, $5, NOW())
        `, [id_paciente, type.toUpperCase(), totalScore, severidad, JSON.stringify(scores)]);

        // 5. Alertas Automáticas (Si es severo)
        if (severidad.includes('Severa') || severidad.includes('Moderada')) {
            // Notificar al Terapeuta
            if (id_terapeuta) {
                const tUser = await db.query('SELECT id_usuario FROM Terapeutas WHERE id_terapeuta = $1', [id_terapeuta]);
                if (tUser.rows.length > 0) {
                    await db.query(`
                        INSERT INTO Notificaciones (id_usuario, tipo, mensaje, enlace_accion, fecha_creacion)
                        VALUES ($1, 'alerta_medica', 'ALERTA TEST: El paciente ${nombre} presenta ${severidad}.', '/dashboard/monitoring?patient=${id_paciente}', NOW())
                    `, [tUser.rows[0].id_usuario]);
                }
            }
        }

        res.redirect(`/dashboard/patient?msg=test_completed&score=${totalScore}&level=${severidad}`);

    } catch (error) {
        console.error('Error guardando test:', error);
        res.redirect('/dashboard/patient?msg=error_saving_test');
    }
};

module.exports = { showTest, submitTest };
// controllers/testController.js

const db = require('../config/database');

// BANCO DE PREGUNTAS (ESTÁNDAR INTERNACIONAL)
const TESTS_DATA = {
    phq9: {
        title: 'Cuestionario PHQ-9',
        subtitle: 'Evaluación de Salud del Paciente',
        questions: [
            'Tener poco interés o placer en hacer las cosas',
            'Sentirse desanimado/a, deprimido/a o sin esperanza',
            'Con problemas para dormir o manteniéndose dormido/a, o durmiendo demasiado',
            'Sentirse cansado/a o con poca energía',
            'Tener poco apetito o comer en exceso',
            'Sentirse mal consigo mismo/a - o que es un fracaso o que le ha fallado a sí mismo/a o a su familia',
            'Tener dificultad para concentrarse en ciertas actividades, tales como leer el periódico o ver la televisión',
            'Moverse o hablar tan lentamente que otras personas podrían haberlo notado. O lo contrario, estar tan inquieto/a o agitado/a que se ha estado moviendo mucho más de lo normal',
            'Pensamientos de que sería mejor estar muerto/a o de querer hacerse daño de alguna forma'
        ]
    },
    gad7: {
        title: 'Escala GAD-7',
        subtitle: 'Evaluación de Ansiedad Generalizada',
        questions: [
            'Sentirse nervioso/a, intranquilo/a o con los nervios de punta',
            'No poder dejar de preocuparse o no poder controlar la preocupación',
            'Preocuparse demasiado por diferentes cosas',
            'Tener dificultad para relajarse',
            'Estar tan inquieto/a que es difícil permanecer sentado/a tranquilamente',
            'Molestarse o irritarse fácilmente',
            'Sentir miedo como si algo terrible fuera a pasar'
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

    if (!req.session || !req.session.user) {
        return res.redirect('/auth/login?error=auth_required');
    }

    // Si quisieras limitar SOLO a rol Paciente:
    // const role = (req.session.user.nombre_rol || '').toLowerCase();
    // if (role !== 'paciente') { ... }

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
    const config = TESTS_DATA[type];

    if (!req.session || !req.session.user) {
        return res.redirect('/auth/login?error=auth_required');
    }

    // Validar tipo de test
    if (!config) {
        return res.redirect('/dashboard/patient?msg=error_test_not_found');
    }

    const { respuestas } = req.body; // Puede ser array de strings o un solo valor
    const userId = req.session.user.id_usuario;

    try {
        // 1. Normalizar respuestas
        if (!respuestas || (Array.isArray(respuestas) && respuestas.length === 0)) {
            return res.redirect('/dashboard/patient?msg=error_invalid_test');
        }

        const rawArray = Array.isArray(respuestas) ? respuestas : [respuestas];

        // Opcional: podrías comprobar que rawArray.length === config.questions.length
        // pero para no romper flujo si hay mínimo 1 respuesta, solo normalizamos.
        const scores = rawArray.map((value) => {
            const n = Number(value);
            return Number.isFinite(n) && n >= 0 ? n : 0;
        });

        // 2. Calcular Puntaje Total
        const totalScore = scores.reduce((a, b) => a + b, 0);

        // 3. Determinar Severidad (Lógica Clínica)
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

        // 4. Identificar Paciente y Terapeuta
        const pRes = await db.query(
            `
            SELECT 
                p.id_paciente, 
                p.id_terapeuta, 
                u.nombre 
            FROM Pacientes p 
            JOIN Usuarios u ON p.id_usuario = u.id_usuario 
            WHERE p.id_usuario = $1
            `,
            [userId]
        );

        if (pRes.rows.length === 0) {
            throw new Error('Paciente no encontrado para el usuario actual');
        }

        const { id_paciente, id_terapeuta, nombre } = pRes.rows[0];

        // 5. Guardar en Base de Datos
        // Formato legible para tipo de test en BD
        const tipoTestCodigo =
            type === 'phq9'
                ? 'PHQ-9'
                : type === 'gad7'
                ? 'GAD-7'
                : type.toUpperCase();

        await db.query(
            `
            INSERT INTO resultados_tests (
                id_paciente, 
                tipo_test, 
                puntaje_total, 
                nivel_severidad, 
                respuestas_json, 
                fecha_realizacion
            )
            VALUES ($1, $2, $3, $4, $5, NOW())
            `,
            [
                id_paciente,
                tipoTestCodigo,
                totalScore,
                severidad,
                JSON.stringify(scores)
            ]
        );

        // 6. Alertas Automáticas (Si es moderado o severo)
        if (severidad.includes('Severa') || severidad.includes('Moderada')) {
            if (id_terapeuta) {
                const tUser = await db.query(
                    'SELECT id_usuario FROM Terapeutas WHERE id_terapeuta = $1',
                    [id_terapeuta]
                );

                if (tUser.rows.length > 0) {
                    const idUsuarioTerapeuta = tUser.rows[0].id_usuario;

                    const mensaje = `ALERTA TEST: El paciente ${nombre} presenta ${severidad}.`;
                    const enlace = `/dashboard/monitoring?patient=${id_paciente}`;

                    await db.query(
                        `
                        INSERT INTO Notificaciones (
                            id_usuario, 
                            tipo, 
                            mensaje, 
                            enlace_accion, 
                            fecha_creacion,
                            leido
                        )
                        VALUES ($1, 'alerta_medica', $2, $3, NOW(), false)
                        `,
                        [idUsuarioTerapeuta, mensaje, enlace]
                    );
                }
            }
        }

        // 7. Redirección con parámetros informativos
        const encodedLevel = encodeURIComponent(severidad);
        return res.redirect(
            `/dashboard/patient?msg=test_completed&score=${totalScore}&level=${encodedLevel}`
        );
    } catch (error) {
        console.error('Error guardando test:', error);
        return res.redirect('/dashboard/patient?msg=error_saving_test');
    }
};

module.exports = {
    showTest,
    submitTest
};

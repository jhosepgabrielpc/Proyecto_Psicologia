const db = require('../config/database');

// ====================================================================
// 1. DASHBOARD DE MONITOREO (VISTA PRINCIPAL)
// ====================================================================
const getMonitoringDashboard = async (req, res) => {
    const userId = req.session.user.id_usuario;
    const role = req.session.user.nombre_rol;
    const targetPatientId = req.query.patient ? req.query.patient : null;

    console.log(`--> Cargando Monitoreo para: ${req.session.user.email} (${role})`);

    try {
        let patientIdToFetch = null;
        let patientsList = []; // Lista para el selector (Solo profesionales)

        // A. LÓGICA SEGÚN ROL
        if (role === 'Paciente') {
            // Si soy paciente, busco mi propio ID
            const pRes = await db.query('SELECT id_paciente FROM Pacientes WHERE id_usuario = $1', [userId]);
            if (pRes.rows.length > 0) {
                patientIdToFetch = pRes.rows[0].id_paciente;
            }
        } 
        else {
            // SI SOY PROFESIONAL (Terapeuta, Monitorista, Admin)
            
            if (targetPatientId) {
                // Caso 1: Ya seleccioné un paciente en la URL -> Ver sus datos
                patientIdToFetch = targetPatientId;
            } else {
                // Caso 2: No he seleccionado a nadie -> Cargar lista de mis pacientes
                
                // Buscamos si soy un Terapeuta específico
                const tRes = await db.query('SELECT id_terapeuta FROM Terapeutas WHERE id_usuario = $1', [userId]);
                
                let queryPatients = "";
                let params = [];

                if (tRes.rows.length > 0) {
                    // Es un Terapeuta: Traer solo SUS pacientes
                    queryPatients = `
                        SELECT p.id_paciente, u.nombre, u.apellido, u.email, u.foto_perfil,
                               (SELECT valencia FROM Checkins_Emocionales WHERE id_paciente = p.id_paciente ORDER BY fecha_hora DESC LIMIT 1) as ultima_valencia,
                               (SELECT fecha_hora FROM Checkins_Emocionales WHERE id_paciente = p.id_paciente ORDER BY fecha_hora DESC LIMIT 1) as ultimo_checkin
                        FROM Pacientes p
                        JOIN Usuarios u ON p.id_usuario = u.id_usuario
                        WHERE p.id_terapeuta = $1
                    `;
                    params = [tRes.rows[0].id_terapeuta];
                } else if (role.includes('Admin') || role === 'Monitorista') {
                    // Es Admin o Monitorista global: Traer TODOS los pacientes
                    queryPatients = `
                        SELECT p.id_paciente, u.nombre, u.apellido, u.email, u.foto_perfil,
                               (SELECT valencia FROM Checkins_Emocionales WHERE id_paciente = p.id_paciente ORDER BY fecha_hora DESC LIMIT 1) as ultima_valencia,
                               (SELECT fecha_hora FROM Checkins_Emocionales WHERE id_paciente = p.id_paciente ORDER BY fecha_hora DESC LIMIT 1) as ultimo_checkin
                        FROM Pacientes p
                        JOIN Usuarios u ON p.id_usuario = u.id_usuario
                    `;
                }

                if (queryPatients) {
                    const listRes = await db.query(queryPatients, params);
                    patientsList = listRes.rows;
                }
            }
        }

        // B. OBTENER DATOS (Solo si hay un paciente identificado para ver)
        let checkins = [];
        let testResults = [];
        let patientData = null;

        if (patientIdToFetch) {
            // 1. Historial de Check-ins
            const checkinsRes = await db.query(`
                SELECT * FROM Checkins_Emocionales 
                WHERE id_paciente = $1 
                ORDER BY fecha_hora DESC 
                LIMIT 30`, 
                [patientIdToFetch]
            );
            checkins = checkinsRes.rows;

            // 2. Resultados de Tests (CORREGIDO: JOIN CORRECTO A TABLAS EXISTENTES)
            // Se une Resultados_Escalas -> Escalas_Asignadas -> Tipos_Escala
            const testsRes = await db.query(`
                SELECT re.puntuacion_total as puntaje_total, re.fecha_completacion as fecha_realizacion, te.nombre_escala as tipo_test
                FROM Resultados_Escalas re
                JOIN Escalas_Asignadas ea ON re.id_asignacion = ea.id_asignacion
                JOIN Tipos_Escala te ON ea.id_tipo_escala = te.id_tipo_escala
                WHERE ea.id_paciente = $1
                ORDER BY re.fecha_completacion DESC
                LIMIT 5`, 
                [patientIdToFetch]
            );
            testResults = testsRes.rows;

            // 3. Datos del Paciente
            // 3. Datos del Paciente (CORREGIDO: Agregamos p.id_paciente)
            const patientInfo = await db.query(`
                SELECT p.id_paciente, u.nombre, u.apellido, u.foto_perfil, u.email, u.id_usuario
                FROM Pacientes p
                JOIN Usuarios u ON p.id_usuario = u.id_usuario
                WHERE p.id_paciente = $1`,
                [patientIdToFetch]
            );
            if(patientInfo.rows.length > 0) {
                patientData = patientInfo.rows[0];
            }
        }

        // C. RENDERIZAR VISTA
        res.render('dashboard/monitoring', {
            title: 'Monitoreo Clínico',
            user: req.session.user,
            
            // Datos para la vista
            checkins: checkins,
            tests: testResults,
            viewingPatient: patientData, // null si no he seleccionado a nadie
            patientsList: patientsList   // Array lleno si soy profesional en modo selección
        });

    } catch (error) {
        console.error('Error cargando monitoreo:', error);
        res.status(500).render('error', {
            title: 'Error de Monitoreo',
            message: 'No se pudieron cargar los datos del paciente. Verifica la conexión a la base de datos.',
            error: error,
            user: req.session.user
        });
    }
};

// ====================================================================
// 2. GUARDAR CHECK-IN DIARIO (POST)
// ====================================================================
const saveCheckin = async (req, res) => {
    const userId = req.session.user.id_usuario;
    const { valencia, activacion, emocion, notas } = req.body;

    if (!valencia || !emocion) {
        return res.redirect('/dashboard/monitoring?msg=error_missing_fields');
    }

    try {
        const pRes = await db.query('SELECT id_paciente, id_terapeuta FROM Pacientes WHERE id_usuario = $1', [userId]);
        if (pRes.rows.length === 0) throw new Error('Usuario no es paciente.');
        
        const { id_paciente, id_terapeuta } = pRes.rows[0];
        const esCritico = parseInt(valencia) <= 2;
        const actVal = activacion || 3; 
        
        await db.query(`
            INSERT INTO Checkins_Emocionales (id_paciente, valencia, activacion, emocion_principal, notas, requiere_atencion, fecha_hora)
            VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
            [id_paciente, valencia, actVal, emocion, notas, esCritico]
        );

        if (esCritico && id_terapeuta) {
            const tRes = await db.query('SELECT id_usuario FROM Terapeutas WHERE id_terapeuta = $1', [id_terapeuta]);
            if (tRes.rows.length > 0) {
                await db.query(`
                    INSERT INTO Notificaciones (id_usuario, tipo, mensaje, enlace_accion, fecha_creacion)
                    VALUES ($1, 'alerta_medica', 'ALERTA: Paciente ${req.session.user.nombre} reportó estado crítico.', '/dashboard/monitoring?patient=${id_paciente}', NOW())
                `, [tRes.rows[0].id_usuario]);
            }
        }

        res.redirect('/dashboard/monitoring?msg=checkin_saved');

    } catch (error) {
        console.error('Error checkin:', error);
        res.redirect('/dashboard/monitoring?msg=error');
    }
};

module.exports = {
    getMonitoringDashboard,
    saveCheckin
};
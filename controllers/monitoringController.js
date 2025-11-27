const db = require('../config/database');

// ====================================================================
// 1. DASHBOARD DE MONITOREO (VISTA PRINCIPAL)
// ====================================================================
const getMonitoringDashboard = async (req, res) => {
    const userId = req.session.user.id_usuario;
    const role = req.session.user.nombre_rol;
    const targetPatientId = req.query.patient ? req.query.patient : null;
    const daysFilter = req.query.days ? parseInt(req.query.days) : 7;

    try {
        let patientIdToFetch = null;
        let patientsList = [];
        let jimmyId = null; 
        
        // KPIs iniciales (Esto es crucial para el Dashboard)
        let kpis = { total: 0, criticos: 0, sueno_bajo: 0, estables: 0 };

        // 1. BUSCAR A JIMMY (GESTOR DE COMUNICACIÓN) - Para el sistema de alertas
        const jimmyRes = await db.query(`
            SELECT u.id_usuario FROM Usuarios u 
            JOIN Roles r ON u.id_rol = r.id_rol 
            WHERE r.nombre_rol = 'GestorComunicacion' LIMIT 1
        `);
        
        if (jimmyRes.rows.length > 0) {
            jimmyId = jimmyRes.rows[0].id_usuario;
        } else {
            const jimmyFallback = await db.query("SELECT id_usuario FROM Usuarios WHERE nombre ILIKE '%Jimmy%' LIMIT 1");
            if(jimmyFallback.rows.length > 0) jimmyId = jimmyFallback.rows[0].id_usuario;
        }

        // 2. LÓGICA DE PACIENTES SEGÚN ROL
        if (role === 'Paciente') {
            const pRes = await db.query('SELECT id_paciente FROM Pacientes WHERE id_usuario = $1', [userId]);
            if (pRes.rows.length > 0) patientIdToFetch = pRes.rows[0].id_paciente;
        } 
        else {
            // ES PROFESIONAL (Terapeuta, Monitorista, Admin)
            if (targetPatientId) patientIdToFetch = targetPatientId;

            // Construir la lista de pacientes (Datagrid) con subconsultas para tiempo real
            let queryBase = `
                SELECT p.id_paciente, u.nombre, u.apellido, u.email, u.foto_perfil,
                       (SELECT valencia FROM checkins_emocionales WHERE id_paciente = p.id_paciente ORDER BY fecha_hora DESC LIMIT 1) as ultima_valencia,
                       (SELECT emocion_principal FROM checkins_emocionales WHERE id_paciente = p.id_paciente ORDER BY fecha_hora DESC LIMIT 1) as ultima_emocion,
                       (SELECT horas_sueno FROM checkins_emocionales WHERE id_paciente = p.id_paciente ORDER BY fecha_hora DESC LIMIT 1) as ultimo_sueno,
                       (SELECT notas FROM checkins_emocionales WHERE id_paciente = p.id_paciente ORDER BY fecha_hora DESC LIMIT 1) as ultimas_notas,
                       (SELECT fecha_hora FROM checkins_emocionales WHERE id_paciente = p.id_paciente ORDER BY fecha_hora DESC LIMIT 1) as ultimo_checkin
                FROM Pacientes p
                JOIN Usuarios u ON p.id_usuario = u.id_usuario
            `;
            
            let params = [];

            if (role === 'Terapeuta') {
                const tRes = await db.query('SELECT id_terapeuta FROM Terapeutas WHERE id_usuario = $1', [userId]);
                if (tRes.rows.length > 0) {
                    queryBase += ` WHERE p.id_terapeuta = $1`;
                    params = [tRes.rows[0].id_terapeuta];
                }
            }

            queryBase += ` ORDER BY ultimo_checkin DESC NULLS LAST`;

            const listRes = await db.query(queryBase, params);
            patientsList = listRes.rows;

            // 3. CÁLCULO DE KPIs (Vital para el nuevo dashboard)
            kpis.total = patientsList.length;
            
            patientsList.forEach(p => {
                if (p.ultima_valencia && p.ultima_valencia <= 2) kpis.criticos++;
                else if (p.ultima_valencia >= 3) kpis.estables++;
                
                if (p.ultimo_sueno && p.ultimo_sueno < 6) kpis.sueno_bajo++;
            });
        }

        // 4. DETALLES DEL PACIENTE SELECCIONADO
        let checkins = [];
        let testResults = [];
        let patientData = null;

        if (patientIdToFetch) {
            const checkinsRes = await db.query(`SELECT * FROM checkins_emocionales WHERE id_paciente = $1 ORDER BY fecha_hora DESC LIMIT $2`, [patientIdToFetch, daysFilter * 2]);
            checkins = checkinsRes.rows;

            const testsRes = await db.query(`
                SELECT r.id_resultado, r.puntuacion_total as puntaje_total, r.interpretacion_automatica as severidad, 
                       r.respuestas as respuestas_json, r.fecha_completacion as fecha_realizacion, t.nombre_escala as tipo_test
                FROM resultados_escalas r
                JOIN escalas_asignadas a ON r.id_asignacion = a.id_asignacion
                JOIN tipos_escala t ON a.id_tipo_escala = t.id_tipo_escala
                WHERE a.id_paciente = $1 ORDER BY r.fecha_completacion DESC LIMIT 5`, [patientIdToFetch]);
            testResults = testsRes.rows;

            const patientInfo = await db.query(`SELECT u.nombre, u.apellido, u.foto_perfil, u.email, u.id_usuario, p.id_paciente FROM Pacientes p JOIN Usuarios u ON p.id_usuario = u.id_usuario WHERE p.id_paciente = $1`, [patientIdToFetch]);
            if(patientInfo.rows.length > 0) patientData = patientInfo.rows[0];
        }

        // 5. RENDERIZAR
        res.render('dashboard/monitoring', {
            title: 'Centro de Monitoreo',
            user: req.session.user,
            checkins: checkins,
            tests: testResults,
            viewingPatient: patientData,
            patientsList: patientsList,
            currentFilter: daysFilter,
            kpis: kpis,
            jimmyId: jimmyId
        });

    } catch (error) {
        console.error('Error cargando monitoreo:', error);
        res.status(500).render('error', { title: 'Error', message: 'Error interno.', error: error, user: req.session.user });
    }
};

// ====================================================================
// 2. GUARDAR CHECK-IN DIARIO (POST) - CON SUEÑO
// ====================================================================
const saveCheckin = async (req, res) => {
    const userId = req.session.user.id_usuario;
    const { valencia, activacion, emocion, notas, horas_sueno } = req.body;

    if (!valencia || !emocion) {
        return res.redirect('/dashboard/monitoring?msg=error_missing_fields');
    }

    try {
        const pRes = await db.query('SELECT id_paciente, id_terapeuta FROM Pacientes WHERE id_usuario = $1', [userId]);
        if (pRes.rows.length === 0) throw new Error('Usuario no es paciente.');
        
        const { id_paciente, id_terapeuta } = pRes.rows[0];
        const esCritico = parseInt(valencia) <= 2;
        const actVal = activacion || 3; 
        const sleepVal = horas_sueno ? parseInt(horas_sueno) : 0;
        
        await db.query(`
            INSERT INTO checkins_emocionales (id_paciente, valencia, activacion, emocion_principal, notas, requiere_atencion, horas_sueno, fecha_hora)
            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
            [id_paciente, valencia, actVal, emocion, notas, esCritico, sleepVal]
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

// ====================================================================
// 3. CREAR INCIDENCIA (ACCIÓN DE JHOSEP)
// ====================================================================
const createIncident = async (req, res) => {
    const { id_paciente, valencia, emocion, notas, sueno } = req.body;
    const monitorId = req.session.user.id_usuario;

    try {
        // Jhosep genera el reporte técnico automático
        const reporte = `ALERTA DE MONITOREO\nPac ID: ${id_paciente}\nEstado: ${valencia}/5 (${emocion})\nSueño: ${sueno}h\nObs: ${notas}`;

        await db.query(`
            INSERT INTO incidencias_clinicas (id_paciente, id_monitor, nivel_gravedad, reporte_inicial, estado)
            VALUES ($1, $2, 'ALTA', $3, 'PENDIENTE')
        `, [id_paciente, monitorId, reporte]);

        res.redirect('/dashboard/monitoring?msg=alert_sent');

    } catch (error) {
        console.error('Error creando incidencia:', error);
        res.redirect('/dashboard/monitoring?msg=error');
    }
};

module.exports = {
    getMonitoringDashboard,
    saveCheckin,
    createIncident // <--- IMPORTANTE: AGREGAR ESTO
};
const db = require('../config/database');
const { hashPassword } = require('../utils/helpers');

// ==================================================================================
// 1. DASHBOARD PACIENTE (EL AGREGADOR AUTÓNOMO) - ¡NUEVO! 🌟
// ==================================================================================
const getPatientDashboard = async (req, res) => {
    const userId = req.session.user.id_usuario;

    try {
        // 1. IDENTIFICAR AL PACIENTE
        const pRes = await db.query(`
            SELECT p.id_paciente, p.id_terapeuta, p.estado_tratamiento,
                   u.nombre as doc_nombre, u.apellido as doc_apellido, u.email as doc_email, u.foto_perfil as doc_foto
            FROM Pacientes p
            LEFT JOIN Terapeutas t ON p.id_terapeuta = t.id_terapeuta
            LEFT JOIN Usuarios u ON t.id_usuario = u.id_usuario
            WHERE p.id_usuario = $1
        `, [userId]);

        if (pRes.rows.length === 0) {
            return res.render('error', { 
                title: 'Perfil No Encontrado', 
                message: 'No tienes un expediente de paciente activo.',
                user: req.session.user 
            });
        }
        const patientData = pRes.rows[0];

        // 2. DATOS DE MONITOREO (Para la Gráfica) - Últimos 7 días
        const checkinsRes = await db.query(`
            SELECT valencia, emocion_principal, horas_sueno, notas, fecha_hora 
            FROM checkins_emocionales 
            WHERE id_paciente = $1 
            ORDER BY fecha_hora DESC LIMIT 7
        `, [patientData.id_paciente]);

        // 3. PRÓXIMA CITA (Para el Widget de Agenda)
        const appointmentRes = await db.query(`
            SELECT fecha_hora_inicio, modalidad, enlace_reunion, estado
            FROM Citas
            WHERE id_paciente = $1 
              AND fecha_hora_inicio >= NOW() 
              AND estado = 'Programada'
            ORDER BY fecha_hora_inicio ASC 
            LIMIT 1
        `, [patientData.id_paciente]);

        // 4. HISTORIAL DE CITAS (Para referencia rápida)
        const historyRes = await db.query(`
            SELECT c.fecha_hora_inicio, c.estado, u.apellido as doc_apellido
            FROM Citas c
            LEFT JOIN Terapeutas t ON c.id_terapeuta = t.id_terapeuta
            LEFT JOIN Usuarios u ON t.id_usuario = u.id_usuario
            WHERE c.id_paciente = $1 AND c.fecha_hora_inicio < NOW()
            ORDER BY c.fecha_hora_inicio DESC LIMIT 3
        `, [patientData.id_paciente]);

        // RENDERIZAR LA VISTA MAESTRA
        res.render('dashboard/patient', {
            title: 'Mi Espacio MindCare',
            user: req.session.user,
            therapist: patientData.id_terapeuta ? { 
                nombre: patientData.doc_nombre, 
                apellido: patientData.doc_apellido, 
                foto: patientData.doc_foto 
            } : null,
            checkins: checkinsRes.rows, // Para Chart.js
            nextAppointment: appointmentRes.rows.length > 0 ? appointmentRes.rows[0] : null,
            pastAppointments: historyRes.rows,
            msg: req.query.msg || null
        });

    } catch (error) {
        console.error('Error Dashboard Paciente:', error);
        res.status(500).render('error', { title: 'Error', message: 'Error cargando tu espacio.', error, user: req.session.user });
    }
};

// ==================================================================================
// 2. DASHBOARD ADMIN (TU CÓDIGO ORIGINAL MEJORADO)
// ==================================================================================
const getAdminDashboard = async (req, res) => {
    console.log("=== CARGANDO ADMIN DASHBOARD ===");

    if (!req.session || !req.session.user) return res.redirect('/auth/login');

    let currentUser = req.session.user;
    let statsData = { total_usuarios: 0, total_pacientes: 0, total_terapeutas: 0, citas_pendientes: 0 };
    let usersData = [], matchData = [], therapistsData = [], alertsData = [];

    try {
        // AUTO-REPARACIÓN DE SESIÓN
        try {
            const refreshUser = await db.query(`SELECT u.*, r.nombre_rol FROM Usuarios u LEFT JOIN Roles r ON u.id_rol = r.id_rol WHERE u.id_usuario = $1`, [req.session.user.id_usuario]);
            if (refreshUser.rows.length > 0) {
                req.session.user = refreshUser.rows[0]; 
                currentUser = req.session.user;
            }
        } catch (e) { console.warn("⚠️ Error refresco sesión:", e.message); }

        // KPIs
        const statsQuery = await db.query(`
            SELECT 
                (SELECT COUNT(*) FROM Usuarios)::int as total_usuarios,
                (SELECT COUNT(*) FROM Pacientes)::int as total_pacientes,
                (SELECT COUNT(*) FROM Terapeutas)::int as total_terapeutas,
                (SELECT COUNT(*) FROM Citas WHERE fecha_hora_inicio >= CURRENT_DATE AND estado = 'Programada')::int as citas_pendientes
        `);
        if (statsQuery.rows.length > 0) statsData = statsQuery.rows[0];

        // LISTAS DE GESTIÓN
        const usersQuery = await db.query(`SELECT u.id_usuario, u.nombre, u.apellido, u.email, u.estado, u.fecha_registro, COALESCE(r.nombre_rol, 'Sin Rol') as nombre_rol FROM Usuarios u LEFT JOIN Roles r ON u.id_rol = r.id_rol ORDER BY u.fecha_registro DESC LIMIT 50`);
        usersData = usersQuery.rows;

        const unassignedQuery = await db.query(`SELECT p.id_paciente, u.nombre, u.apellido, u.email, p.fecha_inicio_tratamiento FROM Pacientes p JOIN Usuarios u ON p.id_usuario = u.id_usuario WHERE p.id_terapeuta IS NULL`);
        matchData = unassignedQuery.rows;

        const therapistsQuery = await db.query(`SELECT t.id_terapeuta, u.nombre, u.apellido, t.especialidad FROM Terapeutas t JOIN Usuarios u ON t.id_usuario = u.id_usuario WHERE u.estado = true`);
        therapistsData = therapistsQuery.rows;

        // ALERTA DE RIESGO
        try {
            const riskQuery = await db.query(`
                SELECT c.id_checkin, c.valencia, c.emocion_principal, c.notas, c.fecha_hora, u.nombre, u.apellido
                FROM checkins_emocionales c
                JOIN Pacientes p ON c.id_paciente = p.id_paciente
                JOIN Usuarios u ON p.id_usuario = u.id_usuario
                WHERE c.valencia <= 2
                ORDER BY c.fecha_hora DESC LIMIT 5
            `);
            alertsData = riskQuery.rows;
        } catch (e) { alertsData = []; }

        res.render('dashboard/admin', {
            title: 'Centro de Comando',
            user: currentUser,
            stats: statsData,
            users: usersData,
            unassignedPatients: matchData,
            therapists: therapistsData,
            alerts: alertsData,
            msg: req.query.msg || null
        });

    } catch (error) {
        console.error("🔥 ERROR ADMIN:", error);
        res.status(500).render('error', { title: 'Error Crítico', message: 'Fallo interno admin.', error, user: req.session.user });
    }
};

// ==================================================================================
// 3. FUNCIONES CRUD & MATCHMAKING (MANTENIDAS)
// ==================================================================================

const assignTherapist = async (req, res) => {
    const { id_paciente, id_terapeuta } = req.body;
    try {
        await db.query(`UPDATE Pacientes SET id_terapeuta = $1, estado_tratamiento = 'activo', fecha_inicio_tratamiento = NOW() WHERE id_paciente = $2`, [id_terapeuta, id_paciente]);
        res.redirect('/dashboard/admin?msg=assigned');
    } catch (error) { res.redirect('/dashboard/admin?msg=error'); }
};

const showCreateUserForm = (req, res) => {
    res.render('dashboard/create-user', { title: 'Nuevo Usuario', user: req.session.user, error: null, formData: {} });
};

const createUser = async (req, res) => {
    const { nombre, apellido, email, password, rol, telefono } = req.body;
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        const existing = await client.query('SELECT id_usuario FROM Usuarios WHERE email = $1', [email]);
        if (existing.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.render('dashboard/create-user', { title: 'Nuevo Usuario', user: req.session.user, error: 'Email ya existe.', formData: req.body });
        }

        const hashedPassword = await hashPassword(password);
        const roleRes = await client.query('SELECT id_rol FROM Roles WHERE nombre_rol = $1', [rol]);
        const idRol = roleRes.rows.length > 0 ? roleRes.rows[0].id_rol : 6;

        const userRes = await client.query(`INSERT INTO Usuarios (id_rol, nombre, apellido, email, password_hash, telefono, estado, email_verificado, fecha_registro) VALUES ($1, $2, $3, $4, $5, $6, true, true, NOW()) RETURNING id_usuario`, [idRol, nombre, apellido, email, hashedPassword, telefono]);
        const newId = userRes.rows[0].id_usuario;

        if (rol === 'Paciente') await client.query('INSERT INTO Pacientes (id_usuario, estado_tratamiento, fecha_inicio_tratamiento) VALUES ($1, $2, CURRENT_DATE)', [newId, 'activo']);
        else if (rol === 'Terapeuta') await client.query('INSERT INTO Terapeutas (id_usuario, especialidad) VALUES ($1, $2)', [newId, 'General']);

        await client.query('COMMIT');
        res.redirect('/dashboard/admin?msg=created');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error(error);
        res.render('dashboard/create-user', { title: 'Nuevo Usuario', user: req.session.user, error: 'Error técnico.', formData: req.body });
    } finally { client.release(); }
};

const showEditUserForm = async (req, res) => {
    try {
        const result = await db.query(`SELECT u.*, r.nombre_rol FROM Usuarios u LEFT JOIN Roles r ON u.id_rol = r.id_rol WHERE u.id_usuario = $1`, [req.params.id]);
        if (result.rows.length === 0) return res.redirect('/dashboard/admin');
        res.render('dashboard/edit-user', { title: 'Editar Usuario', user: req.session.user, editUser: result.rows[0], error: null });
    } catch (e) { res.redirect('/dashboard/admin'); }
};

const updateUser = async (req, res) => {
    const { id } = req.params;
    const { nombre, apellido, email, telefono, password, rol, estado } = req.body;
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        let estadoBool = estado === 'true';
        await client.query(`UPDATE Usuarios SET nombre=$1, apellido=$2, email=$3, telefono=$4, estado=$5 WHERE id_usuario=$6`, [nombre, apellido, email, telefono, estadoBool, id]);
        
        if (password && password.trim() !== '') {
            const hashed = await hashPassword(password);
            await client.query('UPDATE Usuarios SET password_hash = $1 WHERE id_usuario = $2', [hashed, id]);
        }
        
        const roleRes = await client.query('SELECT id_rol FROM Roles WHERE nombre_rol = $1', [rol]);
        if (roleRes.rows.length > 0) await client.query('UPDATE Usuarios SET id_rol = $1 WHERE id_usuario = $2', [roleRes.rows[0].id_rol, id]);

        await client.query('COMMIT');
        res.redirect('/dashboard/admin?msg=updated');
    } catch (error) {
        await client.query('ROLLBACK');
        res.render('dashboard/edit-user', { title: 'Editar', user: req.session.user, editUser: { ...req.body, id_usuario: id }, error: 'Error actualizar.' });
    } finally { client.release(); }
};

const toggleUserStatus = async (req, res) => {
    const { id } = req.params;
    try {
        if (id == req.session.user.id_usuario) return res.redirect('/dashboard/admin?msg=admin_protected');
        await db.query('UPDATE Usuarios SET estado = NOT estado WHERE id_usuario = $1', [id]);
        res.redirect('/dashboard/admin?msg=status_changed');
    } catch (e) { res.redirect('/dashboard/admin?msg=error'); }
};

module.exports = {
    getPatientDashboard, // <--- LA JOYA DE LA CORONA 👑
    getAdminDashboard,
    assignTherapist,
    showCreateUserForm,
    createUser,
    showEditUserForm,
    updateUser,
    toggleUserStatus
};
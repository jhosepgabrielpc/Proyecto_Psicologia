const db = require('../config/database');
const { hashPassword } = require('../utils/helpers');
//Cambios en consultas 
// ==================================================================================
// 1. DASHBOARD PACIENTE
// ==================================================================================
const getPatientDashboard = async (req, res) => {
    const userId = req.session.user.id_usuario;

    try {
        const pRes = await db.query(
            `
            SELECT p.id_paciente,
                   p.id_terapeuta,
                   p.estado_tratamiento,
                   u.nombre AS doc_nombre,
                   u.apellido AS doc_apellido,
                   u.email AS doc_email,
                   u.foto_perfil AS doc_foto
            FROM pacientes p
            LEFT JOIN terapeutas t ON p.id_terapeuta = t.id_terapeuta
            LEFT JOIN usuarios u ON t.id_usuario = u.id_usuario
            WHERE p.id_usuario = $1
            `,
            [userId]
        );

        if (pRes.rows.length === 0) {
            return res.render('error', {
                title: 'Perfil No Encontrado',
                message: 'No tienes un expediente de paciente activo.',
                user: req.session.user
            });
        }

        const patientData = pRes.rows[0];

        const checkinsRes = await db.query(
            `
            SELECT valencia,
                   emocion_principal,
                   horas_sueno,
                   notas,
                   fecha_hora 
            FROM checkins_emocionales 
            WHERE id_paciente = $1 
            ORDER BY fecha_hora DESC 
            LIMIT 7
            `,
            [patientData.id_paciente]
        );

        const appointmentRes = await db.query(
            `
            SELECT fecha_hora_inicio,
                   modalidad,
                   enlace_reunion,
                   estado
            FROM citas
            WHERE id_paciente = $1 
              AND fecha_hora_inicio >= NOW() 
              AND estado = 'Programada'
            ORDER BY fecha_hora_inicio ASC 
            LIMIT 1
            `,
            [patientData.id_paciente]
        );

        const historyRes = await db.query(
            `
            SELECT c.fecha_hora_inicio,
                   c.estado,
                   u.apellido AS doc_apellido
            FROM citas c
            LEFT JOIN terapeutas t ON c.id_terapeuta = t.id_terapeuta
            LEFT JOIN usuarios u ON t.id_usuario = u.id_usuario
            WHERE c.id_paciente = $1 
              AND c.fecha_hora_inicio < NOW()
            ORDER BY c.fecha_hora_inicio DESC 
            LIMIT 3
            `,
            [patientData.id_paciente]
        );

        res.render('dashboard/patient', {
            title: 'Mi Espacio MindCare',
            user: req.session.user,
            therapist: patientData.id_terapeuta
                ? {
                      nombre: patientData.doc_nombre,
                      apellido: patientData.doc_apellido,
                      foto: patientData.doc_foto
                  }
                : null,
            checkins: checkinsRes.rows,
            nextAppointment:
                appointmentRes.rows.length > 0 ? appointmentRes.rows[0] : null,
            pastAppointments: historyRes.rows,
            msg: req.query.msg || null
        });
    } catch (error) {
        console.error('Error Dashboard Paciente:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Error cargando tu espacio.',
            error,
            user: req.session.user
        });
    }
};

// ==================================================================================
// 2. DASHBOARD ADMIN – KPIs + LISTA + PAGINACIÓN + BUSCADOR
// ==================================================================================
const getAdminDashboard = async (req, res) => {
    console.log('=== CARGANDO ADMIN DASHBOARD ===');

    if (!req.session || !req.session.user) {
        return res.redirect('/auth/login');
    }

    const currentUser = req.session.user;

    let statsData = {
        total_usuarios: 0,
        total_pacientes: 0,
        total_terapeutas: 0,
        citas_pendientes: 0
    };

    let usersData = [];
    let matchData = [];
    let therapistsData = [];
    let alertsData = [];

    // Parámetros de paginación + búsqueda
    let page = parseInt(req.query.page, 10) || 1;
    if (page < 1) page = 1;
    const pageSize = 20;
    const search = (req.query.search || '').trim();
    const offset = (page - 1) * pageSize;

    try {
        // =========================
        // 2.1 KPIs globales
        // =========================
        const statsQuery = await db.query(`
            SELECT 
                (SELECT COUNT(*) FROM usuarios)::int                                             AS total_usuarios,
                (SELECT COUNT(*) FROM pacientes)::int                                             AS total_pacientes,
                (SELECT COUNT(*) FROM terapeutas)::int                                            AS total_terapeutas,
                (SELECT COUNT(*) FROM citas 
                  WHERE fecha_hora_inicio >= CURRENT_DATE 
                    AND estado = 'Programada')::int                                               AS citas_pendientes
        `);

        if (statsQuery.rows.length > 0) {
            statsData = statsQuery.rows[0];
        }

        // =========================
        // 2.2 LISTA USUARIOS (con filtro + paginación)
        // =========================
        let whereClause = '';
        const params = [];

        if (search) {
            whereClause =
                'WHERE u.nombre ILIKE $1 OR u.apellido ILIKE $1 OR u.email ILIKE $1';
            params.push(`%${search}%`);
        }

        // Total filtrado (para paginación)
        const countQueryText = `
            SELECT COUNT(*)::int AS total
            FROM usuarios u
            ${whereClause}
        `;
        const countRes = await db.query(countQueryText, params);
        const totalUsersFiltered = countRes.rows[0].total;
        const totalPages =
            totalUsersFiltered === 0
                ? 1
                : Math.ceil(totalUsersFiltered / pageSize);

        if (page > totalPages) {
            page = totalPages;
        }

        const usersQueryText = `
            SELECT 
                u.id_usuario,
                u.nombre,
                u.apellido,
                u.email,
                u.estado,
                u.fecha_registro,
                r.nombre_rol
            FROM usuarios u
            LEFT JOIN roles r ON u.id_rol = r.id_rol
            ${whereClause}
            ORDER BY u.fecha_registro DESC
            LIMIT ${pageSize} OFFSET ${offset}
        `;
        const usersQuery = await db.query(usersQueryText, params);
        usersData = usersQuery.rows;

        // =========================
        // 2.3 PACIENTES SIN TERAPEUTA
        // =========================
        const matchQuery = await db.query(`
            SELECT 
                p.id_paciente,
                u.id_usuario,
                u.nombre,
                u.apellido,
                u.email
            FROM pacientes p
            JOIN usuarios u ON p.id_usuario = u.id_usuario
            WHERE p.id_terapeuta IS NULL
            ORDER BY u.fecha_registro DESC
            LIMIT 30
        `);
        matchData = matchQuery.rows;

        // =========================
        // 2.4 TERAPEUTAS DISPONIBLES
        // =========================
        const therapistsQuery = await db.query(`
            SELECT 
                t.id_terapeuta,
                u.nombre,
                u.apellido,
                t.especialidad
            FROM terapeutas t
            JOIN usuarios u ON t.id_usuario = u.id_usuario
            ORDER BY u.apellido ASC, u.nombre ASC
        `);
        therapistsData = therapistsQuery.rows;

        // =========================
        // 2.5 ALERTAS CLÍNICAS
        // =========================
        const alertsQuery = await db.query(`
            SELECT 
                ce.id_checkin,
                ce.fecha_hora,
                ce.valencia,
                ce.activacion,
                ce.emocion_principal,
                ce.notas,
                p.id_paciente,
                u.id_usuario,
                u.nombre,
                u.apellido
            FROM checkins_emocionales ce
            JOIN pacientes p ON ce.id_paciente = p.id_paciente
            JOIN usuarios u ON p.id_usuario = u.id_usuario
            WHERE (ce.valencia <= 2 OR ce.requiere_atencion = true)
            ORDER BY ce.fecha_hora DESC
            LIMIT 10
        `);
        alertsData = alertsQuery.rows;

        // =========================
        // 2.6 RENDER
        // =========================
        res.render('dashboard/admin', {
            title: 'Centro de Comando',
            user: currentUser,
            stats: statsData,
            users: usersData,
            unassignedPatients: matchData,
            therapists: therapistsData,
            alerts: alertsData,
            msg: req.query.msg || null,
            search,
            pagination: {
                page,
                pageSize,
                totalUsers: totalUsersFiltered,
                totalPages
            }
        });
    } catch (error) {
        console.error('🔥 ERROR ADMIN:', error);
        res.status(500).render('error', {
            title: 'Error Crítico',
            message: 'Fallo interno en el módulo de administración.',
            error,
            user: req.session.user
        });
    }
};

// ==================================================================================
// 3. CRUD & MATCHMAKING
// ==================================================================================
const assignTherapist = async (req, res) => {
    const { id_paciente, id_terapeuta } = req.body;

    try {
        await db.query(
            `
            UPDATE pacientes
               SET id_terapeuta = $1,
                   estado_tratamiento = 'activo',
                   fecha_inicio_tratamiento = NOW()
             WHERE id_paciente = $2
            `,
            [id_terapeuta, id_paciente]
        );

        res.redirect('/dashboard/admin?msg=assigned');
    } catch (error) {
        console.error('Error al asignar terapeuta:', error);
        res.redirect('/dashboard/admin?msg=error');
    }
};

const showCreateUserForm = (req, res) => {
    res.render('dashboard/create-user', {
        title: 'Nuevo Usuario',
        user: req.session.user,
        error: null,
        formData: {}
    });
};

const createUser = async (req, res) => {
    const {
        nombre,
        apellido,
        email,
        password,
        rol,
        telefono,
        fecha_nacimiento
    } = req.body;

    const client = await db.pool.connect();

    try {
        await client.query('BEGIN');

        const existing = await client.query(
            'SELECT id_usuario FROM usuarios WHERE email = $1',
            [email]
        );

        if (existing.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.render('dashboard/create-user', {
                title: 'Nuevo Usuario',
                user: req.session.user,
                error: 'El email ya está registrado.',
                formData: req.body
            });
        }

        const hashedPassword = await hashPassword(password);

        const roleRes = await client.query(
            'SELECT id_rol FROM roles WHERE nombre_rol = $1',
            [rol]
        );
        const idRol = roleRes.rows.length > 0 ? roleRes.rows[0].id_rol : 6;

        const userRes = await client.query(
            `
            INSERT INTO usuarios 
                (id_rol, nombre, apellido, email, password_hash, telefono, fecha_nacimiento, estado, email_verificado, fecha_registro) 
            VALUES 
                ($1, $2, $3, $4, $5, $6, $7, true, true, NOW()) 
            RETURNING id_usuario
            `,
            [idRol, nombre, apellido, email, hashedPassword, telefono, fecha_nacimiento]
        );
        const newId = userRes.rows[0].id_usuario;

        if (rol === 'Paciente') {
            await client.query(
                `
                INSERT INTO pacientes (id_usuario, estado_tratamiento, fecha_inicio_tratamiento)
                VALUES ($1, $2, CURRENT_DATE)
                `,
                [newId, 'activo']
            );
        } else if (rol === 'Terapeuta') {
            await client.query(
                `
                INSERT INTO terapeutas (id_usuario, especialidad)
                VALUES ($1, $2)
                `,
                [newId, 'General']
            );
        }

        await client.query('COMMIT');
        res.redirect('/dashboard/admin?msg=created');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error al crear usuario:', error);
        res.render('dashboard/create-user', {
            title: 'Nuevo Usuario',
            user: req.session.user,
            error: 'Error técnico al crear el usuario.',
            formData: req.body
        });
    } finally {
        client.release();
    }
};

const showEditUserForm = async (req, res) => {
    try {
        const result = await db.query(
            `
            SELECT u.*, r.nombre_rol 
            FROM usuarios u 
            LEFT JOIN roles r ON u.id_rol = r.id_rol 
            WHERE u.id_usuario = $1
            `,
            [req.params.id]
        );

        if (result.rows.length === 0) {
            return res.redirect('/dashboard/admin');
        }

        res.render('dashboard/edit-user', {
            title: 'Editar Usuario',
            user: req.session.user,
            editUser: result.rows[0],
            error: null
        });
    } catch (e) {
        console.error('Error al cargar usuario para edición:', e);
        res.redirect('/dashboard/admin');
    }
};

const updateUser = async (req, res) => {
    const { id } = req.params;
    const {
        nombre,
        apellido,
        email,
        telefono,
        password,
        rol,
        estado,
        fecha_nacimiento
    } = req.body;

    const client = await db.pool.connect();

    try {
        await client.query('BEGIN');

        const estadoBool = estado === 'true';

        await client.query(
            `
            UPDATE usuarios
               SET nombre = $1,
                   apellido = $2,
                   email = $3,
                   telefono = $4,
                   estado = $5,
                   fecha_nacimiento = $6
             WHERE id_usuario = $7
            `,
            [nombre, apellido, email, telefono, estadoBool, fecha_nacimiento, id]
        );

        if (password && password.trim() !== '') {
            const hashed = await hashPassword(password);
            await client.query(
                'UPDATE usuarios SET password_hash = $1 WHERE id_usuario = $2',
                [hashed, id]
            );
        }

        const roleRes = await client.query(
            'SELECT id_rol FROM roles WHERE nombre_rol = $1',
            [rol]
        );

        if (roleRes.rows.length > 0) {
            await client.query(
                'UPDATE usuarios SET id_rol = $1 WHERE id_usuario = $2',
                [roleRes.rows[0].id_rol, id]
            );
        }

        await client.query('COMMIT');
        res.redirect('/dashboard/admin?msg=updated');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error al actualizar usuario:', error);
        res.render('dashboard/edit-user', {
            title: 'Editar Usuario',
            user: req.session.user,
            editUser: { ...req.body, id_usuario: id },
            error: 'Error al actualizar el usuario.'
        });
    } finally {
        client.release();
    }
};

const toggleUserStatus = async (req, res) => {
    const { id } = req.params;

    try {
        if (id == req.session.user.id_usuario) {
            return res.redirect('/dashboard/admin?msg=admin_protected');
        }

        await db.query(
            'UPDATE usuarios SET estado = NOT estado WHERE id_usuario = $1',
            [id]
        );

        res.redirect('/dashboard/admin?msg=status_changed');
    } catch (e) {
        console.error('Error al cambiar estado de usuario:', e);
        res.redirect('/dashboard/admin?msg=error');
    }
};

module.exports = {
    getPatientDashboard,
    getAdminDashboard,
    assignTherapist,
    showCreateUserForm,
    createUser,
    showEditUserForm,
    updateUser,
    toggleUserStatus
};

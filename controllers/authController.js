const db = require('../config/database');
const { hashPassword, comparePassword, generateToken, generateVerificationToken } = require('../utils/helpers');
const { sendVerificationEmail } = require('../config/email');
// IMPORTANTE: Importamos validationResult para manejar los errores del middleware
const { validationResult } = require('express-validator');

// ==========================================
// MÉTODOS DE VISTA (GET)
// ==========================================

const showRegisterForm = (req, res) => {
  res.render('auth/register', {
    title: 'Registro - MindCare',
    user: null,
    errors: [],
    formData: {}
  });
};

const showLoginForm = (req, res) => {
  res.render('auth/login', {
    title: 'Iniciar Sesión - MindCare',
    user: null,
    errors: [],
    formData: {}
  });
};

// ==========================================
// MÉTODOS DE LÓGICA (POST)
// ==========================================

// 1. REGISTRO DE USUARIO
const register = async (req, res) => {
  // A. Validar Campos (Express-Validator)
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.render('auth/register', {
      title: 'Registro - MindCare',
      user: null,
      errors: errors.array(),
      formData: req.body
    });
  }

  const client = await db.pool.connect();
  const { email, password, nombre, apellido, telefono, fecha_nacimiento, genero, rol } = req.body;

  try {
    await client.query('BEGIN');

    // B. Verificar si ya existe
    const existingUser = await client.query('SELECT * FROM Usuarios WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.render('auth/register', {
        title: 'Registro - MindCare',
        user: null,
        errors: [{ msg: 'El correo electrónico ya está registrado.' }],
        formData: req.body
      });
    }

    // C. Verificar Rol válido
    const roleResult = await client.query('SELECT id_rol FROM Roles WHERE nombre_rol = $1', [rol || 'Paciente']);
    if (roleResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.render('auth/register', {
        title: 'Registro - MindCare',
        user: null,
        errors: [{ msg: 'El rol seleccionado no es válido.' }],
        formData: req.body
      });
    }

    // D. Crear Usuario
    const hashedPassword = await hashPassword(password);
    const verificationToken = generateVerificationToken();

    const userResult = await client.query(
      `INSERT INTO Usuarios (id_rol, email, password_hash, nombre, apellido, telefono, fecha_nacimiento, genero, token_verificacion, fecha_registro)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()) RETURNING id_usuario, email, nombre, apellido`,
      [roleResult.rows[0].id_rol, email, hashedPassword, nombre, apellido, telefono, fecha_nacimiento, genero, verificationToken]
    );

    const newUser = userResult.rows[0];

    // E. Crear entrada vinculada (Paciente/Terapeuta)
    if (rol === 'Paciente' || !rol) {
      await client.query(
        'INSERT INTO Pacientes (id_usuario, estado_tratamiento, fecha_inicio_tratamiento) VALUES ($1, $2, CURRENT_DATE)',
        [newUser.id_usuario, 'activo']
      );
    }

    await client.query('COMMIT');

    // F. Enviar Email (No bloqueante)
    try {
      await sendVerificationEmail(email, verificationToken, nombre);
    } catch (emailError) {
      console.error('Error enviando email:', emailError);
    }

    res.redirect('/auth/login?registered=true');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error en registro:', error);
    res.render('auth/register', {
      title: 'Registro - MindCare',
      user: null,
      errors: [{ msg: 'Error interno del servidor. Intente nuevamente.' }],
      formData: req.body
    });
  } finally {
    client.release();
  }
};

// 2. INICIO DE SESIÓN (LOGIN)
const login = async (req, res) => {
  // A. Validar Campos
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.render('auth/login', {
      title: 'Iniciar Sesión - MindCare',
      user: null,
      errors: errors.array(),
      formData: { email: req.body.email }
    });
  }

  const { email, password } = req.body;

  try {
    // B. Buscar Usuario
    const result = await db.query(
      `SELECT u.*, r.nombre_rol
       FROM Usuarios u
       JOIN Roles r ON u.id_rol = r.id_rol
       WHERE u.email = $1`,
      [email]
    );

    const returnLoginError = (msg) => {
      return res.render('auth/login', {
        title: 'Iniciar Sesión - MindCare',
        user: null,
        errors: [{ msg: msg }],
        formData: { email }
      });
    };

    if (result.rows.length === 0) return returnLoginError('Credenciales inválidas.');

    const user = result.rows[0];

    // C. Validar Estado (Bloqueado/Inactivo)
    if (user.bloqueado_hasta && new Date(user.bloqueado_hasta) > new Date()) {
        return returnLoginError('Cuenta bloqueada temporalmente. Intenta en 15 minutos.');
    }
    if (!user.estado) {
        return returnLoginError('Cuenta desactivada. Contacta al administrador.');
    }

    // D. Verificar Contraseña
    const isValidPassword = await comparePassword(password, user.password_hash);

    if (!isValidPassword) {
      // Manejo de intentos fallidos
      const intentos = (user.intentos_login || 0) + 1;
      if (intentos >= 5) {
        await db.query("UPDATE Usuarios SET intentos_login = $1, bloqueado_hasta = NOW() + INTERVAL '15 minutes' WHERE id_usuario = $2", [intentos, user.id_usuario]);
        return returnLoginError('Cuenta bloqueada por múltiples intentos fallidos.');
      }
      await db.query('UPDATE Usuarios SET intentos_login = $1 WHERE id_usuario = $2', [intentos, user.id_usuario]);
      return returnLoginError('Credenciales inválidas.');
    }

    // E. Login Exitoso (Resetear intentos)
    await db.query(
      'UPDATE Usuarios SET intentos_login = 0, ultimo_login = NOW(), bloqueado_hasta = NULL WHERE id_usuario = $1',
      [user.id_usuario]
    );

    // F. Generar Token y Sesión
    const token = generateToken(user);
    res.cookie('token', token, { 
        httpOnly: true, 
        secure: process.env.NODE_ENV === 'production', 
        maxAge: 24 * 60 * 60 * 1000 
    });

    req.session.user = {
      id_usuario: user.id_usuario,
      email: user.email,
      nombre: user.nombre,
      apellido: user.apellido,
      rol: user.nombre_rol,
      foto_perfil: user.foto_perfil
    };

    // G. REDIRECCIÓN INTELIGENTE POR ROL
    let redirectPath = '/dashboard/patient'; // Default

    switch (user.nombre_rol) {
        case 'Administrador':
        case 'Admin':
            redirectPath = '/dashboard/admin';
            break;
        case 'Terapeuta':
            redirectPath = '/dashboard/therapist';
            break;
        case 'Monitorista':        // Jhosep
            redirectPath = '/dashboard/monitoring';
            break;
        case 'GestorCitas':        // Alan
            redirectPath = '/dashboard/appointments';
            break;
        case 'GestorHistorial':    // Renan
            redirectPath = '/dashboard/history';
            break;
        case 'GestorComunicacion': // Jimmy
            redirectPath = '/dashboard/communication';
            break;
    }

    res.redirect(redirectPath);

  } catch (error) {
    console.error('Error en login:', error);
    res.render('auth/login', {
      title: 'Iniciar Sesión',
      user: null,
      errors: [{ msg: 'Error al conectar con el servidor.' }],
      formData: { email }
    });
  }
};

// 3. CERRAR SESIÓN
const logout = (req, res) => {
  res.clearCookie('token');
  req.session.destroy((err) => {
    if (err) console.error('Error logout:', err);
    res.redirect('/');
  });
};

// 4. VERIFICAR EMAIL
const verifyEmail = async (req, res) => {
  try {
    const { token } = req.query;
    const result = await db.query(
      'UPDATE Usuarios SET email_verificado = true, fecha_verificacion = NOW(), token_verificacion = NULL WHERE token_verificacion = $1 RETURNING id_usuario',
      [token]
    );
    if (result.rows.length === 0) return res.redirect('/auth/login?error=token_invalido');
    res.redirect('/auth/login?verified=true');
  } catch (error) {
    console.error(error);
    res.status(500).send('Error en verificación');
  }
};

// 5. OBTENER USUARIO ACTUAL (API)
const getCurrentUser = async (req, res) => {
  try {
    if (!req.user || !req.user.id_usuario) return res.status(401).json({ error: 'No autenticado' });
    
    const result = await db.query('SELECT * FROM Usuarios WHERE id_usuario = $1', [req.user.id_usuario]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'No encontrado' });
    
    const userData = result.rows[0];
    delete userData.password_hash; // Seguridad: nunca devolver password
    
    res.json({ user: userData });
  } catch (error) {
    res.status(500).json({ error: 'Error servidor' });
  }
};

module.exports = {
  register,
  login,
  logout,
  verifyEmail,
  getCurrentUser,
  showRegisterForm,
  showLoginForm
};
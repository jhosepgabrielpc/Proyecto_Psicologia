const db = require('../config/database');
const { hashPassword, comparePassword, generateToken, generateVerificationToken } = require('../utils/helpers');
const { sendVerificationEmail } = require('../config/email');

const register = async (req, res) => {
  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    const { email, password, nombre, apellido, telefono, fecha_nacimiento, genero, rol } = req.body;

    const existingUser = await client.query('SELECT * FROM Usuarios WHERE email = $1', [email]);

    if (existingUser.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'El email ya está registrado' });
    }

    const hashedPassword = await hashPassword(password);
    const verificationToken = generateVerificationToken();

    const roleResult = await client.query(
      'SELECT id_rol FROM Roles WHERE nombre_rol = $1',
      [rol || 'Paciente']
    );

    if (roleResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Rol no válido' });
    }

    const userResult = await client.query(
      `INSERT INTO Usuarios (id_rol, email, password_hash, nombre, apellido, telefono, fecha_nacimiento, genero, token_verificacion)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id_usuario, email, nombre, apellido`,
      [roleResult.rows[0].id_rol, email, hashedPassword, nombre, apellido, telefono, fecha_nacimiento, genero, verificationToken]
    );

    const newUser = userResult.rows[0];

    if (rol === 'Paciente' || !rol) {
      await client.query(
        'INSERT INTO Pacientes (id_usuario, estado_tratamiento, fecha_inicio_tratamiento) VALUES ($1, $2, CURRENT_DATE)',
        [newUser.id_usuario, 'activo']
      );
    }

    await client.query('COMMIT');

    await sendVerificationEmail(email, verificationToken, nombre);

    res.status(201).json({
      message: 'Usuario registrado exitosamente. Por favor, verifica tu email.',
      user: {
        id: newUser.id_usuario,
        email: newUser.email,
        nombre: newUser.nombre,
        apellido: newUser.apellido
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error en registro:', error);
    res.status(500).json({ error: 'Error en el registro de usuario' });
  } finally {
    client.release();
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await db.query(
      `SELECT u.*, r.nombre_rol
       FROM Usuarios u
       JOIN Roles r ON u.id_rol = r.id_rol
       WHERE u.email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const user = result.rows[0];

    if (user.bloqueado_hasta && new Date(user.bloqueado_hasta) > new Date()) {
      return res.status(403).json({ error: 'Cuenta bloqueada temporalmente. Intenta más tarde.' });
    }

    if (!user.estado) {
      return res.status(403).json({ error: 'Cuenta desactivada. Contacta al administrador.' });
    }

    const isValidPassword = await comparePassword(password, user.password_hash);

    if (!isValidPassword) {
      const intentos = user.intentos_login + 1;

      if (intentos >= 5) {
        await db.query(
          'UPDATE Usuarios SET intentos_login = $1, bloqueado_hasta = NOW() + INTERVAL \'15 minutes\' WHERE id_usuario = $2',
          [intentos, user.id_usuario]
        );
        return res.status(403).json({ error: 'Cuenta bloqueada por múltiples intentos fallidos' });
      }

      await db.query('UPDATE Usuarios SET intentos_login = $1 WHERE id_usuario = $2', [intentos, user.id_usuario]);
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    await db.query(
      'UPDATE Usuarios SET intentos_login = 0, ultimo_login = NOW(), bloqueado_hasta = NULL WHERE id_usuario = $1',
      [user.id_usuario]
    );

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

    // Redirigir según el rol del usuario
const redirectPath = req.session.user.rol === 'Admin' ? '/dashboard/admin' :
                    req.session.user.rol === 'Terapeuta' ? '/dashboard/therapist' :
                    '/dashboard/patient';

res.redirect(redirectPath);

  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error en el proceso de autenticación' });
  }
};

const logout = (req, res) => {
  res.clearCookie('token');
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Error al cerrar sesión' });
    }
    res.json({ message: 'Sesión cerrada exitosamente' });
  });
};

const verifyEmail = async (req, res) => {
  try {
    const { token } = req.query;

    const result = await db.query(
      'UPDATE Usuarios SET email_verificado = true, fecha_verificacion = NOW(), token_verificacion = NULL WHERE token_verificacion = $1 RETURNING id_usuario, email',
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Token de verificación inválido o expirado' });
    }

    res.json({ message: 'Email verificado exitosamente' });

  } catch (error) {
    console.error('Error en verificación:', error);
    res.status(500).json({ error: 'Error en la verificación del email' });
  }
};

const getCurrentUser = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT u.id_usuario, u.email, u.nombre, u.apellido, u.telefono, u.fecha_nacimiento,
              u.genero, u.direccion, u.foto_perfil, u.email_verificado, r.nombre_rol
       FROM Usuarios u
       JOIN Roles r ON u.id_rol = r.id_rol
       WHERE u.id_usuario = $1`,
      [req.user.id_usuario]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.json({ user: result.rows[0] });

  } catch (error) {
    console.error('Error obteniendo usuario:', error);
    res.status(500).json({ error: 'Error al obtener información del usuario' });
  }
};


// AGREGAR LOS NUEVOS MÉTODOS AL OBJETO DE EXPORTACIÓN
module.exports = {
  register,
  login,
  logout,
  verifyEmail,
  getCurrentUser,
  showRegisterForm: (req, res) => {
    res.render('auth/register', {
      title: 'Registro - MindCare',
      user: null,
      errors: null,
      formData: {}
    });
  },
  showLoginForm: (req, res) => {
    res.render('auth/login', {
      title: 'Iniciar Sesión - MindCare',
      user: null,
      errors: null,
      formData: {}
    });
  }
};
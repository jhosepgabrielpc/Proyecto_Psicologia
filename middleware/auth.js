const jwt = require('jsonwebtoken');
const db = require('../config/database');

const authenticateToken = async (req, res, next) => {
  try {
    const token = req.cookies.token || req.headers['authorization']?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Acceso no autorizado. Token no proporcionado.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const result = await db.query(
      'SELECT u.*, r.nombre_rol FROM Usuarios u JOIN Roles r ON u.id_rol = r.id_rol WHERE u.id_usuario = $1 AND u.estado = true',
      [decoded.id_usuario]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'Usuario no encontrado o desactivado' });
    }

    req.user = result.rows[0];
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expirado. Por favor, inicia sesión nuevamente.' });
    }
    return res.status(403).json({ error: 'Token inválido' });
  }
};

const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    if (!roles.includes(req.user.nombre_rol)) {
      return res.status(403).json({ error: 'No tienes permisos para acceder a este recurso' });
    }

    next();
  };
};

const requireTherapist = (req, res, next) => {
  if (req.user.nombre_rol !== 'Terapeuta' && req.user.nombre_rol !== 'Admin') {
    return res.status(403).json({ error: 'Acceso restringido a terapeutas' });
  }
  next();
};

const requirePatient = (req, res, next) => {
  if (req.user.nombre_rol !== 'Paciente' && req.user.nombre_rol !== 'Admin') {
    return res.status(403).json({ error: 'Acceso restringido a pacientes' });
  }
  next();
};

const requireAdmin = (req, res, next) => {
  if (req.user.nombre_rol !== 'Admin') {
    return res.status(403).json({ error: 'Acceso restringido a administradores' });
  }
  next();
};

module.exports = {
  authenticateToken,
  requireRole,
  requireTherapist,
  requirePatient,
  requireAdmin
};
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

const comparePassword = async (password, hashedPassword) => {
  return bcrypt.compare(password, hashedPassword);
};

const generateToken = (user) => {
  return jwt.sign(
    {
      id_usuario: user.id_usuario,
      email: user.email,
      rol: user.nombre_rol
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );
};

const generateVerificationToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

const generateSessionToken = () => {
  return crypto.randomUUID();
};

const formatDate = (date) => {
  return new Date(date).toLocaleDateString('es-BO', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

const formatDateTime = (date) => {
  return new Date(date).toLocaleString('es-BO', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const calculateAge = (birthDate) => {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }

  return age;
};

const validateBolivianPhone = (phone) => {
  const phoneRegex = /^[67]\d{7}$/;
  return phoneRegex.test(phone);
};

const interpretPHQ9Score = (score) => {
  if (score >= 20) return { nivel: 'Severa', severidad: 'critica', descripcion: 'Depresión severa' };
  if (score >= 15) return { nivel: 'Moderadamente severa', severidad: 'alta', descripcion: 'Depresión moderadamente severa' };
  if (score >= 10) return { nivel: 'Moderada', severidad: 'media', descripcion: 'Depresión moderada' };
  if (score >= 5) return { nivel: 'Leve', severidad: 'baja', descripcion: 'Depresión leve' };
  return { nivel: 'Mínima', severidad: 'baja', descripcion: 'Depresión mínima o ausente' };
};

const interpretGAD7Score = (score) => {
  if (score >= 15) return { nivel: 'Severa', severidad: 'critica', descripcion: 'Ansiedad severa' };
  if (score >= 10) return { nivel: 'Moderada', severidad: 'alta', descripcion: 'Ansiedad moderada' };
  if (score >= 5) return { nivel: 'Leve', severidad: 'media', descripcion: 'Ansiedad leve' };
  return { nivel: 'Mínima', severidad: 'baja', descripcion: 'Ansiedad mínima o ausente' };
};

const checkForCriticalAlert = (scaleType, score) => {
  const PHQ9_CRITICAL = parseInt(process.env.PHQ9_THRESHOLD_CRITICAL) || 20;
  const PHQ9_HIGH = parseInt(process.env.PHQ9_THRESHOLD_HIGH) || 15;
  const GAD7_CRITICAL = parseInt(process.env.GAD7_THRESHOLD_CRITICAL) || 15;
  const GAD7_HIGH = parseInt(process.env.GAD7_THRESHOLD_HIGH) || 10;

  if (scaleType === 'PHQ-9') {
    if (score >= PHQ9_CRITICAL) return 'critica';
    if (score >= PHQ9_HIGH) return 'alta';
  }

  if (scaleType === 'GAD-7') {
    if (score >= GAD7_CRITICAL) return 'critica';
    if (score >= GAD7_HIGH) return 'alta';
  }

  return null;
};

const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  return input.trim().replace(/<script[^>]*>.*?<\/script>/gi, '');
};

module.exports = {
  hashPassword,
  comparePassword,
  generateToken,
  generateVerificationToken,
  generateSessionToken,
  formatDate,
  formatDateTime,
  calculateAge,
  validateBolivianPhone,
  interpretPHQ9Score,
  interpretGAD7Score,
  checkForCriticalAlert,
  sanitizeInput
};
const { body, validationResult } = require('express-validator');

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

const validateRegistration = [
  body('email')
    .isEmail().withMessage('Email debe ser válido')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 8 }).withMessage('La contraseña debe tener al menos 8 caracteres')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('La contraseña debe contener: mayúscula, minúscula, número y carácter especial'),
  body('nombre')
    .trim()
    .isLength({ min: 2 }).withMessage('El nombre debe tener al menos 2 caracteres')
    .matches(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/).withMessage('El nombre solo debe contener letras'),
  body('apellido')
    .trim()
    .isLength({ min: 2 }).withMessage('El apellido debe tener al menos 2 caracteres')
    .matches(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/).withMessage('El apellido solo debe contener letras'),
  body('telefono')
    .optional()
    .matches(/^[67]\d{7}$/).withMessage('Teléfono debe ser formato boliviano (8 dígitos, iniciando con 6 o 7)'),
  body('fecha_nacimiento')
    .optional()
    .isDate().withMessage('Fecha de nacimiento debe ser válida')
    .custom((value) => {
      const birthDate = new Date(value);
      const today = new Date();
      const age = today.getFullYear() - birthDate.getFullYear();
      if (age < 18) {
        throw new Error('Debes tener al menos 18 años');
      }
      return true;
    }),
  handleValidationErrors
];

const validateLogin = [
  body('email').isEmail().withMessage('Email debe ser válido').normalizeEmail(),
  body('password').notEmpty().withMessage('La contraseña es requerida'),
  handleValidationErrors
];

const validateAppointment = [
  body('id_terapeuta').isInt().withMessage('ID del terapeuta es requerido'),
  body('fecha_hora_inicio').isISO8601().withMessage('Fecha y hora de inicio debe ser válida'),
  body('duracion_minutos')
    .isInt({ min: 30 }).withMessage('Duración mínima es 30 minutos'),
  body('motivo_consulta')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Motivo no debe exceder 500 caracteres'),
  handleValidationErrors
];

const validateEmotionalCheckIn = [
  body('valencia_personal')
    .isInt({ min: 1, max: 5 }).withMessage('Valencia debe estar entre 1 y 5'),
  body('activacion_personal')
    .isInt({ min: 1, max: 5 }).withMessage('Activación debe estar entre 1 y 5'),
  body('notas_paciente')
    .optional()
    .trim()
    .isLength({ max: 1000 }).withMessage('Las notas no deben exceder 1000 caracteres'),
  handleValidationErrors
];

const validateMessage = [
  body('mensaje')
    .trim()
    .notEmpty().withMessage('El mensaje no puede estar vacío')
    .isLength({ max: 2000 }).withMessage('El mensaje no debe exceder 2000 caracteres'),
  handleValidationErrors
];

module.exports = {
  validateRegistration,
  validateLogin,
  validateAppointment,
  validateEmotionalCheckIn,
  validateMessage,
  handleValidationErrors
};
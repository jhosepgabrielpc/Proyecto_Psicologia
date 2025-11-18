const { body } = require('express-validator');

// --- VALIDACIONES DE AUTENTICACIÓN ---

const validateRegistration = [
    body('nombre')
        .trim()
        .notEmpty().withMessage('El nombre es obligatorio.')
        .matches(/^[a-zA-ZÁÉÍÓÚáéíóúñÑ\s]+$/).withMessage('El nombre solo debe contener letras.')
        .isLength({ min: 2 }).withMessage('El nombre es muy corto.'),
    body('apellido')
        .trim()
        .notEmpty().withMessage('El apellido es obligatorio.')
        .matches(/^[a-zA-ZÁÉÍÓÚáéíóúñÑ\s]+$/).withMessage('El apellido solo debe contener letras.')
        .isLength({ min: 2 }).withMessage('El apellido es muy corto.'),
    body('telefono')
        .optional({ checkFalsy: true })
        .matches(/^[67]\d{7}$/).withMessage('El teléfono debe tener 8 dígitos y empezar con 6 o 7.'),
    body('fecha_nacimiento')
        .optional({ checkFalsy: true })
        .isDate().withMessage('Fecha inválida.')
        .custom((value) => {
            const birthDate = new Date(value);
            const today = new Date();
            let age = today.getFullYear() - birthDate.getFullYear();
            const m = today.getMonth() - birthDate.getMonth();
            if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
                age--;
            }
            if (age < 18) {
                throw new Error('Debes ser mayor de 18 años.');
            }
            return true;
        }),
    body('email')
        .trim()
        .notEmpty().withMessage('El email es obligatorio.')
        .isEmail().withMessage('Email inválido.')
        .normalizeEmail(),
    body('password')
        .isLength({ min: 8 }).withMessage('Mínimo 8 caracteres.')
        .matches(/[A-Z]/).withMessage('Falta mayúscula.')
        .matches(/[a-z]/).withMessage('Falta minúscula.')
        .matches(/[0-9]/).withMessage('Falta número.')
        .matches(/[\W_]/).withMessage('Falta símbolo especial.')
];

const validateLogin = [
    body('email').isEmail().withMessage('Email inválido.').normalizeEmail(),
    body('password').notEmpty().withMessage('La contraseña es obligatoria.')
];

// --- VALIDACIONES DE OTROS MÓDULOS (RESTITUIDAS PARA EVITAR CRASH) ---

const validateAppointment = [
    body('id_terapeuta').isInt().withMessage('ID del terapeuta es requerido'),
    body('fecha_hora_inicio').isISO8601().withMessage('Fecha válida requerida'),
    body('duracion_minutos').isInt({ min: 30 }).withMessage('Mínimo 30 minutos'),
    body('motivo_consulta').optional().trim().isLength({ max: 500 })
];

const validateEmotionalCheckIn = [
    body('valencia_personal').isInt({ min: 1, max: 5 }),
    body('activacion_personal').isInt({ min: 1, max: 5 }),
    body('notas_paciente').optional().trim().isLength({ max: 1000 })
];

const validateMessage = [
    body('mensaje')
        .trim()
        .notEmpty().withMessage('El mensaje no puede estar vacío')
        .isLength({ max: 2000 }).withMessage('Máximo 2000 caracteres')
];

module.exports = {
    validateRegistration,
    validateLogin,
    validateAppointment,
    validateEmotionalCheckIn,
    validateMessage
};
const { body } = require('express-validator');

// ========================================================
// VALIDACIONES DE AUTENTICACIÓN
// ========================================================

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
        .matches(/^[67]\d{7}$/)
        .withMessage('El teléfono debe tener 8 dígitos y empezar con 6 o 7.'),
    body('fecha_nacimiento')
        .optional({ checkFalsy: true })
        .isDate()
        .withMessage('Fecha inválida.')
        .custom(value => {
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
        .matches(/[A-Z]/).withMessage('Debe incluir al menos una mayúscula.')
        .matches(/[a-z]/).withMessage('Debe incluir al menos una minúscula.')
        .matches(/[0-9]/).withMessage('Debe incluir al menos un número.')
        .matches(/[\W_]/).withMessage('Debe incluir al menos un símbolo especial.')
];

const validateLogin = [
    body('email')
        .isEmail().withMessage('Email inválido.')
        .normalizeEmail(),
    body('password')
        .notEmpty().withMessage('La contraseña es obligatoria.')
];

// ========================================================
// VALIDACIÓN DE CITAS (NUEVO FLUJO + LEGACY COMPATIBLE)
// ========================================================

/**
 * Este validador funciona para:
 *  - Nuevo formulario del dashboard:
 *      - id_paciente, id_terapeuta, fecha, hora, duracion, modalidad, notas
 *  - API antigua:
 *      - id_paciente, id_terapeuta, fecha_hora_inicio, duracion_minutos, motivo_consulta
 *
 * La lógica de negocio fina (fecha en el pasado, solapamientos, etc.)
 * la resuelve el appointmentController.
 */
const validateAppointment = [
    // Terapeuta siempre requerido
    body('id_terapeuta')
        .notEmpty().withMessage('El terapeuta es obligatorio.')
        .bail()
        .isInt().withMessage('ID del terapeuta inválido.'),

    // Paciente puede venir vacío en algunos flujos (Paciente se sobreescribe en backend)
    body('id_paciente')
        .optional({ checkFalsy: true })
        .isInt().withMessage('ID del paciente inválido.'),

    // --- NUEVO FORMULARIO DASHBOARD ---
    body('fecha')
        .optional({ checkFalsy: true })
        .isISO8601().withMessage('La fecha de la cita no es válida (formato esperado YYYY-MM-DD).'),

    body('hora')
        .optional({ checkFalsy: true })
        .matches(/^\d{2}:\d{2}$/)
        .withMessage('La hora debe tener formato HH:MM.'),

    body('duracion')
        .optional({ checkFalsy: true })
        .isInt({ min: 15, max: 180 })
        .withMessage('La duración debe estar entre 15 y 180 minutos.'),

    body('modalidad')
        .optional({ checkFalsy: true })
        .isIn(['Virtual', 'Presencial'])
        .withMessage('La modalidad debe ser "Virtual" o "Presencial".'),

    body('notas')
        .optional({ checkFalsy: true })
        .trim()
        .isLength({ max: 500 })
        .withMessage('Las notas no pueden superar los 500 caracteres.'),

    // --- API LEGACY ---
    body('fecha_hora_inicio')
        .optional({ checkFalsy: true })
        .isISO8601()
        .withMessage('fecha_hora_inicio debe ser una fecha/hora válida.'),

    body('duracion_minutos')
        .optional({ checkFalsy: true })
        .isInt({ min: 15, max: 180 })
        .withMessage('duracion_minutos debe estar entre 15 y 180 minutos.'),

    body('motivo_consulta')
        .optional({ checkFalsy: true })
        .trim()
        .isLength({ max: 500 })
        .withMessage('motivo_consulta no puede superar los 500 caracteres.')
];

// ========================================================
// OTROS MÓDULOS
// ========================================================

const validateEmotionalCheckIn = [
    body('valencia_personal')
        .isInt({ min: 1, max: 5 })
        .withMessage('La valencia debe estar entre 1 y 5.'),
    body('activacion_personal')
        .isInt({ min: 1, max: 5 })
        .withMessage('La activación debe estar entre 1 y 5.'),
    body('notas_paciente')
        .optional({ checkFalsy: true })
        .trim()
        .isLength({ max: 1000 })
        .withMessage('Las notas no pueden superar los 1000 caracteres.')
];

const validateMessage = [
    body('mensaje')
        .trim()
        .notEmpty().withMessage('El mensaje no puede estar vacío.')
        .isLength({ max: 2000 })
        .withMessage('Máximo 2000 caracteres en el mensaje.')
];

module.exports = {
    validateRegistration,
    validateLogin,
    validateAppointment,
    validateEmotionalCheckIn,
    validateMessage
};

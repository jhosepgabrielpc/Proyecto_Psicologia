-- =====================================
-- DATOS DE EJEMPLO PARA MINDCARE
-- =====================================

-- Insertar Roles
INSERT INTO Roles (nombre_rol, descripcion, nivel_acceso) VALUES
('Admin', 'Administrador del sistema', 3),
('Terapeuta', 'Profesional de salud mental', 2),
('Paciente', 'Usuario paciente', 1);

-- Insertar Especialidades
INSERT INTO Especialidades (nombre_especialidad, descripcion) VALUES
('Psicología Clínica', 'Diagnóstico y tratamiento de trastornos mentales'),
('Terapia Cognitivo-Conductual', 'Enfoque en pensamientos y comportamientos'),
('Psicoanálisis', 'Enfoque psicodinámico'),
('Terapia Familiar', 'Tratamiento de dinámicas familiares'),
('Psicología Infantil', 'Especialización en niños y adolescentes');

-- Insertar Emociones (Modelo Russell)
INSERT INTO Emociones_Modelo (nombre, valencia, activacion, descripcion, color_hex, icono) VALUES
('Feliz', 5, 4, 'Estado de alegría y satisfacción', '#FFD700', 'smile'),
('Emocionado', 5, 5, 'Alta energía positiva', '#FF6B6B', 'laugh-beam'),
('Tranquilo', 4, 2, 'Estado de calma y paz', '#4ECDC4', 'smile-beam'),
('Relajado', 4, 1, 'Muy bajo en activación, positivo', '#95E1D3', 'grin'),
('Ansioso', 2, 5, 'Alta activación negativa', '#FF8C42', 'frown-open'),
('Triste', 2, 2, 'Bajo ánimo, poca energía', '#6C5CE7', 'sad-tear'),
('Enojado', 1, 5, 'Activación alta negativa', '#E74C3C', 'angry'),
('Aburrido', 3, 1, 'Neutral, baja activación', '#95A5A6', 'meh');

-- Insertar Tipos de Escalas
INSERT INTO Tipos_Escala (nombre_escala, descripcion, puntuacion_minima, puntuacion_maxima, interpretaciones) VALUES
('PHQ-9', 'Patient Health Questionnaire - Evaluación de depresión', 0, 27,
 '{"0-4": "Mínima", "5-9": "Leve", "10-14": "Moderada", "15-19": "Moderadamente severa", "20-27": "Severa"}'::jsonb),
('GAD-7', 'Generalized Anxiety Disorder - Evaluación de ansiedad', 0, 21,
 '{"0-4": "Mínima", "5-9": "Leve", "10-14": "Moderada", "15-21": "Severa"}'::jsonb);

-- Insertar Estados de Cita
INSERT INTO Estados_Cita (nombre_estado, color, es_activo) VALUES
('Programada', '#3498db', true),
('Confirmada', '#2ecc71', true),
('En Progreso', '#f39c12', true),
('Completada', '#27ae60', false),
('Cancelada', '#e74c3c', false),
('No asistió', '#95a5a6', false);

-- Insertar Tipos de Notificación
INSERT INTO Tipos_Notificacion (nombre_tipo, plantilla_mensaje, canal, prioridad) VALUES
('Cita Programada', 'Tienes una nueva cita programada para {fecha}', 'email', 2),
('Recordatorio Cita', 'Recuerda tu cita de terapia mañana a las {hora}', 'email', 3),
('Alerta Clínica', 'Se ha generado una alerta clínica para el paciente {paciente}', 'interno', 4),
('Check-in Pendiente', 'No olvides completar tu check-in emocional de hoy', 'push', 1),
('Escala Pendiente', 'Tienes una escala {escala} pendiente de completar', 'email', 2),
('Mensaje Nuevo', 'Tienes un nuevo mensaje de {remitente}', 'interno', 2);

-- Insertar Usuario Admin (password: Admin123!)
INSERT INTO Usuarios (id_rol, email, password_hash, nombre, apellido, telefono, estado, email_verificado)
VALUES (
    1,
    'admin@mindcare.bo',
    '$2a$10$YourHashedPasswordHere',
    'Administrador',
    'Sistema',
    '70000000',
    true,
    true
);

-- Insertar Usuario Terapeuta de Ejemplo (password: Terapeuta123!)
INSERT INTO Usuarios (id_rol, email, password_hash, nombre, apellido, telefono, fecha_nacimiento, genero, estado, email_verificado)
VALUES (
    2,
    'dra.martinez@mindcare.bo',
    '$2a$10$YourHashedPasswordHere',
    'María',
    'Martínez',
    '70111111',
    '1985-06-15',
    'Femenino',
    true,
    true
);

-- Insertar Terapeuta
INSERT INTO Terapeutas (id_usuario, id_especialidad, licencia_profesional, institucion_licencia, experiencia_anios, biografia, enfoque_terapeutico, tarifa_consulta, estado_verificacion)
VALUES (
    2,
    2,
    'PSI-2024-001',
    'Colegio de Psicólogos de Bolivia',
    8,
    'Psicóloga clínica especializada en terapia cognitivo-conductual con más de 8 años de experiencia trabajando con adultos y adolescentes.',
    'Terapia Cognitivo-Conductual, Mindfulness',
    200.00,
    'aprobado'
);

-- Insertar Usuario Paciente de Ejemplo (password: Paciente123!)
INSERT INTO Usuarios (id_rol, email, password_hash, nombre, apellido, telefono, fecha_nacimiento, genero, estado, email_verificado)
VALUES (
    3,
    'juan.perez@email.com',
    '$2a$10$YourHashedPasswordHere',
    'Juan',
    'Pérez',
    '70222222',
    '1995-03-20',
    'Masculino',
    true,
    true
);

-- Insertar Paciente
INSERT INTO Pacientes (id_usuario, id_terapeuta_principal, contacto_emergencia_nombre, contacto_emergencia_telefono, relacion_contacto_emergencia, estado_tratamiento, fecha_inicio_tratamiento)
VALUES (
    3,
    1,
    'María Pérez',
    '70333333',
    'Madre',
    'activo',
    CURRENT_DATE
);

-- Insertar Horarios para el Terapeuta (Lunes a Viernes, 9:00 - 17:00)
INSERT INTO Horarios_Terapeutas (id_terapeuta, dia_semana, hora_inicio, hora_fin, tipo_horario, disponible)
VALUES
(1, 1, '09:00', '17:00', 'regular', true),
(1, 2, '09:00', '17:00', 'regular', true),
(1, 3, '09:00', '17:00', 'regular', true),
(1, 4, '09:00', '17:00', 'regular', true),
(1, 5, '09:00', '17:00', 'regular', true);

-- Insertar Conversación entre Paciente y Terapeuta
INSERT INTO Conversaciones (id_paciente, id_terapeuta, fecha_creacion, estado)
VALUES (1, 1, CURRENT_TIMESTAMP, 'activa');

-- Nota: Los passwords en este archivo son placeholders.
-- En producción, estos deben ser generados con bcrypt correctamente.
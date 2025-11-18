-- =====================================
-- MINDCARE DATABASE SCHEMA
-- Sistema de Teleterapia - PostgreSQL/SQL Server Compatible
-- =====================================

-- =====================================
-- 1. TABLAS MAESTRAS Y CATÁLOGOS
-- =====================================

CREATE TABLE Roles (
    id_rol SERIAL PRIMARY KEY,
    nombre_rol VARCHAR(50) NOT NULL UNIQUE,
    descripcion TEXT,
    nivel_acceso INT NOT NULL DEFAULT 1,
    estado BOOLEAN DEFAULT TRUE
);

CREATE TABLE Especialidades (
    id_especialidad SERIAL PRIMARY KEY,
    nombre_especialidad VARCHAR(100) NOT NULL UNIQUE,
    descripcion TEXT,
    estado BOOLEAN DEFAULT TRUE
);

CREATE TABLE Emociones_Modelo (
    id_emocion SERIAL PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE,
    valencia INT NOT NULL CHECK (valencia BETWEEN 1 AND 5),
    activacion INT NOT NULL CHECK (activacion BETWEEN 1 AND 5),
    descripcion TEXT,
    color_hex VARCHAR(7),
    icono VARCHAR(50)
);

CREATE TABLE Tipos_Escala (
    id_tipo_escala SERIAL PRIMARY KEY,
    nombre_escala VARCHAR(50) NOT NULL UNIQUE,
    descripcion TEXT,
    puntuacion_minima INT NOT NULL,
    puntuacion_maxima INT NOT NULL,
    interpretaciones JSONB
);

CREATE TABLE Estados_Cita (
    id_estado SERIAL PRIMARY KEY,
    nombre_estado VARCHAR(30) NOT NULL UNIQUE,
    color VARCHAR(7),
    es_activo BOOLEAN DEFAULT TRUE
);

CREATE TABLE Tipos_Notificacion (
    id_tipo_notificacion SERIAL PRIMARY KEY,
    nombre_tipo VARCHAR(50) NOT NULL UNIQUE,
    plantilla_mensaje TEXT,
    canal VARCHAR(20) CHECK (canal IN ('email', 'sms', 'push', 'interno')),
    prioridad INT DEFAULT 1
);

-- =====================================
-- 2. MÓDULO A: GESTIÓN DE USUARIOS (Fabio)
-- =====================================

CREATE TABLE Usuarios (
    id_usuario SERIAL PRIMARY KEY,
    id_rol INT NOT NULL REFERENCES Roles(id_rol),
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    apellido VARCHAR(100) NOT NULL,
    telefono VARCHAR(15),
    fecha_nacimiento DATE,
    genero VARCHAR(20),
    direccion TEXT,
    foto_perfil VARCHAR(255),
    estado BOOLEAN DEFAULT TRUE,
    email_verificado BOOLEAN DEFAULT FALSE,
    token_verificacion VARCHAR(100),
    fecha_verificacion TIMESTAMP,
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ultimo_login TIMESTAMP,
    intentos_login INT DEFAULT 0,
    bloqueado_hasta TIMESTAMP
);

CREATE TABLE Terapeutas (
    id_terapeuta SERIAL PRIMARY KEY,
    id_usuario INT NOT NULL UNIQUE REFERENCES Usuarios(id_usuario),
    id_especialidad INT REFERENCES Especialidades(id_especialidad),
    licencia_profesional VARCHAR(50) UNIQUE NOT NULL,
    institucion_licencia VARCHAR(100),
    experiencia_anios INT DEFAULT 0,
    biografia TEXT,
    enfoque_terapeutico TEXT,
    tarifa_consulta DECIMAL(10,2),
    calificacion_promedio DECIMAL(3,2) DEFAULT 0,
    total_valoraciones INT DEFAULT 0,
    estado_verificacion VARCHAR(20) DEFAULT 'pendiente' CHECK (estado_verificacion IN ('pendiente', 'aprobado', 'rechazado')),
    motivo_rechazo TEXT,
    fecha_verificacion TIMESTAMP
);

CREATE TABLE Pacientes (
    id_paciente SERIAL PRIMARY KEY,
    id_usuario INT NOT NULL UNIQUE REFERENCES Usuarios(id_usuario),
    id_terapeuta_principal INT REFERENCES Terapeutas(id_terapeuta),
    contacto_emergencia_nombre VARCHAR(100),
    contacto_emergencia_telefono VARCHAR(15),
    relacion_contacto_emergencia VARCHAR(50),
    antecedentes_medicos TEXT,
    alergias TEXT,
    medicamentos_actuales TEXT,
    estado_tratamiento VARCHAR(20) DEFAULT 'activo' CHECK (estado_tratamiento IN ('activo', 'inactivo', 'finalizado', 'pausado')),
    fecha_inicio_tratamiento DATE,
    fecha_fin_tratamiento DATE,
    motivo_finalizacion TEXT
);

CREATE TABLE Asignaciones_Terapeuta (
    id_asignacion SERIAL PRIMARY KEY,
    id_paciente INT NOT NULL REFERENCES Pacientes(id_paciente),
    id_terapeuta INT NOT NULL REFERENCES Terapeutas(id_terapeuta),
    fecha_asignacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_fin TIMESTAMP,
    motivo_fin TEXT,
    estado VARCHAR(20) DEFAULT 'activa' CHECK (estado IN ('activa', 'inactiva', 'transferida'))
);

CREATE TABLE Consentimientos (
    id_consentimiento SERIAL PRIMARY KEY,
    id_paciente INT NOT NULL REFERENCES Pacientes(id_paciente),
    id_terapeuta INT NOT NULL REFERENCES Terapeutas(id_terapeuta),
    tipo_consentimiento VARCHAR(50) NOT NULL,
    version VARCHAR(20) NOT NULL,
    contenido TEXT NOT NULL,
    firma_digital TEXT,
    ip_firma VARCHAR(45),
    fecha_firma TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    vigente BOOLEAN DEFAULT TRUE,
    fecha_revocacion TIMESTAMP
);

-- =====================================
-- 3. MÓDULO B: COMUNICACIÓN Y ALERTAS (Jimmy)
-- =====================================

CREATE TABLE Conversaciones (
    id_conversacion SERIAL PRIMARY KEY,
    id_paciente INT NOT NULL REFERENCES Pacientes(id_paciente),
    id_terapeuta INT NOT NULL REFERENCES Terapeutas(id_terapeuta),
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ultimo_mensaje TIMESTAMP,
    estado VARCHAR(20) DEFAULT 'activa' CHECK (estado IN ('activa', 'archivada', 'cerrada')),
    etiqueta VARCHAR(50)
);

CREATE TABLE Mensajes_Seguros (
    id_mensaje SERIAL PRIMARY KEY,
    id_conversacion INT NOT NULL REFERENCES Conversaciones(id_conversacion),
    id_remitente INT NOT NULL REFERENCES Usuarios(id_usuario),
    mensaje TEXT NOT NULL,
    tipo_mensaje VARCHAR(20) DEFAULT 'texto' CHECK (tipo_mensaje IN ('texto', 'archivo', 'imagen', 'audio')),
    url_archivo VARCHAR(255),
    leido BOOLEAN DEFAULT FALSE,
    fecha_envio TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_lectura TIMESTAMP,
    editado BOOLEAN DEFAULT FALSE,
    fecha_edicion TIMESTAMP
);

CREATE TABLE Notificaciones (
    id_notificacion SERIAL PRIMARY KEY,
    id_usuario INT NOT NULL REFERENCES Usuarios(id_usuario),
    id_tipo_notificacion INT REFERENCES Tipos_Notificacion(id_tipo_notificacion),
    titulo VARCHAR(255) NOT NULL,
    mensaje TEXT NOT NULL,
    datos_adicionales JSONB,
    leida BOOLEAN DEFAULT FALSE,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_lectura TIMESTAMP,
    fecha_envio TIMESTAMP,
    estado_envio VARCHAR(20) DEFAULT 'pendiente' CHECK (estado_envio IN ('pendiente', 'enviada', 'fallo'))
);

CREATE TABLE Alertas_Clinicas (
    id_alerta SERIAL PRIMARY KEY,
    id_paciente INT NOT NULL REFERENCES Pacientes(id_paciente),
    id_terapeuta INT NOT NULL REFERENCES Terapeutas(id_terapeuta),
    tipo_alerta VARCHAR(50) NOT NULL,
    severidad VARCHAR(20) CHECK (severidad IN ('baja', 'media', 'alta', 'critica')),
    descripcion TEXT NOT NULL,
    datos_origen JSONB,
    leida BOOLEAN DEFAULT FALSE,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_lectura TIMESTAMP,
    accion_tomada TEXT,
    estado VARCHAR(20) DEFAULT 'activa' CHECK (estado IN ('activa', 'resuelta', 'archivada'))
);

CREATE TABLE Tickets_Soporte (
    id_ticket SERIAL PRIMARY KEY,
    id_usuario INT NOT NULL REFERENCES Usuarios(id_usuario),
    titulo VARCHAR(255) NOT NULL,
    descripcion TEXT NOT NULL,
    categoria VARCHAR(50) NOT NULL,
    prioridad VARCHAR(20) DEFAULT 'media' CHECK (prioridad IN ('baja', 'media', 'alta', 'urgente')),
    estado VARCHAR(20) DEFAULT 'abierto' CHECK (estado IN ('abierto', 'en_progreso', 'resuelto', 'cerrado')),
    agente_asignado INT REFERENCES Usuarios(id_usuario),
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_cierre TIMESTAMP
);

-- =====================================
-- 4. MÓDULO C: MONITOREO EMOCIONAL (Jhosep)
-- =====================================

CREATE TABLE Checkins_Emocionales (
    id_checkin SERIAL PRIMARY KEY,
    id_paciente INT NOT NULL REFERENCES Pacientes(id_paciente),
    id_emocion INT REFERENCES Emociones_Modelo(id_emocion),
    valencia_personal INT CHECK (valencia_personal BETWEEN 1 AND 5),
    activacion_personal INT CHECK (activacion_personal BETWEEN 1 AND 5),
    notas_paciente TEXT,
    factores_contexto TEXT,
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ubicacion JSONB,
    estado_animo_personalizado VARCHAR(100)
);

CREATE TABLE Escalas_Asignadas (
    id_asignacion SERIAL PRIMARY KEY,
    id_paciente INT NOT NULL REFERENCES Pacientes(id_paciente),
    id_tipo_escala INT NOT NULL REFERENCES Tipos_Escala(id_tipo_escala),
    id_terapeuta_asignador INT NOT NULL REFERENCES Terapeutas(id_terapeuta),
    fecha_asignacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_limite TIMESTAMP,
    frecuencia_dias INT,
    estado VARCHAR(20) DEFAULT 'activa' CHECK (estado IN ('activa', 'completada', 'vencida', 'cancelada')),
    instrucciones_especiales TEXT
);

CREATE TABLE Resultados_Escalas (
    id_resultado SERIAL PRIMARY KEY,
    id_asignacion INT NOT NULL REFERENCES Escalas_Asignadas(id_asignacion),
    puntuacion_total INT NOT NULL,
    respuestas JSONB NOT NULL,
    interpretacion_automatica VARCHAR(100),
    observaciones_paciente TEXT,
    tiempo_completacion_minutos INT,
    fecha_completacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    validez BOOLEAN DEFAULT TRUE
);

CREATE TABLE Alertas_Automaticas (
    id_alerta_auto SERIAL PRIMARY KEY,
    id_paciente INT NOT NULL REFERENCES Pacientes(id_paciente),
    tipo_alerta VARCHAR(50) NOT NULL,
    fuente VARCHAR(50) NOT NULL,
    datos_deteccion JSONB NOT NULL,
    regla_ejecutada VARCHAR(100),
    severidad VARCHAR(20) CHECK (severidad IN ('baja', 'media', 'alta', 'critica')),
    fecha_deteccion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    procesada BOOLEAN DEFAULT FALSE
);

CREATE TABLE Reportes_Diarios (
    id_reporte_diario SERIAL PRIMARY KEY,
    id_paciente INT NOT NULL REFERENCES Pacientes(id_paciente),
    fecha_reporte DATE NOT NULL,
    resumen_emocional JSONB,
    tendencia_semanal VARCHAR(20),
    alertas_generadas INT DEFAULT 0,
    completado BOOLEAN DEFAULT FALSE,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================
-- 5. MÓDULO D: TELETERAPÍA (Alan)
-- =====================================

CREATE TABLE Horarios_Terapeutas (
    id_horario SERIAL PRIMARY KEY,
    id_terapeuta INT NOT NULL REFERENCES Terapeutas(id_terapeuta),
    dia_semana INT NOT NULL CHECK (dia_semana BETWEEN 1 AND 7),
    hora_inicio TIME NOT NULL,
    hora_fin TIME NOT NULL,
    tipo_horario VARCHAR(20) DEFAULT 'regular' CHECK (tipo_horario IN ('regular', 'extra', 'bloqueado')),
    disponible BOOLEAN DEFAULT TRUE,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE Bloques_Horarios (
    id_bloque SERIAL PRIMARY KEY,
    id_terapeuta INT NOT NULL REFERENCES Terapeutas(id_terapeuta),
    fecha DATE NOT NULL,
    hora_inicio TIME NOT NULL,
    hora_fin TIME NOT NULL,
    estado VARCHAR(20) DEFAULT 'disponible' CHECK (estado IN ('disponible', 'reservado', 'bloqueado', 'ocupado')),
    tipo_bloque VARCHAR(20) DEFAULT 'consulta' CHECK (tipo_bloque IN ('consulta', 'administrativo', 'descanso')),
    motivo_bloqueo TEXT
);

CREATE TABLE Citas (
    id_cita SERIAL PRIMARY KEY,
    id_paciente INT NOT NULL REFERENCES Pacientes(id_paciente),
    id_terapeuta INT NOT NULL REFERENCES Terapeutas(id_terapeuta),
    id_bloque_horario INT REFERENCES Bloques_Horarios(id_bloque),
    fecha_hora_inicio TIMESTAMP NOT NULL,
    fecha_hora_fin TIMESTAMP NOT NULL,
    duracion_minutos INT NOT NULL,
    tipo_consulta VARCHAR(20) DEFAULT 'virtual' CHECK (tipo_consulta IN ('virtual', 'presencial')),
    modalidad VARCHAR(20) DEFAULT 'videollamada' CHECK (modalidad IN ('videollamada', 'audio', 'chat')),
    estado VARCHAR(20) DEFAULT 'programada' CHECK (estado IN ('programada', 'confirmada', 'en_progreso', 'completada', 'cancelada', 'no_asistio')),
    motivo_consulta TEXT,
    enlace_sesion VARCHAR(500),
    token_sesion VARCHAR(100),
    recordatorio_enviado BOOLEAN DEFAULT FALSE,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE Sesiones_Terapia (
    id_sesion SERIAL PRIMARY KEY,
    id_cita INT NOT NULL UNIQUE REFERENCES Citas(id_cita),
    notas_terapeuta TEXT,
    objetivos_trabajados TEXT,
    tareas_asignadas TEXT,
    duracion_real_minutos INT,
    calidad_sesion VARCHAR(20) CHECK (calidad_sesion IN ('excelente', 'buena', 'regular', 'mala')),
    incidencias TEXT,
    satisfaccion_paciente INT CHECK (satisfaccion_paciente BETWEEN 1 AND 5),
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE Seguimientos_Sesion (
    id_seguimiento SERIAL PRIMARY KEY,
    id_sesion INT NOT NULL REFERENCES Sesiones_Terapia(id_sesion),
    tipo_seguimiento VARCHAR(50) NOT NULL,
    descripcion TEXT NOT NULL,
    fecha_compromiso DATE,
    completado BOOLEAN DEFAULT FALSE,
    fecha_completacion TIMESTAMP,
    observaciones TEXT
);

-- =====================================
-- 6. MÓDULO E: REPORTES & ANALÍTICA (Renan)
-- =====================================

CREATE TABLE Historial_Clinico (
    id_historial SERIAL PRIMARY KEY,
    id_paciente INT NOT NULL REFERENCES Pacientes(id_paciente),
    id_terapeuta INT NOT NULL REFERENCES Terapeutas(id_terapeuta),
    tipo_registro VARCHAR(50) NOT NULL,
    titulo VARCHAR(255) NOT NULL,
    contenido TEXT NOT NULL,
    datos_clinicos JSONB,
    privacidad VARCHAR(20) DEFAULT 'normal' CHECK (privacidad IN ('alta', 'normal', 'baja')),
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE Reportes_Progreso (
    id_reporte SERIAL PRIMARY KEY,
    id_paciente INT NOT NULL REFERENCES Pacientes(id_paciente),
    id_terapeuta INT NOT NULL REFERENCES Terapeutas(id_terapeuta),
    tipo_reporte VARCHAR(50) NOT NULL CHECK (tipo_reporte IN ('semanal', 'mensual', 'trimestral', 'final')),
    periodo_inicio DATE NOT NULL,
    periodo_fin DATE NOT NULL,
    resumen_evolucion TEXT,
    metricas_principales JSONB,
    objetivos_cumplidos JSONB,
    recomendaciones TEXT,
    firmado_por INT REFERENCES Usuarios(id_usuario),
    fecha_firma TIMESTAMP,
    fecha_generacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE Analytics_Plataforma (
    id_analytics SERIAL PRIMARY KEY,
    fecha DATE NOT NULL,
    metricas JSONB NOT NULL,
    tipo_analytics VARCHAR(50) CHECK (tipo_analytics IN ('diario', 'semanal', 'mensual')),
    fecha_calculo TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE Auditoria_Sistema (
    id_auditoria SERIAL PRIMARY KEY,
    id_usuario INT REFERENCES Usuarios(id_usuario),
    tipo_evento VARCHAR(50) NOT NULL,
    descripcion TEXT NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    datos_antes JSONB,
    datos_despues JSONB,
    fecha_evento TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================
-- ÍNDICES PARA OPTIMIZACIÓN
-- =====================================

CREATE INDEX idx_usuarios_email ON Usuarios(email);
CREATE INDEX idx_usuarios_rol ON Usuarios(id_rol);
CREATE INDEX idx_pacientes_terapeuta ON Pacientes(id_terapeuta_principal);
CREATE INDEX idx_citas_fecha ON Citas(fecha_hora_inicio);
CREATE INDEX idx_citas_estado ON Citas(estado);
CREATE INDEX idx_mensajes_conversacion ON Mensajes_Seguros(id_conversacion);
CREATE INDEX idx_checkins_paciente_fecha ON Checkins_Emocionales(id_paciente, fecha_registro);
CREATE INDEX idx_alertas_paciente ON Alertas_Clinicas(id_paciente, estado);
CREATE INDEX idx_notificaciones_usuario ON Notificaciones(id_usuario, leida);
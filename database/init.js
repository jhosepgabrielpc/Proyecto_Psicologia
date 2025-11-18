const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'mindcare_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
});

async function initializeDatabase() {
  const client = await pool.connect();

  try {
    console.log('🔄 Iniciando configuración de base de datos...');

    const schemaSQL = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await client.query(schemaSQL);
    console.log('✓ Schema creado exitosamente');

    const adminPassword = await bcrypt.hash('Admin123!', 10);
    const therapistPassword = await bcrypt.hash('Terapeuta123!', 10);
    const patientPassword = await bcrypt.hash('Paciente123!', 10);

    await client.query(`
      -- Insertar Roles
      INSERT INTO Roles (nombre_rol, descripcion, nivel_acceso) VALUES
      ('Admin', 'Administrador del sistema', 3),
      ('Terapeuta', 'Profesional de salud mental', 2),
      ('Paciente', 'Usuario paciente', 1)
      ON CONFLICT (nombre_rol) DO NOTHING;

      -- Insertar Especialidades
      INSERT INTO Especialidades (nombre_especialidad, descripcion) VALUES
      ('Psicología Clínica', 'Diagnóstico y tratamiento de trastornos mentales'),
      ('Terapia Cognitivo-Conductual', 'Enfoque en pensamientos y comportamientos'),
      ('Psicoanálisis', 'Enfoque psicodinámico'),
      ('Terapia Familiar', 'Tratamiento de dinámicas familiares'),
      ('Psicología Infantil', 'Especialización en niños y adolescentes')
      ON CONFLICT (nombre_especialidad) DO NOTHING;

      -- Insertar Emociones
      INSERT INTO Emociones_Modelo (nombre, valencia, activacion, descripcion, color_hex, icono) VALUES
      ('Feliz', 5, 4, 'Estado de alegría y satisfacción', '#FFD700', 'smile'),
      ('Emocionado', 5, 5, 'Alta energía positiva', '#FF6B6B', 'laugh-beam'),
      ('Tranquilo', 4, 2, 'Estado de calma y paz', '#4ECDC4', 'smile-beam'),
      ('Relajado', 4, 1, 'Muy bajo en activación, positivo', '#95E1D3', 'grin'),
      ('Ansioso', 2, 5, 'Alta activación negativa', '#FF8C42', 'frown-open'),
      ('Triste', 2, 2, 'Bajo ánimo, poca energía', '#6C5CE7', 'sad-tear'),
      ('Enojado', 1, 5, 'Activación alta negativa', '#E74C3C', 'angry'),
      ('Aburrido', 3, 1, 'Neutral, baja activación', '#95A5A6', 'meh')
      ON CONFLICT (nombre) DO NOTHING;

      -- Insertar Tipos de Escalas
      INSERT INTO Tipos_Escala (nombre_escala, descripcion, puntuacion_minima, puntuacion_maxima, interpretaciones) VALUES
      ('PHQ-9', 'Patient Health Questionnaire - Evaluación de depresión', 0, 27,
       '{"0-4": "Mínima", "5-9": "Leve", "10-14": "Moderada", "15-19": "Moderadamente severa", "20-27": "Severa"}'::jsonb),
      ('GAD-7', 'Generalized Anxiety Disorder - Evaluación de ansiedad', 0, 21,
       '{"0-4": "Mínima", "5-9": "Leve", "10-14": "Moderada", "15-21": "Severa"}'::jsonb)
      ON CONFLICT (nombre_escala) DO NOTHING;
    `);

    await client.query(
      `INSERT INTO Usuarios (id_rol, email, password_hash, nombre, apellido, telefono, estado, email_verificado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (email) DO NOTHING`,
      [1, 'admin@mindcare.bo', adminPassword, 'Administrador', 'Sistema', '70000000', true, true]
    );

    await client.query(
      `INSERT INTO Usuarios (id_rol, email, password_hash, nombre, apellido, telefono, fecha_nacimiento, genero, estado, email_verificado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (email) DO NOTHING`,
      [2, 'dra.martinez@mindcare.bo', therapistPassword, 'María', 'Martínez', '70111111', '1985-06-15', 'Femenino', true, true]
    );

    const therapistResult = await client.query('SELECT id_usuario FROM Usuarios WHERE email = $1', ['dra.martinez@mindcare.bo']);
    if (therapistResult.rows.length > 0) {
      await client.query(
        `INSERT INTO Terapeutas (id_usuario, id_especialidad, licencia_profesional, institucion_licencia, experiencia_anios, biografia, enfoque_terapeutico, tarifa_consulta, estado_verificacion)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id_usuario) DO NOTHING`,
        [therapistResult.rows[0].id_usuario, 2, 'PSI-2024-001', 'Colegio de Psicólogos de Bolivia', 8,
         'Psicóloga clínica especializada en terapia cognitivo-conductual con más de 8 años de experiencia.',
         'Terapia Cognitivo-Conductual, Mindfulness', 200.00, 'aprobado']
      );
    }

    await client.query(
      `INSERT INTO Usuarios (id_rol, email, password_hash, nombre, apellido, telefono, fecha_nacimiento, genero, estado, email_verificado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (email) DO NOTHING`,
      [3, 'juan.perez@email.com', patientPassword, 'Juan', 'Pérez', '70222222', '1995-03-20', 'Masculino', true, true]
    );

    const patientUserResult = await client.query('SELECT id_usuario FROM Usuarios WHERE email = $1', ['juan.perez@email.com']);
    const therapistIdResult = await client.query('SELECT id_terapeuta FROM Terapeutas WHERE id_usuario = $1', [therapistResult.rows[0].id_usuario]);

    if (patientUserResult.rows.length > 0 && therapistIdResult.rows.length > 0) {
      await client.query(
        `INSERT INTO Pacientes (id_usuario, id_terapeuta_principal, contacto_emergencia_nombre, contacto_emergencia_telefono, relacion_contacto_emergencia, estado_tratamiento, fecha_inicio_tratamiento)
         VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE)
         ON CONFLICT (id_usuario) DO NOTHING`,
        [patientUserResult.rows[0].id_usuario, therapistIdResult.rows[0].id_terapeuta, 'María Pérez', '70333333', 'Madre', 'activo']
      );
    }

    console.log('✓ Datos de ejemplo cargados');
    console.log('\n✅ Base de datos inicializada exitosamente!');
    console.log('\n👤 Usuarios de prueba:');
    console.log('   Admin: admin@mindcare.bo / Admin123!');
    console.log('   Terapeuta: dra.martinez@mindcare.bo / Terapeuta123!');
    console.log('   Paciente: juan.perez@email.com / Paciente123!');

  } catch (error) {
    console.error('❌ Error inicializando base de datos:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  initializeDatabase()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { initializeDatabase };
# API Documentation - MindCare

## Base URL
```
http://localhost:3000
https://mindcare.bo (producción)
```

## Autenticación
La API utiliza JWT (JSON Web Tokens) para autenticación. El token debe incluirse en las peticiones como:
- Cookie: `token=<jwt_token>`
- Header: `Authorization: Bearer <jwt_token>`

---

## Endpoints

### 🔐 Autenticación

#### Registro de Usuario
```http
POST /auth/register
Content-Type: application/json

{
  "email": "usuario@ejemplo.com",
  "password": "Password123!",
  "nombre": "Juan",
  "apellido": "Pérez",
  "telefono": "70123456",
  "fecha_nacimiento": "1995-03-20",
  "genero": "Masculino",
  "rol": "Paciente"
}
```

**Respuesta (201):**
```json
{
  "message": "Usuario registrado exitosamente. Por favor, verifica tu email.",
  "user": {
    "id": 1,
    "email": "usuario@ejemplo.com",
    "nombre": "Juan",
    "apellido": "Pérez"
  }
}
```

#### Login
```http
POST /auth/login
Content-Type: application/json

{
  "email": "usuario@ejemplo.com",
  "password": "Password123!"
}
```

**Respuesta (200):**
```json
{
  "message": "Login exitoso",
  "user": {
    "id_usuario": 1,
    "email": "usuario@ejemplo.com",
    "nombre": "Juan",
    "apellido": "Pérez",
    "rol": "Paciente",
    "foto_perfil": null
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### Logout
```http
POST /auth/logout
```

**Respuesta (200):**
```json
{
  "message": "Sesión cerrada exitosamente"
}
```

#### Verificar Email
```http
GET /auth/verify-email?token=<verification_token>
```

**Respuesta (200):**
```json
{
  "message": "Email verificado exitosamente"
}
```

#### Usuario Actual
```http
GET /auth/me
Authorization: Bearer <token>
```

**Respuesta (200):**
```json
{
  "user": {
    "id_usuario": 1,
    "email": "usuario@ejemplo.com",
    "nombre": "Juan",
    "apellido": "Pérez",
    "telefono": "70123456",
    "fecha_nacimiento": "1995-03-20",
    "genero": "Masculino",
    "direccion": null,
    "foto_perfil": null,
    "email_verificado": true,
    "nombre_rol": "Paciente"
  }
}
```

---

### 👥 Terapeutas

#### Listar Terapeutas
```http
GET /therapists
Authorization: Bearer <token>
```

**Respuesta (200):**
```json
{
  "therapists": [
    {
      "id_terapeuta": 1,
      "id_usuario": 2,
      "nombre": "María",
      "apellido": "Martínez",
      "foto_perfil": null,
      "nombre_especialidad": "Terapia Cognitivo-Conductual",
      "licencia_profesional": "PSI-2024-001",
      "experiencia_anios": 8,
      "biografia": "Psicóloga clínica...",
      "tarifa_consulta": 200.00,
      "calificacion_promedio": 4.8
    }
  ]
}
```

#### Obtener Terapeuta
```http
GET /therapists/:id
Authorization: Bearer <token>
```

---

### 🩺 Pacientes

#### Mis Pacientes (Terapeuta)
```http
GET /patients/my-patients
Authorization: Bearer <token>
```

**Respuesta (200):**
```json
{
  "patients": [
    {
      "id_paciente": 1,
      "id_usuario": 3,
      "nombre": "Juan",
      "apellido": "Pérez",
      "email": "juan@ejemplo.com",
      "telefono": "70123456",
      "foto_perfil": null,
      "estado_tratamiento": "activo"
    }
  ]
}
```

---

### 💬 Comunicación

#### Listar Conversaciones
```http
GET /communication/conversations
Authorization: Bearer <token>
```

**Respuesta (200):**
```json
{
  "conversations": [
    {
      "id_conversacion": 1,
      "id_paciente": 1,
      "id_terapeuta": 1,
      "terapeuta_nombre": "María Martínez",
      "terapeuta_foto": null,
      "ultimo_mensaje": "2024-11-17T10:30:00Z",
      "estado": "activa"
    }
  ]
}
```

#### Obtener Mensajes
```http
GET /communication/conversations/:conversationId/messages
Authorization: Bearer <token>
```

**Respuesta (200):**
```json
{
  "messages": [
    {
      "id_mensaje": 1,
      "id_conversacion": 1,
      "id_remitente": 2,
      "remitente_nombre": "María Martínez",
      "mensaje": "Hola, ¿cómo te sientes hoy?",
      "tipo_mensaje": "texto",
      "leido": true,
      "fecha_envio": "2024-11-17T10:00:00Z"
    }
  ]
}
```

#### Enviar Mensaje
```http
POST /communication/conversations/:conversationId/messages
Authorization: Bearer <token>
Content-Type: application/json

{
  "mensaje": "Hola, me siento mucho mejor",
  "tipo_mensaje": "texto"
}
```

**Respuesta (201):**
```json
{
  "message": {
    "id_mensaje": 2,
    "id_conversacion": 1,
    "id_remitente": 3,
    "mensaje": "Hola, me siento mucho mejor",
    "tipo_mensaje": "texto",
    "leido": false,
    "fecha_envio": "2024-11-17T10:05:00Z"
  }
}
```

#### Listar Notificaciones
```http
GET /communication/notifications
Authorization: Bearer <token>
```

**Respuesta (200):**
```json
{
  "notifications": [
    {
      "id_notificacion": 1,
      "titulo": "Nueva Cita Programada",
      "mensaje": "Tienes una nueva cita programada para el 20/11/2024",
      "leida": false,
      "fecha_creacion": "2024-11-17T09:00:00Z"
    }
  ]
}
```

#### Marcar Notificación como Leída
```http
PUT /communication/notifications/:notificationId/read
Authorization: Bearer <token>
```

#### Alertas Clínicas
```http
GET /communication/clinical-alerts
Authorization: Bearer <token>
```

**Respuesta (200):**
```json
{
  "alerts": [
    {
      "id_alerta": 1,
      "id_paciente": 1,
      "paciente_nombre": "Juan Pérez",
      "tipo_alerta": "Puntuación crítica en PHQ-9",
      "severidad": "critica",
      "descripcion": "El paciente obtuvo 22 puntos en PHQ-9",
      "leida": false,
      "fecha_creacion": "2024-11-17T08:00:00Z",
      "estado": "activa"
    }
  ]
}
```

---

### 📊 Monitoreo Emocional

#### Check-in Emocional
```http
POST /monitoring/check-in
Authorization: Bearer <token>
Content-Type: application/json

{
  "id_emocion": 1,
  "valencia_personal": 4,
  "activacion_personal": 3,
  "notas_paciente": "Me siento bien hoy, tuve un buen día en el trabajo"
}
```

**Respuesta (201):**
```json
{
  "message": "Check-in emocional registrado exitosamente",
  "checkIn": {
    "id_checkin": 1,
    "id_paciente": 1,
    "id_emocion": 1,
    "valencia_personal": 4,
    "activacion_personal": 3,
    "notas_paciente": "Me siento bien hoy...",
    "fecha_registro": "2024-11-17T10:00:00Z"
  }
}
```

#### Enviar Respuesta de Escala
```http
POST /monitoring/scales/submit
Authorization: Bearer <token>
Content-Type: application/json

{
  "id_asignacion": 1,
  "respuestas": {
    "pregunta1": 1,
    "pregunta2": 2,
    "pregunta3": 1,
    "pregunta4": 0,
    "pregunta5": 2,
    "pregunta6": 1,
    "pregunta7": 1,
    "pregunta8": 0,
    "pregunta9": 1
  },
  "observaciones_paciente": "Me fue difícil concentrarme esta semana",
  "tiempo_completacion": 5
}
```

**Respuesta (201):**
```json
{
  "message": "Escala completada exitosamente",
  "resultado": {
    "id_resultado": 1,
    "id_asignacion": 1,
    "puntuacion_total": 9,
    "interpretacion_automatica": "Depresión leve",
    "fecha_completacion": "2024-11-17T10:15:00Z"
  },
  "interpretacion": {
    "nivel": "Leve",
    "severidad": "baja",
    "descripcion": "Depresión leve"
  }
}
```

#### Escalas Pendientes
```http
GET /monitoring/scales/pending
Authorization: Bearer <token>
```

**Respuesta (200):**
```json
{
  "pendingScales": [
    {
      "id_asignacion": 1,
      "nombre_escala": "PHQ-9",
      "escala_descripcion": "Evaluación de depresión",
      "fecha_asignacion": "2024-11-15T00:00:00Z",
      "fecha_limite": "2024-11-20T00:00:00Z",
      "estado": "activa"
    }
  ]
}
```

#### Historial Emocional del Paciente
```http
GET /monitoring/patient/:patientId/history?days=30
Authorization: Bearer <token>
```

**Respuesta (200):**
```json
{
  "checkIns": [
    {
      "id_checkin": 1,
      "valencia_personal": 4,
      "activacion_personal": 3,
      "emocion_nombre": "Feliz",
      "color_hex": "#FFD700",
      "fecha_registro": "2024-11-17T10:00:00Z"
    }
  ],
  "scaleResults": [
    {
      "id_resultado": 1,
      "nombre_escala": "PHQ-9",
      "puntuacion_total": 9,
      "interpretacion_automatica": "Depresión leve",
      "fecha_completacion": "2024-11-17T10:15:00Z"
    }
  ]
}
```

---

### 📅 Citas y Teleterapia

#### Horarios Disponibles
```http
GET /appointments/available-slots?therapistId=1&date=2024-11-20
Authorization: Bearer <token>
```

**Respuesta (200):**
```json
{
  "availableSlots": [
    {
      "id_bloque": 1,
      "fecha": "2024-11-20",
      "hora_inicio": "09:00",
      "hora_fin": "10:00",
      "estado": "disponible"
    },
    {
      "id_bloque": 2,
      "fecha": "2024-11-20",
      "hora_inicio": "10:00",
      "hora_fin": "11:00",
      "estado": "disponible"
    }
  ]
}
```

#### Crear Cita
```http
POST /appointments
Authorization: Bearer <token>
Content-Type: application/json

{
  "id_terapeuta": 1,
  "fecha_hora_inicio": "2024-11-20T09:00:00Z",
  "duracion_minutos": 60,
  "motivo_consulta": "Seguimiento de tratamiento"
}
```

**Respuesta (201):**
```json
{
  "message": "Cita programada exitosamente",
  "appointment": {
    "id_cita": 1,
    "id_paciente": 1,
    "id_terapeuta": 1,
    "fecha_hora_inicio": "2024-11-20T09:00:00Z",
    "fecha_hora_fin": "2024-11-20T10:00:00Z",
    "duracion_minutos": 60,
    "estado": "programada",
    "enlace_sesion": "http://localhost:3000/session/abc123",
    "token_sesion": "abc123"
  }
}
```

#### Listar Citas
```http
GET /appointments
Authorization: Bearer <token>
```

**Respuesta (200):**
```json
{
  "appointments": [
    {
      "id_cita": 1,
      "terapeuta_nombre": "María Martínez",
      "fecha_hora_inicio": "2024-11-20T09:00:00Z",
      "fecha_hora_fin": "2024-11-20T10:00:00Z",
      "estado": "programada",
      "motivo_consulta": "Seguimiento de tratamiento",
      "enlace_sesion": "http://localhost:3000/session/abc123"
    }
  ]
}
```

#### Actualizar Estado de Cita
```http
PUT /appointments/:appointmentId/status
Authorization: Bearer <token>
Content-Type: application/json

{
  "estado": "confirmada"
}
```

#### Guardar Notas de Sesión (Terapeuta)
```http
POST /appointments/:appointmentId/notes
Authorization: Bearer <token>
Content-Type: application/json

{
  "notas_terapeuta": "El paciente muestra progreso significativo...",
  "objetivos_trabajados": "Manejo de ansiedad, técnicas de relajación",
  "tareas_asignadas": "Practicar respiración diafragmática diariamente",
  "duracion_real_minutos": 55,
  "calidad_sesion": "excelente"
}
```

**Respuesta (201):**
```json
{
  "message": "Notas de sesión guardadas exitosamente",
  "session": {
    "id_sesion": 1,
    "id_cita": 1,
    "notas_terapeuta": "El paciente muestra progreso...",
    "fecha_registro": "2024-11-20T10:00:00Z"
  }
}
```

---

### 📈 Reportes y Analítica

#### Historial Clínico del Paciente
```http
GET /reports/patient/:patientId/clinical-history
Authorization: Bearer <token>
```

**Respuesta (200):**
```json
{
  "clinicalHistory": [
    {
      "id_historial": 1,
      "tipo_registro": "Consulta",
      "titulo": "Primera Consulta",
      "contenido": "Evaluación inicial del paciente...",
      "terapeuta_nombre": "María Martínez",
      "fecha_registro": "2024-11-01T09:00:00Z"
    }
  ]
}
```

#### Generar Reporte de Progreso (Terapeuta)
```http
POST /reports/progress
Authorization: Bearer <token>
Content-Type: application/json

{
  "patientId": 1,
  "tipo_reporte": "mensual",
  "periodo_inicio": "2024-10-01",
  "periodo_fin": "2024-10-31",
  "resumen_evolucion": "El paciente ha mostrado mejoría consistente...",
  "recomendaciones": "Continuar con técnicas de mindfulness..."
}
```

**Respuesta (201):**
```json
{
  "message": "Reporte de progreso generado exitosamente",
  "report": {
    "id_reporte": 1,
    "tipo_reporte": "mensual",
    "periodo_inicio": "2024-10-01",
    "periodo_fin": "2024-10-31",
    "metricas_principales": {
      "total_checkins": 25,
      "total_escalas": 4,
      "promedio_escalas": 7.5,
      "total_sesiones": 4
    },
    "fecha_generacion": "2024-11-01T00:00:00Z"
  }
}
```

#### Reportes de Progreso del Paciente
```http
GET /reports/patient/:patientId/progress
Authorization: Bearer <token>
```

#### Analytics de Plataforma (Admin)
```http
GET /reports/analytics?startDate=2024-10-01&endDate=2024-10-31&tipo=mensual
Authorization: Bearer <token>
```

**Respuesta (200):**
```json
{
  "analytics": [
    {
      "fecha": "2024-10-31",
      "tipo_analytics": "mensual",
      "metricas": {
        "usuarios_activos": 150,
        "citas_completadas": 450,
        "tasa_desercion": 0.12
      }
    }
  ],
  "summary": {
    "total_usuarios": 200,
    "total_pacientes_activos": 150,
    "total_terapeutas": 15,
    "total_citas_completadas": 2500
  }
}
```

#### Log de Auditoría (Admin)
```http
GET /reports/audit-log?limit=100&offset=0
Authorization: Bearer <token>
```

---

### 🔧 Administración

#### Terapeutas Pendientes de Aprobación
```http
GET /admin/pending-therapists
Authorization: Bearer <token>
```

#### Aprobar Terapeuta
```http
PUT /admin/therapist/:id/approve
Authorization: Bearer <token>
```

#### Rechazar Terapeuta
```http
PUT /admin/therapist/:id/reject
Authorization: Bearer <token>
Content-Type: application/json

{
  "motivo_rechazo": "Documentación incompleta"
}
```

#### Estadísticas Generales
```http
GET /admin/stats
Authorization: Bearer <token>
```

**Respuesta (200):**
```json
{
  "stats": {
    "total_usuarios": 200,
    "total_pacientes": 150,
    "total_terapeutas": 15,
    "total_citas": 2500,
    "alertas_activas": 3
  }
}
```

---

## Códigos de Estado HTTP

- `200 OK` - Solicitud exitosa
- `201 Created` - Recurso creado exitosamente
- `400 Bad Request` - Error en los datos enviados
- `401 Unauthorized` - No autenticado
- `403 Forbidden` - No autorizado
- `404 Not Found` - Recurso no encontrado
- `409 Conflict` - Conflicto (ej: horario ocupado)
- `500 Internal Server Error` - Error del servidor

## Formato de Errores

```json
{
  "error": "Descripción del error",
  "errors": [
    {
      "field": "email",
      "message": "Email debe ser válido"
    }
  ]
}
```

---

## WebSocket Events (Socket.IO)

### Conexión
```javascript
const socket = io('http://localhost:3000');

socket.on('connect', () => {
  console.log('Conectado');
});
```

### Unirse a Sala de Chat
```javascript
socket.emit('join-room', conversationId, userId);
```

### Enviar Mensaje
```javascript
socket.emit('send-message', {
  roomId: conversationId,
  message: 'Hola',
  userId: userId
});
```

### Recibir Mensaje
```javascript
socket.on('receive-message', (data) => {
  console.log('Nuevo mensaje:', data);
});
```

---

## Rate Limiting

La API implementa rate limiting para prevenir abuso:
- 100 peticiones por 15 minutos por IP
- Login: 5 intentos por hora
- Registro: 3 intentos por hora

---

## Ejemplo de Uso Completo

```javascript
// 1. Registro
const registerResponse = await fetch('/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'juan@ejemplo.com',
    password: 'Password123!',
    nombre: 'Juan',
    apellido: 'Pérez',
    rol: 'Paciente'
  })
});

// 2. Login
const loginResponse = await fetch('/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'juan@ejemplo.com',
    password: 'Password123!'
  })
});

const { token } = await loginResponse.json();

// 3. Realizar check-in emocional
const checkInResponse = await fetch('/monitoring/check-in', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    valencia_personal: 4,
    activacion_personal: 3,
    id_emocion: 1,
    notas_paciente: 'Me siento bien hoy'
  })
});

// 4. Programar cita
const appointmentResponse = await fetch('/appointments', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    id_terapeuta: 1,
    fecha_hora_inicio: '2024-11-20T09:00:00Z',
    duracion_minutos: 60,
    motivo_consulta: 'Primera consulta'
  })
});
```
# Documentación de Módulos - MindCare

## Separación de Responsabilidades

Este proyecto está organizado en 5 módulos especializados, cada uno con responsabilidades claramente definidas para evitar superposiciones y mantener un código mantenible.

---

## MÓDULO A: Gestión de Usuarios y Autenticación (Fabio)

### Responsabilidad Principal
Seguridad y validación exhaustiva de usuarios

### Archivos Principales
- `controllers/authController.js` - Lógica de autenticación
- `routes/authRoutes.js` - Endpoints de autenticación
- `routes/userRoutes.js` - Gestión de perfiles
- `routes/adminRoutes.js` - Administración de usuarios
- `middleware/auth.js` - Protección de rutas
- `middleware/validation.js` - Validaciones de entrada

### Funcionalidades
1. **Registro de usuarios**
   - Validación de email único
   - Contraseña segura (8+ chars, mayúscula, número, especial)
   - Validación de teléfono boliviano
   - Verificación de edad (>=18 años)
   - Envío de email de verificación

2. **Login y sesiones**
   - Autenticación con JWT
   - Bloqueo por intentos fallidos (5 intentos)
   - Control de última conexión
   - Auditoría de accesos

3. **Gestión de perfiles**
   - Perfiles completos con datos médicos
   - Carga de foto de perfil
   - Edición de información personal

4. **Aprobación de terapeutas (Admin)**
   - Dashboard de terapeutas pendientes
   - Aprobación/Rechazo con motivo
   - Verificación de licencias

5. **Consentimientos digitales**
   - Firma digital de consentimientos
   - Tracking de IP y fecha
   - Revocación de consentimientos

### Endpoints
```
POST   /auth/register
POST   /auth/login
POST   /auth/logout
GET    /auth/verify-email
GET    /auth/me
GET    /admin/pending-therapists
PUT    /admin/therapist/:id/approve
PUT    /admin/therapist/:id/reject
```

---

## MÓDULO B: Comunicación y Alertas (Jimmy)

### Responsabilidad Principal
Intermediación e integración total de comunicaciones

### Archivos Principales
- `controllers/communicationController.js` - Lógica de comunicación
- `routes/communicationRoutes.js` - Endpoints de mensajería

### Funcionalidades
1. **Chat seguro 1-a-1**
   - Mensajería entre paciente y terapeuta
   - Soporte para texto, archivos, imágenes
   - Estado de lectura de mensajes
   - Edición de mensajes
   - Historial completo de conversaciones

2. **Sistema de notificaciones**
   - Notificaciones multicanal (email, SMS, push, interno)
   - Centro de notificaciones unificado
   - Marcado de leído/no leído
   - Priorización de notificaciones

3. **Alertas clínicas automáticas**
   - Generación automática por umbrales
   - Niveles de severidad (baja, media, alta, crítica)
   - Filtros por estado y severidad
   - Acciones tomadas por el terapeuta
   - Resolución y archivado de alertas

4. **Tickets de soporte**
   - Creación de tickets por categoría
   - Asignación a agentes
   - Estados: abierto, en progreso, resuelto, cerrado
   - Priorización: baja, media, alta, urgente

5. **Plantillas de mensajes**
   - Mensajes automáticos predefinidos
   - Recordatorios de citas
   - Alertas de check-in pendiente

### Endpoints
```
GET    /communication/conversations
GET    /communication/conversations/:id/messages
POST   /communication/conversations/:id/messages
GET    /communication/notifications
PUT    /communication/notifications/:id/read
GET    /communication/clinical-alerts
```

### Integración con Socket.IO
```javascript
// Eventos en tiempo real
io.on('connection', (socket) => {
  socket.on('join-room', (roomId) => { ... });
  socket.on('send-message', (data) => { ... });
  socket.emit('new-message', message);
  socket.emit('new-notification', notification);
});
```

---

## MÓDULO C: Monitoreo Emocional (Jhosep)

### Responsabilidad Principal
Presente y detección inmediata del estado emocional

### Archivos Principales
- `controllers/monitoringController.js` - Lógica de monitoreo
- `routes/monitoringRoutes.js` - Endpoints de monitoreo

### Funcionalidades
1. **Check-in emocional diario**
   - Modelo Russell (valencia + activación)
   - Selección de emoción predefinida
   - Notas del paciente
   - Factores de contexto
   - Registro de ubicación (opcional)

2. **Escalas psicológicas**
   - PHQ-9 (Depresión) - 9 preguntas
   - GAD-7 (Ansiedad) - 7 preguntas
   - Temporizador de completación
   - Interpretación automática
   - Observaciones del paciente

3. **Alertas automáticas**
   - Detección por umbrales configurables
   - PHQ-9 crítico: ≥20 puntos
   - PHQ-9 alto: ≥15 puntos
   - GAD-7 crítico: ≥15 puntos
   - GAD-7 alto: ≥10 puntos
   - Estado emocional bajo (valencia ≤2)

4. **Reportes diarios**
   - Resumen automático del día
   - Tendencia semanal
   - Conteo de alertas generadas
   - Estado de completado

5. **Visualización de evolución**
   - Gráficos de tendencias emocionales
   - Historial de check-ins
   - Resultados de escalas en el tiempo

### Endpoints
```
POST   /monitoring/check-in
POST   /monitoring/scales/submit
GET    /monitoring/scales/pending
GET    /monitoring/patient/:id/history
```

### Umbrales Configurables (.env)
```
PHQ9_THRESHOLD_HIGH=15
PHQ9_THRESHOLD_CRITICAL=20
GAD7_THRESHOLD_HIGH=10
GAD7_THRESHOLD_CRITICAL=15
```

---

## MÓDULO D: Teleterapia (Alan)

### Responsabilidad Principal
Agenda y sesiones en vivo

### Archivos Principales
- `controllers/appointmentController.js` - Lógica de citas
- `routes/appointmentRoutes.js` - Endpoints de citas

### Funcionalidades
1. **Calendario interactivo**
   - Vista de disponibilidad de terapeutas
   - Horarios regulares y bloqueados
   - Bloques de tiempo por día
   - Filtrado por terapeuta y fecha

2. **Gestión completa de citas (CRUD)**
   - Programación de citas
   - Confirmación de citas
   - Reprogramación (con límites)
   - Cancelación (ventana de 24h)
   - Estados: programada, confirmada, en_progreso, completada, cancelada, no_asistió

3. **Validaciones de horario**
   - No superposición de citas
   - Duración mínima: 30 minutos
   - Detección de conflictos
   - Verificación de disponibilidad

4. **Videollamadas WebRTC**
   - Generación de enlace único por sesión
   - Token de sesión seguro
   - Sala de espera virtual
   - Chat integrado en sesión

5. **Notas de sesión (Terapeuta)**
   - Notas del terapeuta
   - Objetivos trabajados
   - Tareas asignadas
   - Duración real
   - Calidad de sesión
   - Satisfacción del paciente

6. **Recordatorios automáticos**
   - Email 24h antes de la cita
   - Notificación 1h antes
   - Confirmación de asistencia

### Endpoints
```
GET    /appointments/available-slots
POST   /appointments
GET    /appointments
PUT    /appointments/:id/status
POST   /appointments/:id/notes
```

### Validaciones Críticas
```javascript
// Validación de conflicto de horarios
SELECT * FROM Citas
WHERE id_terapeuta = $1
  AND estado NOT IN ('cancelada', 'no_asistio')
  AND fecha_hora_inicio < $3
  AND fecha_hora_fin > $2
```

---

## MÓDULO E: Reportes & Analítica (Renan)

### Responsabilidad Principal
Historial y evolución a largo plazo

### Archivos Principales
- `controllers/reportController.js` - Lógica de reportes
- `routes/reportRoutes.js` - Endpoints de reportes

### Funcionalidades
1. **Historial clínico completo**
   - Registros por tipo (consulta, diagnóstico, evolución)
   - Datos clínicos en formato JSON
   - Niveles de privacidad
   - Actualización con tracking de cambios
   - Búsqueda y filtrado avanzado

2. **Reportes de progreso**
   - Tipos: semanal, mensual, trimestral, final
   - Resumen de evolución
   - Métricas principales:
     - Total de check-ins
     - Total de escalas completadas
     - Promedio de puntuaciones
     - Total de sesiones
   - Objetivos cumplidos
   - Recomendaciones del terapeuta
   - Firma digital del profesional

3. **Analytics de plataforma**
   - Métricas diarias/semanales/mensuales
   - Usuarios activos
   - Citas completadas
   - Tasa de deserción
   - Distribución de diagnósticos
   - Efectividad de tratamientos
   - Dashboard administrativo

4. **Exportación de datos**
   - Formato PDF
   - Formato Excel
   - Cumplimiento de normativas
   - Datos anonimizados para investigación

5. **Indicadores de efectividad**
   - Tasa de adherencia al tratamiento
   - Reducción en puntuaciones de escalas
   - Satisfacción del paciente
   - Tiempo promedio de tratamiento

6. **Log de auditoría**
   - Tracking de todos los eventos
   - Información de IP y User-Agent
   - Datos antes/después de cambios
   - Búsqueda por usuario, fecha, tipo de evento

### Endpoints
```
GET    /reports/patient/:id/clinical-history
POST   /reports/progress
GET    /reports/patient/:id/progress
GET    /reports/analytics
GET    /reports/audit-log
```

### Estructura de Métricas
```javascript
{
  "total_checkins": 45,
  "total_escalas": 12,
  "promedio_escalas": 8.5,
  "total_sesiones": 16,
  "adherencia": 0.85,
  "tendencia": "mejorando"
}
```

---

## Flujos de Trabajo Integrados

### Flujo 1: Registro y Primer Acceso
1. **Módulo A**: Usuario se registra
2. **Módulo A**: Verificación de email
3. **Módulo A**: Completar perfil
4. **Módulo B**: Notificación de bienvenida
5. **Módulo D**: Asignación de terapeuta (si es paciente)
6. **Módulo C**: Recordatorio de primer check-in

### Flujo 2: Check-in Diario con Alerta
1. **Módulo C**: Paciente realiza check-in
2. **Módulo C**: Sistema detecta puntuación crítica
3. **Módulo C**: Genera alerta automática
4. **Módulo B**: Notifica al terapeuta inmediatamente
5. **Módulo B**: Terapeuta recibe alerta en centro de notificaciones
6. **Módulo B**: Terapeuta contacta al paciente vía chat
7. **Módulo E**: Evento registrado en auditoría

### Flujo 3: Sesión de Terapia Completa
1. **Módulo D**: Paciente programa cita
2. **Módulo B**: Confirmación enviada por email
3. **Módulo B**: Recordatorio 24h antes
4. **Módulo D**: Acceso a videollamada
5. **Módulo D**: Terapeuta registra notas de sesión
6. **Módulo E**: Actualización de historial clínico
7. **Módulo C**: Asignación de escalas de seguimiento

### Flujo 4: Generación de Reporte Mensual
1. **Módulo E**: Terapeuta inicia generación de reporte
2. **Módulo C**: Recopilación de check-ins del mes
3. **Módulo C**: Recopilación de escalas completadas
4. **Módulo D**: Conteo de sesiones realizadas
5. **Módulo E**: Cálculo de métricas
6. **Módulo E**: Generación de documento
7. **Módulo B**: Notificación al paciente
8. **Módulo E**: Registro en auditoría

---

## Principios de Diseño

### 1. Single Responsibility Principle
Cada módulo tiene una responsabilidad clara y no duplica funcionalidades de otros módulos.

### 2. Separation of Concerns
- **Módulo A**: Quién puede acceder (identidad)
- **Módulo B**: Cómo se comunican (mensajería)
- **Módulo C**: Qué sienten ahora (estado actual)
- **Módulo D**: Cuándo se reúnen (agenda)
- **Módulo E**: Qué ha pasado (historia)

### 3. Loose Coupling
Los módulos están débilmente acoplados. Interactúan principalmente a través de:
- Base de datos compartida
- Notificaciones asíncronas
- APIs REST bien definidas

### 4. High Cohesion
Dentro de cada módulo, todas las funcionalidades están altamente relacionadas con su responsabilidad principal.

---

## Seguridad y Cumplimiento

### HIPAA-like Compliance
1. **Encriptación**
   - Passwords con bcrypt
   - JWT para autenticación
   - HTTPS en producción

2. **Control de Acceso**
   - Role-Based Access Control (RBAC)
   - Validación en cada endpoint
   - Auditoría completa

3. **Privacidad de Datos**
   - Consentimientos digitales
   - Niveles de privacidad en historial
   - Datos sensibles protegidos

4. **Auditoría**
   - Log de todos los accesos
   - Tracking de cambios
   - IP y User-Agent registrados

---

## Testing y Validación

### Validaciones por Módulo

**Módulo A:**
- [ ] Email único
- [ ] Contraseña segura
- [ ] Teléfono válido
- [ ] Edad >= 18 años

**Módulo D:**
- [ ] No superposición de horarios
- [ ] Duración >= 30 minutos
- [ ] Ventana de cancelación
- [ ] Límite de reprogramaciones

**Módulo C:**
- [ ] Valores de valencia (1-5)
- [ ] Valores de activación (1-5)
- [ ] Umbrales de alerta correctos

---

## Conclusión

Esta arquitectura modular garantiza:
- ✓ Mantenibilidad: Cambios aislados por módulo
- ✓ Escalabilidad: Cada módulo puede escalar independientemente
- ✓ Testabilidad: Tests unitarios por módulo
- ✓ Claridad: Responsabilidades bien definidas
- ✓ Seguridad: Validaciones en múltiples capas
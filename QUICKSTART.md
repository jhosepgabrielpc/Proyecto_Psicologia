# Inicio Rápido - MindCare

## Instalación en 5 Minutos

### Paso 1: Instalar Dependencias
```bash
npm install
```

### Paso 2: Configurar Base de Datos PostgreSQL

**Opción A - PostgreSQL Local:**
```bash
# Instalar PostgreSQL (si no lo tienes)
# Ubuntu/Debian:
sudo apt install postgresql postgresql-contrib

# macOS:
brew install postgresql

# Crear base de datos
sudo -u postgres psql
CREATE DATABASE mindcare_db;
\q
```

**Opción B - Docker (Recomendado para desarrollo):**
```bash
docker run --name mindcare-postgres \
  -e POSTGRES_DB=mindcare_db \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 \
  -d postgres:14-alpine
```

### Paso 3: Configurar Variables de Entorno
```bash
# El archivo .env ya está configurado con valores por defecto
# Edita si necesitas cambiar algo:
nano .env
```

**Valores por defecto:**
- Base de datos: `mindcare_db`
- Usuario: `postgres`
- Password: `postgres`
- Puerto: `5432`

### Paso 4: Inicializar Base de Datos
```bash
npm run init-db
```

**Esto creará:**
- ✓ Todas las tablas necesarias
- ✓ Roles (Admin, Terapeuta, Paciente)
- ✓ Especialidades
- ✓ Escalas (PHQ-9, GAD-7)
- ✓ 3 usuarios de prueba

### Paso 5: Iniciar el Servidor
```bash
npm start
```

**Para desarrollo (con auto-reload):**
```bash
npm run dev
```

### Paso 6: Acceder a la Aplicación
Abre tu navegador en: **http://localhost:3000**

---

## Usuarios de Prueba

### 👨‍💼 Administrador
```
Email: admin@mindcare.bo
Password: Admin123!
```
**Puede:**
- Aprobar/rechazar terapeutas
- Ver estadísticas de la plataforma
- Acceder a analytics
- Gestionar usuarios

### 👩‍⚕️ Terapeuta
```
Email: dra.martinez@mindcare.bo
Password: Terapeuta123!
```
**Puede:**
- Ver lista de pacientes
- Gestionar citas
- Enviar/recibir mensajes
- Ver alertas clínicas
- Generar reportes de progreso
- Registrar notas de sesión

### 🧑 Paciente
```
Email: juan.perez@email.com
Password: Paciente123!
```
**Puede:**
- Realizar check-in emocional diario
- Completar escalas (PHQ-9, GAD-7)
- Programar citas con terapeuta
- Enviar/recibir mensajes
- Ver su historial emocional

---

## Flujos Principales para Probar

### 1. Como Paciente - Check-in Emocional
1. Login como paciente
2. Ir a "Check-in" en el menú
3. Seleccionar emoción actual
4. Completar formulario
5. Ver historial emocional

### 2. Como Paciente - Programar Cita
1. Login como paciente
2. Ir a "Citas"
3. Click en "Nueva Cita"
4. Seleccionar terapeuta
5. Elegir fecha y hora disponible
6. Confirmar cita

### 3. Como Terapeuta - Ver Alertas
1. Login como terapeuta
2. Ir a "Dashboard"
3. Ver alertas clínicas activas
4. Click en alerta para ver detalles
5. Tomar acción (contactar paciente)

### 4. Como Terapeuta - Realizar Sesión
1. Login como terapeuta
2. Ir a "Agenda"
3. Click en cita programada
4. Iniciar videollamada
5. Al finalizar: registrar notas de sesión

### 5. Como Admin - Aprobar Terapeuta
1. Login como admin
2. Ir a "Admin" → "Terapeutas Pendientes"
3. Revisar información del terapeuta
4. Aprobar o rechazar

---

## Estructura de Carpetas

```
mindcare-teleterapia/
├── config/              # Configuración (DB, Email)
├── controllers/         # Lógica de negocio
│   ├── authController.js          # Módulo A
│   ├── communicationController.js  # Módulo B
│   ├── monitoringController.js     # Módulo C
│   ├── appointmentController.js    # Módulo D
│   └── reportController.js         # Módulo E
├── database/            # Scripts SQL
├── middleware/          # Auth y Validación
├── routes/              # Rutas de la API
├── views/               # Vistas EJS
├── public/              # Archivos estáticos
└── uploads/             # Archivos subidos
```

---

## Comandos Útiles

```bash
# Iniciar servidor (producción)
npm start

# Iniciar servidor (desarrollo con auto-reload)
npm run dev

# Inicializar/reinicializar base de datos
npm run init-db

# Verificar que el build funciona
npm run build

# Ver logs (si usas PM2)
pm2 logs mindcare
```

---

## Endpoints API Principales

### Autenticación
```bash
POST   /auth/register    # Registrar usuario
POST   /auth/login       # Iniciar sesión
POST   /auth/logout      # Cerrar sesión
GET    /auth/me          # Usuario actual
```

### Check-in Emocional (Módulo C)
```bash
POST   /monitoring/check-in              # Registrar check-in
GET    /monitoring/scales/pending        # Escalas pendientes
POST   /monitoring/scales/submit         # Completar escala
```

### Citas (Módulo D)
```bash
GET    /appointments                     # Listar citas
POST   /appointments                     # Crear cita
GET    /appointments/available-slots    # Horarios disponibles
```

### Mensajería (Módulo B)
```bash
GET    /communication/conversations             # Listar conversaciones
GET    /communication/conversations/:id/messages  # Mensajes
POST   /communication/conversations/:id/messages  # Enviar mensaje
GET    /communication/notifications              # Notificaciones
GET    /communication/clinical-alerts            # Alertas clínicas
```

### Reportes (Módulo E)
```bash
GET    /reports/patient/:id/clinical-history  # Historial clínico
POST   /reports/progress                       # Generar reporte
GET    /reports/analytics                      # Analytics
```

**Ver documentación completa:** `API.md`

---

## Problemas Comunes

### Error: "Cannot connect to database"
**Solución:**
```bash
# Verificar que PostgreSQL está corriendo
sudo systemctl status postgresql

# Verificar credenciales en .env
cat .env | grep DB_
```

### Error: "Port 3000 already in use"
**Solución:**
```bash
# Cambiar puerto en .env
PORT=3001

# O matar proceso en puerto 3000
lsof -ti:3000 | xargs kill -9
```

### Error: "Email no se envía"
**Solución:**
```bash
# Configurar email en .env con credenciales reales de Gmail
# Necesitas habilitar "Acceso de apps menos seguras" o usar App Password
```

### Resetear Base de Datos
```bash
# Advertencia: Esto eliminará TODOS los datos
psql -U postgres -d mindcare_db -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
npm run init-db
```

---

## Próximos Pasos

1. **Explorar la aplicación** con los usuarios de prueba
2. **Leer la documentación completa** en `README.md`
3. **Revisar la separación de módulos** en `MODULOS.md`
4. **Consultar la API** en `API.md`
5. **Preparar para producción** con `DEPLOYMENT.md`

---

## Testing

### Flujo de Testing Completo

1. **Registro y Login**
   - Registrar nuevo usuario
   - Verificar validaciones (contraseña, email, teléfono)
   - Login exitoso
   - Verificar JWT en cookies

2. **Check-in Emocional**
   - Login como paciente
   - Realizar check-in con valencia baja (≤2)
   - Verificar que se genera alerta automática
   - Login como terapeuta y ver alerta

3. **Programación de Citas**
   - Login como paciente
   - Programar cita en horario disponible
   - Intentar programar cita en horario ocupado (debe fallar)
   - Verificar notificación enviada a terapeuta

4. **Mensajería**
   - Login como paciente
   - Enviar mensaje a terapeuta
   - Login como terapeuta
   - Responder mensaje
   - Verificar marcado de leído

5. **Escalas Clínicas**
   - Completar PHQ-9 con puntuación alta (≥20)
   - Verificar generación de alerta crítica
   - Verificar notificación al terapeuta

6. **Reportes**
   - Login como terapeuta
   - Generar reporte mensual de paciente
   - Verificar métricas calculadas

---

## Recursos Adicionales

- **Modelo Russell (Emociones):** [Circumplex Model](https://en.wikipedia.org/wiki/Emotion_classification#Circumplex_model)
- **PHQ-9:** [Patient Health Questionnaire](https://www.phqscreeners.com/)
- **GAD-7:** [Generalized Anxiety Disorder Scale](https://www.mdcalc.com/gad-7)
- **WebRTC:** [Getting Started Guide](https://webrtc.org/getting-started/overview)
- **Socket.IO:** [Documentation](https://socket.io/docs/v4/)

---

## Soporte

¿Tienes preguntas? Revisa:
1. `README.md` - Documentación general
2. `MODULOS.md` - Arquitectura de módulos
3. `API.md` - Documentación de API
4. `DEPLOYMENT.md` - Guía de despliegue

**Contacto:** info@mindcare.bo
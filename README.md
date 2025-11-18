# MindCare - Sistema de Teleterapia

## Descripción
MindCare es una plataforma integral de teleterapia y monitoreo emocional diseñada para el Centro de Salud Mental en La Paz, Bolivia. El sistema reduce la deserción en tratamientos psicológicos mediante herramientas de seguimiento continuo y sesiones virtuales.

## Tecnologías
- **Backend:** Node.js + Express.js
- **Base de Datos:** PostgreSQL (compatible con SQL Server)
- **Frontend:** EJS + Tailwind CSS
- **Autenticación:** JWT + bcrypt
- **Comunicación en Tiempo Real:** Socket.IO
- **Video:** WebRTC
- **Email:** Nodemailer

## Arquitectura - 5 Módulos Especializados

### Módulo A: Gestión de Usuarios y Autenticación (Fabio)
- Registro con verificación de email
- Sistema de login con bloqueo por intentos fallidos
- Gestión de perfiles (Pacientes, Terapeutas, Admin)
- Aprobación de terapeutas
- Consentimientos digitales
- Auditoría de accesos

### Módulo B: Comunicación y Alertas (Jimmy)
- Chat seguro 1-a-1 paciente-terapeuta
- Sistema de notificaciones multicanal
- Alertas clínicas automáticas
- Centro de notificaciones unificado
- Tickets de soporte técnico

### Módulo C: Monitoreo Emocional (Jhosep)
- Check-in emocional diario (Modelo Russell)
- Escalas PHQ-9 y GAD-7
- Alertas automáticas por umbrales
- Reportes diarios
- Visualización de evolución emocional

### Módulo D: Teleterapia (Alan)
- Calendario interactivo
- Gestión de citas (CRUD completo)
- Videollamadas WebRTC
- Control de disponibilidad
- Recordatorios automáticos

### Módulo E: Reportes & Analítica (Renan)
- Historial clínico completo
- Reportes de progreso (semanal/mensual)
- Analytics de plataforma
- Exportación de datos
- Dashboard administrativo

## Instalación

### Requisitos Previos
- Node.js (v16 o superior)
- PostgreSQL (v12 o superior)
- npm o yarn

### Pasos de Instalación

1. **Clonar el repositorio**
   ```bash
   git clone <repository-url>
   cd mindcare-teleterapia
   ```

2. **Instalar dependencias**
   ```bash
   npm install
   ```

3. **Configurar variables de entorno**
   ```bash
   cp .env.example .env
   ```
   Edita el archivo `.env` con tus configuraciones:
   - Configuración de base de datos
   - Secret keys para JWT y sesiones
   - Credenciales de email
   - URLs base

4. **Crear la base de datos**
   ```bash
   createdb mindcare_db
   ```

5. **Ejecutar el schema**
   ```bash
   psql -U postgres -d mindcare_db -f database/schema.sql
   ```

6. **Cargar datos de ejemplo (opcional)**
   ```bash
   psql -U postgres -d mindcare_db -f database/seed.sql
   ```

7. **Iniciar el servidor**
   ```bash
   # Modo desarrollo
   npm run dev

   # Modo producción
   npm start
   ```

8. **Acceder a la aplicación**
   Abre tu navegador en: `http://localhost:3000`

## Usuarios de Prueba

### Administrador
- Email: admin@mindcare.bo
- Password: Admin123!

### Terapeuta
- Email: dra.martinez@mindcare.bo
- Password: Terapeuta123!

### Paciente
- Email: juan.perez@email.com
- Password: Paciente123!

## Estructura del Proyecto

```
mindcare-teleterapia/
├── config/              # Configuraciones (DB, Email)
├── controllers/         # Lógica de negocio
│   ├── authController.js
│   ├── communicationController.js
│   ├── monitoringController.js
│   ├── appointmentController.js
│   └── reportController.js
├── database/            # Scripts SQL
│   ├── schema.sql
│   └── seed.sql
├── middleware/          # Middlewares (Auth, Validación)
├── models/              # Modelos de datos
├── routes/              # Definición de rutas
├── utils/               # Utilidades y helpers
├── views/               # Vistas EJS
│   ├── partials/
│   ├── auth/
│   ├── dashboard/
│   ├── appointments/
│   ├── communication/
│   ├── monitoring/
│   └── reports/
├── public/              # Archivos estáticos
│   ├── css/
│   ├── js/
│   └── images/
├── uploads/             # Archivos subidos
├── server.js            # Punto de entrada
└── package.json
```

## Validaciones Críticas

### Registro de Usuario
- Email único y válido
- Contraseña: mínimo 8 caracteres, mayúscula, número, carácter especial
- Teléfono formato boliviano (8 dígitos, inicia con 6 o 7)
- Edad mínima: 18 años

### Programación de Citas
- No horarios superpuestos
- Duración mínima 30 minutos
- Validación de conflictos

### Escalas Clínicas
- PHQ-9: Alerta crítica ≥20 puntos
- GAD-7: Alerta crítica ≥15 puntos

## Seguridad

- Encriptación de contraseñas con bcrypt
- Autenticación JWT
- Protección CSRF
- Rate limiting
- Validación de entrada
- Sesiones seguras
- Logs de auditoría completos

## API Endpoints

### Autenticación
- POST `/auth/register` - Registro de usuario
- POST `/auth/login` - Inicio de sesión
- POST `/auth/logout` - Cerrar sesión
- GET `/auth/verify-email` - Verificar email
- GET `/auth/me` - Usuario actual

### Comunicación
- GET `/communication/conversations` - Listar conversaciones
- GET `/communication/conversations/:id/messages` - Mensajes
- POST `/communication/conversations/:id/messages` - Enviar mensaje
- GET `/communication/notifications` - Notificaciones
- GET `/communication/clinical-alerts` - Alertas clínicas

### Monitoreo
- POST `/monitoring/check-in` - Check-in emocional
- POST `/monitoring/scales/submit` - Enviar escala
- GET `/monitoring/scales/pending` - Escalas pendientes
- GET `/monitoring/patient/:id/history` - Historial emocional

### Citas
- GET `/appointments` - Listar citas
- POST `/appointments` - Crear cita
- PUT `/appointments/:id/status` - Actualizar estado
- POST `/appointments/:id/notes` - Guardar notas de sesión

### Reportes
- GET `/reports/patient/:id/clinical-history` - Historial clínico
- POST `/reports/progress` - Generar reporte de progreso
- GET `/reports/analytics` - Analytics de plataforma
- GET `/reports/audit-log` - Log de auditoría

## Contribución

Este proyecto fue desarrollado por:
- **Fabio** - Módulo A: Gestión de Usuarios
- **Jimmy** - Módulo B: Comunicación y Alertas
- **Jhosep** - Módulo C: Monitoreo Emocional
- **Alan** - Módulo D: Teleterapia
- **Renan** - Módulo E: Reportes & Analítica

## Licencia
MIT License

## Contacto
MindCare - Centro de Salud Mental
La Paz, Bolivia
info@mindcare.bo
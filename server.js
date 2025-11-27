const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const http = require('http');
const socketIO = require('socket.io');

// IMPORTAR BASE DE DATOS (NECESARIO PARA NOTIFICACIONES)
const db = require('./config/database'); 

// Cargar variables de entorno
dotenv.config();

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const PORT = process.env.PORT || 3000;

// ==========================================
// 1. CONFIGURACIÓN DE SEGURIDAD Y MIDDLEWARE
// ==========================================
app.use(helmet({
  contentSecurityPolicy: false, // Permitir scripts inline (Chart.js, FullCalendar, etc.)
  crossOriginEmbedderPolicy: false
}));

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

app.use(morgan('dev')); // Logs en consola
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Configuración de Sesión
app.use(session({
  secret: process.env.SESSION_SECRET || 'mindcare_secret_key_super_segura',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // true solo en HTTPS
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 horas
  }
}));

// --- 🛡️ EL SALVAVIDAS GLOBAL (CON NOTIFICACIONES) ---
// Este middleware se ejecuta antes de cada vista para inyectar datos del usuario y alertas
app.use(async (req, res, next) => {
  res.locals.title = 'MindCare'; 
  res.locals.user = req.session.user || null; 
  res.locals.appName = 'MindCare';
  res.locals.url = req.originalUrl; 
  
  // Variables globales vacías para evitar errores "undefined"
  if (!res.locals.msg) res.locals.msg = null;
  if (!res.locals.errors) res.locals.errors = [];
  if (!res.locals.formData) res.locals.formData = {};
  
  // Inicializar notificaciones vacías
  res.locals.notifications = [];
  res.locals.unreadCount = 0;

  // LÓGICA DE LA CAMPANITA: Si hay usuario, buscamos sus alertas
  if (req.session.user) {
    try {
      // 1. Obtener las últimas 5 notificaciones
      const notifRes = await db.query(`
        SELECT id_notificacion, mensaje, enlace_accion, fecha_creacion, tipo, leido
        FROM Notificaciones
        WHERE id_usuario = $1
        ORDER BY fecha_creacion DESC
        LIMIT 5
      `, [req.session.user.id_usuario]);
      
      // 2. Contar cuántas no ha leído
      const countRes = await db.query(`
        SELECT COUNT(*) as count FROM Notificaciones 
        WHERE id_usuario = $1 AND leido = false
      `, [req.session.user.id_usuario]);

      res.locals.notifications = notifRes.rows;
      res.locals.unreadCount = parseInt(countRes.rows[0].count);

    } catch (error) {
      console.error('⚠️ Error cargando notificaciones en header:', error.message);
      // No bloqueamos la app si falla esto, simplemente mostramos 0 notificaciones
    }
  }
  
  next();
});

// ==========================================
// 2. MOTOR DE VISTAS Y ARCHIVOS ESTÁTICOS
// ==========================================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ==========================================
// 3. IMPORTACIÓN DE RUTAS
// ==========================================
const authRoutes = require('./routes/authRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes'); // Maneja: Admin, Alan, Jimmy, Lobby
const communicationRoutes = require('./routes/communicationRoutes');
const monitoringRoutes = require('./routes/monitoringRoutes'); // Jhosep
const reportRoutes = require('./routes/reportRoutes'); // Renan
const indexRoutes = require('./routes/index');

// ==========================================
// 4. DEFINICIÓN DE ENDPOINTS (ORDEN CRÍTICO)
// ==========================================

// A. Rutas Públicas y Autenticación
app.use('/', indexRoutes);
app.use('/auth', authRoutes);

// B. Rutas Especializadas (Deben ir ANTES del dashboard general)
app.use('/dashboard/communication', communicationRoutes);
app.use('/dashboard/monitoring', monitoringRoutes);
app.use('/reports', reportRoutes);

// C. Router Maestro / Lobby (Maneja Alan, Jimmy, Admin y Redirecciones)
app.use('/dashboard', dashboardRoutes);


// ==========================================
// 5. MANEJO DE ERRORES (404 y 500)
// ==========================================

// 404: Página no encontrada
app.use((req, res) => {
  res.status(404).render('error', {
    title: 'Página No Encontrada',
    message: 'La ruta que buscas no existe o ha cambiado.',
    error: { status: 404 },
    user: req.session.user || null
  });
});

// 500: Error del Servidor
app.use((err, req, res, next) => {
  console.error('🔥 ERROR DEL SERVIDOR:', err.stack);
  if (res.headersSent) return next(err);
  
  res.status(err.status || 500).render('error', {
    title: 'Error del Sistema',
    message: 'Ha ocurrido un error interno. Por favor intenta más tarde.',
    error: process.env.NODE_ENV === 'development' ? err : {},
    user: req.session.user || null
  });
});

// ==========================================
// 6. CONFIGURACIÓN SOCKET.IO (CHAT REALTIME)
// ==========================================
global.io = io; 

io.on('connection', (socket) => {
  // Unirse a sala privada (Para recibir mensajes personales)
  socket.on('join-room', (roomName) => {
    socket.join(roomName);
  });

  // Reenviar mensaje (Backup por si falla la API REST)
  socket.on('send-message', (data) => {
    socket.to(data.roomId).emit('receive-message', data);
  });
});

// ==========================================
// 7. INICIAR SERVIDOR
// ==========================================
server.listen(PORT, () => {
  console.log(`
  🚀 Servidor MindCare activo
  📡 URL: http://localhost:${PORT}
  📝 Modo: ${process.env.NODE_ENV || 'development'}
  `);
});

module.exports = app;
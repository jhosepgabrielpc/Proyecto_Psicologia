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
  contentSecurityPolicy: false, // Permitir scripts inline (necesario para Tailwind/Socket/Chart.js)
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

// Configuración de Sesión (CRÍTICO para el login)
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

// --- 🛡️ EL SALVAVIDAS GLOBAL ---
// Inyecta variables comunes en todas las vistas para evitar errores
app.use((req, res, next) => {
  res.locals.title = 'MindCare'; 
  res.locals.user = req.session.user || null; // Usuario disponible en todos los EJS
  res.locals.appName = 'MindCare';
  res.locals.url = req.originalUrl; // Para resaltar items activos en el menú
  
  // Variables globales vacías para evitar errores en vistas compartidas
  if (!res.locals.msg) res.locals.msg = null;
  
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
// 3. RUTAS (EL ORDEN IMPORTA MUCHO AQUÍ)
// ==========================================

// Importar archivos de rutas
const authRoutes = require('./routes/authRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const communicationRoutes = require('./routes/communicationRoutes');
const monitoringRoutes = require('./routes/monitoringRoutes'); // <--- NUEVO: Importar Monitoreo
const reportRoutes = require('./routes/reportRoutes');
const indexRoutes = require('./routes/index');

// --- DEFINICIÓN DE ENDPOINTS ---

// En server.js (Línea 85 aprox)

// A. Rutas Principales
app.use('/', indexRoutes);
app.use('/auth', authRoutes);

// B. Rutas Específicas (IMPORTANTE: Estas van PRIMERO)
app.use('/dashboard/communication', communicationRoutes);
app.use('/dashboard/monitoring', monitoringRoutes); // <--- ¿Está esta línea aquí?
app.use('/reports', reportRoutes);

// C. Ruta General (Esta "se come" todo lo que empiece con /dashboard)
app.use('/dashboard', dashboardRoutes);


// ==========================================
// 4. MANEJO DE ERRORES (404 y 500)
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
  // Evitar doble respuesta si ya se enviaron headers
  if (res.headersSent) {
    return next(err);
  }
  res.status(err.status || 500).render('error', {
    title: 'Error del Sistema',
    message: 'Ha ocurrido un error interno. Por favor intenta más tarde.',
    error: process.env.NODE_ENV === 'development' ? err : {},
    user: req.session.user || null
  });
});

// ==========================================
// 5. CONFIGURACIÓN SOCKET.IO (CHAT REALTIME)
// ==========================================
global.io = io; // Hacerlo global para usarlo en controladores

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
// 6. INICIAR SERVIDOR
// ==========================================
server.listen(PORT, () => {
  console.log(`
  🚀 Servidor MindCare activo
  📡 URL: http://localhost:${PORT}
  📝 Modo: ${process.env.NODE_ENV || 'development'}
  `);
});

module.exports = app;
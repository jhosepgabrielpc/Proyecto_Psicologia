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

// Seguridad
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

// Logs y Parsers
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Configuración de Sesión
app.use(session({
  secret: process.env.SESSION_SECRET || 'mindcare_secret_key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// --- 🛡️ EL SALVAVIDAS GLOBAL (ESTO ES LO NUEVO) ---
// Esto inyecta variables por defecto en TODAS las vistas para evitar errores
app.use((req, res, next) => {
  // Si no hay título, ponemos uno por defecto
  res.locals.title = 'MindCare'; 
  // Si no hay usuario, ponemos null (para que el header no falle)
  res.locals.user = req.session.user || null;
  // Variables globales de la app
  res.locals.appName = 'MindCare';
  res.locals.baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  next();
});

// Motor de Vistas
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Archivos Estáticos
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- RUTAS ---
// (Asegúrate de que estos archivos existan en tu carpeta routes)
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const therapistRoutes = require('./routes/therapistRoutes');
const patientRoutes = require('./routes/patientRoutes');
const communicationRoutes = require('./routes/communicationRoutes');
const monitoringRoutes = require('./routes/monitoringRoutes');
const appointmentRoutes = require('./routes/appointmentRoutes');
const reportRoutes = require('./routes/reportRoutes');
const adminRoutes = require('./routes/adminRoutes');
const indexRoutes = require('./routes/index');
const dashboardRoutes = require('./routes/dashboardRoutes');

app.use('/dashboard', dashboardRoutes);
app.use('/auth', authRoutes);
app.use('/users', userRoutes);
app.use('/therapists', therapistRoutes);
app.use('/patients', patientRoutes);
app.use('/communication', communicationRoutes);
app.use('/monitoring', monitoringRoutes);
app.use('/appointments', appointmentRoutes);
app.use('/reports', reportRoutes);
app.use('/admin', adminRoutes);
app.use('/', indexRoutes);

// Error 404
app.use((req, res) => {
  res.status(404).render('error', {
    title: 'Página No Encontrada', // Título explícito
    message: 'La página que buscas no existe',
    error: { status: 404 }
  });
});

// Error 500 (General)
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).render('error', {
    title: 'Error del Sistema', // Título explícito
    message: err.message || 'Ha ocurrido un error en el servidor',
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
});

// Socket.IO
global.io = io;
io.on('connection', (socket) => {
  console.log('Usuario conectado:', socket.id);
  socket.on('join-room', (roomId, userId) => {
    socket.join(roomId);
    socket.to(roomId).emit('user-connected', userId);
  });
  socket.on('send-message', (data) => {
    io.to(data.roomId).emit('receive-message', data);
  });
  socket.on('disconnect', () => {
    console.log('Usuario desconectado:', socket.id);
  });
});

// Iniciar
server.listen(PORT, () => {
  console.log(`✓ Servidor MindCare corriendo en http://localhost:${PORT}`);
  console.log(`✓ Modo: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
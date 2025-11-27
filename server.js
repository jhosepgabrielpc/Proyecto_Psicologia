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

// IMPORTAR BASE DE DATOS (VITAL PARA EL MIDDLEWARE DE NOTIFICACIONES)
const db = require('./config/database'); 

// Cargar variables de entorno
dotenv.config();

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const PORT = process.env.PORT || 3000;

// ====================================================================
// 1. CONFIGURACIÓN DE SEGURIDAD Y MIDDLEWARE BÁSICO
// ====================================================================
app.use(helmet({
    contentSecurityPolicy: false, // Permite scripts inline (Chart.js, FullCalendar)
    crossOriginEmbedderPolicy: false
}));

app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
}));

app.use(morgan('dev')); // Logs de peticiones en consola
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

// ====================================================================
// 2. MIDDLEWARE GLOBAL (EL "SALVAVIDAS" + NOTIFICACIONES)
// ====================================================================
// Este middleware se ejecuta antes de CADA vista.
// Inyecta el usuario, mensajes flash y las NOTIFICACIONES DE LA CAMPANITA.
app.use(async (req, res, next) => {
    res.locals.title = 'MindCare'; 
    res.locals.user = req.session.user || null; 
    res.locals.appName = 'MindCare';
    res.locals.url = req.originalUrl; 
    
    // Variables globales seguras (evitan errores "undefined" en EJS)
    if (!res.locals.msg) res.locals.msg = req.query.msg || null;
    if (!res.locals.errors) res.locals.errors = [];
    if (!res.locals.formData) res.locals.formData = {};
    
    // Inicializar Notificaciones
    res.locals.notifications = [];
    res.locals.unreadCount = 0;

    // LÓGICA INTELIGENTE: Si hay usuario logueado, cargamos sus alertas
    if (req.session.user) {
        try {
            // 1. Traer las últimas 5 notificaciones para el dropdown
            const notifRes = await db.query(`
                SELECT id_notificacion, mensaje, enlace_accion, fecha_creacion, tipo, leido
                FROM Notificaciones
                WHERE id_usuario = $1
                ORDER BY fecha_creacion DESC
                LIMIT 5
            `, [req.session.user.id_usuario]);
            
            // 2. Contar cuántas NO han sido leídas (para el globito rojo)
            const countRes = await db.query(`
                SELECT COUNT(*) as count FROM Notificaciones 
                WHERE id_usuario = $1 AND leido = false
            `, [req.session.user.id_usuario]);

            res.locals.notifications = notifRes.rows;
            res.locals.unreadCount = parseInt(countRes.rows[0].count);

        } catch (error) {
            // Si falla la BD, no rompemos la app, solo mostramos 0 notificaciones
            console.error('⚠️ Advertencia: No se pudieron cargar las notificaciones header.', error.message);
        }
    }
    
    next();
});

// ====================================================================
// 3. MOTOR DE VISTAS Y ARCHIVOS ESTÁTICOS
// ====================================================================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ====================================================================
// 4. IMPORTACIÓN Y DEFINICIÓN DE RUTAS (ORDEN CRÍTICO)
// ====================================================================
// Importar archivos de rutas
const authRoutes = require('./routes/authRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes'); // Maneja: Admin, Alan (Citas), Jimmy (Gestión)
const communicationRoutes = require('./routes/communicationRoutes');
const monitoringRoutes = require('./routes/monitoringRoutes'); // Jhosep (Monitoreo)
const reportRoutes = require('./routes/reportRoutes'); // Renan (Clínica)
const indexRoutes = require('./routes/index');

// A. Rutas Públicas (Landing y Auth)
app.use('/', indexRoutes);
app.use('/auth', authRoutes);

// B. Rutas Especializadas (Deben cargarse ANTES del dashboard general)
// 1. Comunicación (Chat Global)
app.use('/dashboard/communication', communicationRoutes);

// 2. Monitoreo (Módulo Jhosep - Alertas y Checkins)
app.use('/dashboard/monitoring', monitoringRoutes);

// 3. Reportes Clínicos (Módulo Renan - Expedientes y Analytics)
app.use('/reports', reportRoutes);

// C. Router Maestro / Lobby (Maneja Citas (Alan), Gestión (Jimmy), Admin y Redirecciones)
// IMPORTANTE: Esta ruta atrapa '/dashboard' y subrutas como '/dashboard/appointments'
app.use('/dashboard', dashboardRoutes);


// ====================================================================
// 5. MANEJO DE ERRORES (404 y 500)
// ====================================================================

// 404: Página no encontrada
app.use((req, res) => {
    res.status(404).render('error', {
        title: 'Página No Encontrada',
        message: 'La ruta que buscas no existe o ha cambiado.',
        error: { status: 404 },
        user: req.session.user || null
    });
});

// 500: Error del Servidor Global
app.use((err, req, res, next) => {
    console.error('🔥 ERROR CRÍTICO DEL SERVIDOR:', err.stack);
    
    // Si ya se enviaron headers, delegar a Express
    if (res.headersSent) {
        return next(err);
    }
    
    res.status(err.status || 500).render('error', {
        title: 'Error del Sistema',
        message: 'Ha ocurrido un error interno inesperado. El equipo técnico ha sido notificado.',
        error: process.env.NODE_ENV === 'development' ? err : {},
        user: req.session.user || null
    });
});

// ====================================================================
// 6. CONFIGURACIÓN SOCKET.IO (REALTIME ENGINE)
// ====================================================================
global.io = io; // Hacemos 'io' global para usarlo en controladores si se requiere

io.on('connection', (socket) => {
    // Unirse a sala privada (Para chat 1 a 1)
    socket.on('join-room', (roomName) => {
        socket.join(roomName);
    });

    // Reenviar mensaje instantáneo
    socket.on('send-message', (data) => {
        socket.to(data.roomId).emit('receive-message', data);
    });
});

// ====================================================================
// 7. INICIAR SERVIDOR
// ====================================================================
server.listen(PORT, () => {
    console.log(`
    🚀 Servidor MindCare ACTIVO y LISTO
    -----------------------------------
    📡 URL Local:  http://localhost:${PORT}
    📝 Entorno:    ${process.env.NODE_ENV || 'development'}
    💾 Base Datos: Conectada
    🔔 Alertas:    Sistema de notificaciones activo
    -----------------------------------
    `);
});

module.exports = app;
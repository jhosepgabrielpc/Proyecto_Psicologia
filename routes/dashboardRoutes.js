const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { isAuthenticated, requireAdmin } = require('../middleware/auth'); 

// ==================================================================
// 1. LOBBY / DISPATCHER (Ruta: /dashboard)
// ==================================================================
// Esta ruta decide a dónde enviar al usuario según su rol.
// Aquí es donde tenías el error "reading nombre_rol".
router.get('/', isAuthenticated, (req, res) => {
    
    // 1. Validación extra de seguridad
    if (!req.session || !req.session.user) {
        return res.redirect('/auth/login');
    }

    // 2. Obtener el rol de forma segura (Desde la SESIÓN)
    const role = req.session.user.nombre_rol;

    console.log(`[Dashboard Dispatcher] Usuario: ${req.session.user.email} - Rol: ${role}`);

    // 3. Redirección inteligente
    if (role === 'Administrador' || role === 'Admin') {
        return res.redirect('/dashboard/admin');
    } 
    else if (role === 'Terapeuta') {
        return res.redirect('/dashboard/monitoring'); // O la ruta principal del terapeuta
    } 
    else if (role === 'Paciente') {
        return res.redirect('/dashboard/communication'); // O la ruta principal del paciente
    } 
    else if (role === 'Monitorista') {
        return res.redirect('/dashboard/monitoring');
    }
    else {
        // Fallback si el rol no coincide con nada
        return res.render('error', {
            title: 'Acceso Denegado',
            message: 'Tu rol de usuario no tiene un dashboard asignado.',
            error: { status: 403 },
            user: req.session.user
        });
    }
});

// ==================================================================
// 2. RUTAS DE ADMINISTRADOR (Ruta: /dashboard/admin/*)
// ==================================================================

// Panel Principal (Torre de Control)
router.get('/admin', isAuthenticated, requireAdmin, dashboardController.getAdminDashboard);

// Funcionalidad: Matchmaking (Asignar Terapeuta)
router.post('/admin/assign', isAuthenticated, requireAdmin, dashboardController.assignTherapist);

// CRUD Usuarios: Crear
router.get('/admin/create', isAuthenticated, requireAdmin, dashboardController.showCreateUserForm);
router.post('/admin/create', isAuthenticated, requireAdmin, dashboardController.createUser);

// CRUD Usuarios: Editar
router.get('/admin/edit/:id', isAuthenticated, requireAdmin, dashboardController.showEditUserForm);
router.post('/admin/edit/:id', isAuthenticated, requireAdmin, dashboardController.updateUser);

// CRUD Usuarios: Bloquear/Desbloquear (Soft Delete)
router.get('/admin/toggle-user/:id', isAuthenticated, requireAdmin, dashboardController.toggleUserStatus);


// ==================================================================
// 3. RUTAS PLACEHOLDER (OTROS ROLES)
// ==================================================================
// Estas son necesarias para que no de error 404 si el Dispatcher redirige aquí

router.get('/monitoring', isAuthenticated, (req, res) => {
    res.render('dashboard/monitoring', { // Asegúrate de tener esta vista o cambia a una genérica
        title: 'Monitoreo', 
        user: req.session.user 
    });
});

router.get('/appointments', isAuthenticated, (req, res) => {
    res.render('dashboard/appointments', { 
        title: 'Gestión de Citas', 
        user: req.session.user 
    });
});

module.exports = router;
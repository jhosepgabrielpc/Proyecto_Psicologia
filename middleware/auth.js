// ==================================================================
// MIDDLEWARE DE AUTENTICACIÓN Y ROLES (VERSIÓN BLINDADA)
// ==================================================================

/**
 * Verifica si el usuario ha iniciado sesión.
 * Si no, lo redirige al login.
 */
const isAuthenticated = (req, res, next) => {
    // 1. Verificar si existe la sesión y el objeto usuario
    if (req.session && req.session.user) {
        return next();
    }

    // 2. Manejo inteligente de la respuesta (API vs Navegador)
    const acceptsJson = req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1);
    if (acceptsJson) {
        return res.status(401).json({ error: 'Sesión expirada o no iniciada' });
    }

    // 3. Redirigir al login
    return res.redirect('/auth/login?msg=auth_required');
};

/**
 * Verifica si el usuario tiene uno de los roles permitidos.
 * BLINDAJE: Evita el crash si 'nombre_rol' viene undefined.
 */
const requireRole = (...allowedRoles) => {
    return (req, res, next) => {
        // A. Verificar sesión básica
        if (!req.session || !req.session.user) {
            return res.redirect('/auth/login');
        }

        // B. Obtener el rol de forma SEGURA
        const userRole = req.session.user.nombre_rol || '';

        // C. Diagnóstico de seguridad (Si el usuario no tiene rol, algo anda mal en el Login)
        if (!userRole) {
            console.error(
                `⚠️ ALERTA: Usuario ID ${req.session.user.id_usuario} no tiene rol asignado en la sesión.`
            );
            return res.status(403).render('error', {
                title: 'Error de Permisos',
                message: 'Tu cuenta no tiene un rol válido asignado. Contacta a soporte.',
                error: { status: 403 },
                user: req.session.user
            });
        }

        // D. Normalización
        const normalizedAllowed = allowedRoles.map(r => String(r).toLowerCase());
        const normalizedUserRole = String(userRole).toLowerCase();

        // E. Verificar Permiso
        // Admin siempre pasa (Superusuario implícito)
        if (
            normalizedAllowed.includes(normalizedUserRole) ||
            normalizedUserRole.includes('admin')
        ) {
            return next();
        }

        // F. Acceso Denegado
        if (req.xhr) {
            return res
                .status(403)
                .json({ error: 'No tienes permisos para realizar esta acción.' });
        }

        return res.status(403).render('error', {
            title: 'Acceso Restringido',
            message: 'No tienes los permisos necesarios para acceder a esta sección.',
            error: { status: 403 },
            user: req.session.user
        });
    };
};

// ==================================================================
// WRAPPERS ESPECÍFICOS (Alias para facilitar uso)
// ==================================================================

const requireTherapist = requireRole(
    'Terapeuta',
    'Admin',          // explícito
    'Administrador',
    'GestorHistorial',
    'GestorComunicacion',
    'Monitorista'
);

const requirePatient = requireRole('Paciente', 'Administrador', 'Admin');

const requireAdmin = requireRole('Administrador', 'Admin');

// Exportamos
module.exports = {
    isAuthenticated,
    authenticateToken: isAuthenticated, // Alias de compatibilidad
    requireRole,
    requireTherapist,
    requirePatient,
    requireAdmin
};

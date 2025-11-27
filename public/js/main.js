document.addEventListener('DOMContentLoaded', function() {
    console.log('MindCare initialized');

    const logoutLinks = document.querySelectorAll('a[href="/auth/logout"]');
    logoutLinks.forEach(link => {
        link.addEventListener('click', async (e) => {
            e.preventDefault();
            try {
                const response = await fetch('/auth/logout', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });

                if (response.ok) {
                    window.location.href = '/';
                }
            } catch (error) {
                console.error('Error al cerrar sesión:', error);
            }
        });
    });
// Notificaciones
    function showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.className = `fixed top-4 right-4 p-4 rounded-lg shadow-lg ${
            type === 'success' ? 'bg-green-500' : 'bg-red-500'
        } text-white z-50 transition-opacity duration-300`;
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    window.showNotification = showNotification;
});

// ... código existente ...

/* ==========================================
   BUSCADOR EN TIEMPO REAL (Para Dashboard Historial)
   ========================================== */
function initSearchFilter(inputId, itemSelector, textSelector) {
    const input = document.getElementById(inputId);
    if (!input) return; // Si no existe el input en esta vista, no hacemos nada

    input.addEventListener('keyup', function() {
        const filter = this.value.toLowerCase();
        const items = document.querySelectorAll(itemSelector);
        let hasResults = false;

        items.forEach(item => {
            // Busca el texto dentro del selector específico (ej: nombre del paciente)
            const textElement = item.querySelector(textSelector);
            const text = textElement ? textElement.textContent.toLowerCase() : '';

            if (text.includes(filter)) {
                item.style.display = ''; // Mostrar
                hasResults = true;
            } else {
                item.style.display = 'none'; // Ocultar
            }
        });

        // Manejo de mensaje "No hay resultados" (Opcional, requiere un elemento con id 'no-results')
        const noResultsMsg = document.getElementById('no-results-message');
        if (noResultsMsg) {
            noResultsMsg.style.display = hasResults ? 'none' : 'block';
        }
    });
}

// Inicialización Global (se ejecuta cuando carga cualquier página)
document.addEventListener('DOMContentLoaded', () => {
    // Intentar activar el buscador de pacientes
    // ID del input: 'patient-search'
    // Clase de la tarjeta: '.patient-card'
    // Clase del nombre: '.patient-name'
    initSearchFilter('patient-search', '.patient-card', '.patient-name');
});
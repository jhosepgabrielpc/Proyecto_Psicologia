using Modulo_Alan.Services;
using System.Threading.Tasks;
using System.Windows;

namespace Modulo_Alan.ViewModels
{
    public class SalaVideoViewModel
    {
        private readonly ZoomService _zoomService;

        public string EstadoConexion { get; set; }
        public string UrlSala { get; set; }
        public bool SesionActiva { get; set; }

        public SalaVideoViewModel(ZoomService zoomService)
        {
            _zoomService = zoomService;
            EstadoConexion = "No conectado";
            SesionActiva = false;
        }

        // ✅ CORREGIDO: Método CargarSesion que falta
        public async void CargarSesion(int citaId)
        {
            try
            {
                EstadoConexion = "Conectando...";

                // Probar conexión con Zoom
                bool conexionExitosa = await _zoomService.TestConnectionAsync();

                if (conexionExitosa)
                {
                    EstadoConexion = "✅ Conectado a Zoom";
                    SesionActiva = true;

                    // Aquí puedes cargar información específica de la cita
                    // Por ejemplo, crear o recuperar una sesión existente
                    await CargarInformacionCita(citaId);
                }
                else
                {
                    EstadoConexion = "❌ Error de conexión";
                    SesionActiva = false;
                    MessageBox.Show("No se pudo conectar con Zoom. Verifica las credenciales en Configuración.");
                }
            }
            catch (Exception ex)
            {
                EstadoConexion = "❌ Error de conexión";
                SesionActiva = false;
                MessageBox.Show($"Error cargando sesión: {ex.Message}");
            }
        }

        private async Task CargarInformacionCita(int citaId)
        {
            // Simular carga de información de la cita
            // En una implementación real, esto vendría de tu base de datos
            await Task.Delay(500); // Simular operación async

            // Ejemplo: crear una nueva sesión para la cita
            UrlSala = "https://zoom.us/j/123456789";
        }

        public async Task<string> CrearSesionDeVideoAsync(int citaId, string pacienteNombre)
        {
            try
            {
                bool conexionExitosa = await _zoomService.TestConnectionAsync();

                if (!conexionExitosa)
                {
                    MessageBox.Show("❌ Error de conexión con Zoom. Verifica las credenciales.");
                    return null;
                }

                string topic = $"Sesión Terapia - {pacienteNombre} - Cita #{citaId}";
                string joinUrl = await _zoomService.CreateMeetingAsync(
                    topic,
                    DateTime.Now.AddMinutes(5),
                    50
                );

                UrlSala = joinUrl;
                SesionActiva = true;

                MessageBox.Show($"✅ Sesión de video creada:\n{joinUrl}", "Éxito");
                return joinUrl;
            }
            catch (Exception ex)
            {
                MessageBox.Show($"❌ Error creando sesión: {ex.Message}", "Error");
                return null;
            }
        }
    }
}
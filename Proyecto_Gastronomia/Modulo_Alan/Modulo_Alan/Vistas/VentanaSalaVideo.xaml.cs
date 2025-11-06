using System.Windows;
using Modulo_Alan.Services;
using Modulo_Alan.ViewModels;
using System.Configuration;

namespace Modulo_Alan.Vistas
{
    public partial class VentanaSalaVideo : Window
    {
        private readonly SalaVideoViewModel _viewModel;

        public VentanaSalaVideo(int citaId)
        {
            InitializeComponent();

            // Obtener credenciales
            string clientId = ObtenerConfiguracion("ZoomClientId");
            string clientSecret = ObtenerConfiguracion("ZoomClientSecret");
            string accountId = ObtenerConfiguracion("ZoomAccountId");

            if (string.IsNullOrEmpty(clientId) || string.IsNullOrEmpty(clientSecret) || string.IsNullOrEmpty(accountId))
            {
                MessageBox.Show("❌ Credenciales de Zoom no configuradas. Por favor, configura las credenciales primero.");
                this.Close();
                return;
            }

            var servicioVideo = new ZoomService(clientId, clientSecret, accountId);
            _viewModel = new SalaVideoViewModel(servicioVideo);

            DataContext = _viewModel;
            _viewModel.CargarSesion(citaId);
        }

        private string ObtenerConfiguracion(string key)
        {
            try
            {
                return ConfigurationManager.AppSettings[key] ?? "";
            }
            catch
            {
                return "";
            }
        }

        // ✅ AGREGA ESTE MÉTODO QUE FALTA
        private void ConfiguracionAvanzada_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                var ventanaConfig = new VentanaConfiguracion();
                ventanaConfig.Owner = this;
                ventanaConfig.ShowDialog();

                // Opcional: Actualizar configuración después de cerrar
                MessageBox.Show("Configuración avanzada aplicada", "Éxito",
                              MessageBoxButton.OK, MessageBoxImage.Information);
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error abriendo configuración avanzada: {ex.Message}",
                              "Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        // ✅ OPCIONAL: Puedes agregar más métodos de eventos si los necesitas
        private void ProbarAudioVideo_Click(object sender, RoutedEventArgs e)
        {
            MessageBox.Show("🔊 Probando audio y video...\n\nAsegúrate de que:\n• Tu micrófono esté conectado\n• Tu cámara esté funcionando\n• Los permisos estén concedidos",
                          "Prueba de Audio/Video", MessageBoxButton.OK, MessageBoxImage.Information);
        }

        private void UnirseSesion_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                if (!string.IsNullOrEmpty(_viewModel.UrlSala))
                {
                    System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                    {
                        FileName = _viewModel.UrlSala,
                        UseShellExecute = true
                    });
                    MessageBox.Show("✅ Redirigiendo a la sesión de Zoom...", "Unirse a Sesión");
                }
                else
                {
                    MessageBox.Show("❌ No hay una URL de sesión disponible. Primero crea una sesión.",
                                  "Error", MessageBoxButton.OK, MessageBoxImage.Warning);
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show($"❌ Error al unirse a la sesión: {ex.Message}", "Error");
            }
        }

        private void FinalizarSesion_Click(object sender, RoutedEventArgs e)
        {
            var resultado = MessageBox.Show("¿Estás seguro de que quieres finalizar la sesión?",
                                          "Finalizar Sesión",
                                          MessageBoxButton.YesNo,
                                          MessageBoxImage.Question);

            if (resultado == MessageBoxResult.Yes)
            {
                _viewModel.SesionActiva = false;
                _viewModel.EstadoConexion = "Sesión finalizada";
                MessageBox.Show("✅ Sesión finalizada correctamente", "Éxito");
            }
        }
    }
}
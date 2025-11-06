using System;
using System.Configuration;
using System.Windows;
using Modulo_Alan.Services;
using Modulo_Alan.Vistas;

namespace Modulo_Alan
{
    public partial class MainWindow : Window
    {
        public MainWindow()
        {
            InitializeComponent();
            VerificarConfiguracionInicial();
        }

        private void VerificarConfiguracionInicial()
        {
            // Verificar si las credenciales están configuradas
            string clientId = ConfigurationManager.AppSettings["ZoomClientId"];
            string clientSecret = ConfigurationManager.AppSettings["ZoomClientSecret"];
            string accountId = ConfigurationManager.AppSettings["ZoomAccountId"];

            if (string.IsNullOrEmpty(clientId) || string.IsNullOrEmpty(clientSecret) || string.IsNullOrEmpty(accountId))
            {
                txtEstado.Text = "⚠️ Configura las credenciales de Zoom primero";
            }
            else
            {
                txtEstado.Text = "✅ Credenciales configuradas - Listo para probar conexión";
            }
        }

        private async void ProbarConexion_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                txtEstado.Text = "🔍 Probando conexión con Zoom OAuth...";

                // ✅ ACTUALIZADO: Obtener las 3 credenciales OAuth
                string clientId = ConfigurationManager.AppSettings["ZoomClientId"];
                string clientSecret = ConfigurationManager.AppSettings["ZoomClientSecret"];
                string accountId = ConfigurationManager.AppSettings["ZoomAccountId"];

                // ✅ ACTUALIZADO: Validar las 3 credenciales
                if (string.IsNullOrEmpty(clientId) || string.IsNullOrEmpty(clientSecret) || string.IsNullOrEmpty(accountId))
                {
                    txtEstado.Text = "❌ Primero configura Client ID, Client Secret y Account ID en Configuración";
                    MessageBox.Show("Necesitas configurar las credenciales OAuth de Zoom:\n\n• Client ID\n• Client Secret\n• Account ID", "Configuración Requerida");
                    return;
                }

                // ✅ ACTUALIZADO: Crear servicio con 3 parámetros
                var servicio = new ZoomService(clientId, clientSecret, accountId);
                var conexionOk = await servicio.TestConnectionAsync();

                txtEstado.Text = conexionOk ?
                    "✅ Conexión OAuth exitosa con Zoom API" :
                    "❌ Error de conexión - Revisa las credenciales OAuth";
            }
            catch (Exception ex)
            {
                txtEstado.Text = $"💥 Error: {ex.Message}";
                MessageBox.Show($"Error detallado: {ex.Message}\n\nAsegúrate de que:\n• Las credenciales sean correctas\n• Tu app Zoom tenga los scopes necesarios\n• Tu cuenta Zoom tenga permisos", "Error de Conexión");
            }
        }

        private void AbrirSala_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                // Abrir sala de pruebas de Zoom
                System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                {
                    FileName = "https://zoom.us/test",
                    UseShellExecute = true
                });

                txtEstado.Text = "✅ Sala de pruebas abierta en navegador";
            }
            catch (Exception ex)
            {
                txtEstado.Text = $"❌ Error abriendo sala: {ex.Message}";
            }
        }

        private void Configuracion_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                // Abrir ventana de configuración
                var ventanaConfig = new VentanaConfiguracion();
                ventanaConfig.Owner = this;
                bool? resultado = ventanaConfig.ShowDialog();

                // Actualizar estado después de cerrar la configuración
                if (resultado == true)
                {
                    txtEstado.Text = "✅ Configuración guardada. Ahora puedes probar la conexión.";
                    VerificarConfiguracionInicial();
                }
                else
                {
                    txtEstado.Text = "⚙️ Configuración cancelada";
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error abriendo configuración: {ex.Message}", "Error");
            }
        }

        // ✅ NUEVO: Botón para abrir sala de video con una cita de prueba
        private void AbrirSalaVideo_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                // Verificar credenciales primero
                string clientId = ConfigurationManager.AppSettings["ZoomClientId"];
                string clientSecret = ConfigurationManager.AppSettings["ZoomClientSecret"];
                string accountId = ConfigurationManager.AppSettings["ZoomAccountId"];

                if (string.IsNullOrEmpty(clientId) || string.IsNullOrEmpty(clientSecret) || string.IsNullOrEmpty(accountId))
                {
                    MessageBox.Show("Primero configura las credenciales OAuth en Configuración", "Credenciales Requeridas");
                    return;
                }

                // Abrir sala de video con una cita de prueba
                int citaIdPrueba = 123; // ID de prueba
                var ventanaSala = new VentanaSalaVideo(citaIdPrueba);
                ventanaSala.Owner = this;
                ventanaSala.Show();

                txtEstado.Text = "🎥 Sala de video abierta para cita de prueba";
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error abriendo sala de video: {ex.Message}", "Error");
            }
        }

        // ✅ NUEVO: Botón para ver credenciales actuales
        private void VerCredenciales_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                string clientId = ConfigurationManager.AppSettings["ZoomClientId"];
                string clientSecret = ConfigurationManager.AppSettings["ZoomClientSecret"];
                string accountId = ConfigurationManager.AppSettings["ZoomAccountId"];

                string info = $"📋 Credenciales Actuales:\n\n" +
                             $"• Client ID: {(!string.IsNullOrEmpty(clientId) ? "✅ Configurado" : "❌ Faltante")}\n" +
                             $"• Client Secret: {(!string.IsNullOrEmpty(clientSecret) ? "✅ Configurado" : "❌ Faltante")}\n" +
                             $"• Account ID: {(!string.IsNullOrEmpty(accountId) ? "✅ Configurado" : "❌ Faltante")}";

                MessageBox.Show(info, "Estado de Credenciales");
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error leyendo credenciales: {ex.Message}", "Error");
            }
        }
    }
}
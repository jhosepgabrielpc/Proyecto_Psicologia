using System;
using System.IO;
using System.Windows;
using System.Xml;

namespace Modulo_Alan
{
    public partial class VentanaConfiguracion : Window
    {
        public VentanaConfiguracion()
        {
            InitializeComponent(); // ✅ Esto ahora funcionará
            CargarConfiguracionExistente();
        }

        private void CargarConfiguracionExistente()
        {
            try
            {
                // Leer configuración actual si existe
                if (File.Exists("App.config"))
                {
                    var doc = new XmlDocument();
                    doc.Load("App.config");

                    var apiKeyNode = doc.SelectSingleNode("//appSettings/add[@key='ZoomApiKey']");
                    var apiSecretNode = doc.SelectSingleNode("//appSettings/add[@key='ZoomApiSecret']");
                    var baseUrlNode = doc.SelectSingleNode("//appSettings/add[@key='ZoomBaseUrl']");

                    if (apiKeyNode != null)
                        txtApiKey.Text = apiKeyNode.Attributes["value"]?.Value ?? "";
                    if (apiSecretNode != null)
                        txtApiSecret.Text = apiSecretNode.Attributes["value"]?.Value ?? "";
                    if (baseUrlNode != null)
                        txtBaseUrl.Text = baseUrlNode.Attributes["value"]?.Value ?? "https://api.zoom.us/v2";
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error cargando configuración: {ex.Message}", "Error",
                              MessageBoxButton.OK, MessageBoxImage.Warning);
            }
        }

        private void Guardar_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                // Validar que no estén vacíos
                if (string.IsNullOrWhiteSpace(txtApiKey.Text) || string.IsNullOrWhiteSpace(txtApiSecret.Text))
                {
                    MessageBox.Show("❌ Por favor, completa tanto API Key como API Secret",
                                  "Campos requeridos", MessageBoxButton.OK, MessageBoxImage.Warning);
                    return;
                }

                // Validar formato básico de API Key (generalmente comienzan con caracteres específicos)
                if (txtApiKey.Text.Length < 10)
                {
                    MessageBox.Show("❌ La API Key parece demasiado corta. Verifica que sea correcta.",
                                  "Validación", MessageBoxButton.OK, MessageBoxImage.Warning);
                    return;
                }

                // Crear o actualizar App.config
                var configContent = $@"<?xml version=""1.0"" encoding=""utf-8""?>
<configuration>
  <appSettings>
    <add key=""ZoomApiKey"" value=""{SecurityHelper.EscapeXml(txtApiKey.Text)}""/>
    <add key=""ZoomApiSecret"" value=""{SecurityHelper.EscapeXml(txtApiSecret.Text)}""/>
    <add key=""ZoomBaseUrl"" value=""{SecurityHelper.EscapeXml(txtBaseUrl.Text)}""/>
  </appSettings>
</configuration>";

                File.WriteAllText("App.config", configContent);

                MessageBox.Show("✅ Configuración guardada correctamente\n\nLa aplicación se reiniciará para aplicar los cambios.",
                              "Éxito", MessageBoxButton.OK, MessageBoxImage.Information);

                this.DialogResult = true;
                this.Close();
            }
            catch (Exception ex)
            {
                MessageBox.Show($"❌ Error guardando configuración: {ex.Message}",
                              "Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private void Cancelar_Click(object sender, RoutedEventArgs e)
        {
            this.DialogResult = false;
            this.Close();
        }

        private void Ayuda_Click(object sender, RoutedEventArgs e)
        {
            string mensajeAyuda = @"📋 **CÓMO OBTENER CREDENCIALES ZOOM:**

1. 🌐 Ve a: https://marketplace.zoom.us/
2. 🔐 Inicia sesión con tu cuenta Zoom
3. 🛠️ En 'Develop' → 'Build App'
4. 🔑 Elige 'JWT App' o 'Server-to-Server OAuth'
5. 📝 Completa la información requerida
6. 📋 Copia tu 'API Key' y 'API Secret'

¿Quieres que abra el sitio web de Zoom Marketplace ahora?";

            var resultado = MessageBox.Show(mensajeAyuda, "Ayuda - Credenciales Zoom",
                                          MessageBoxButton.YesNo, MessageBoxImage.Question);

            if (resultado == MessageBoxResult.Yes)
            {
                try
                {
                    System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                    {
                        FileName = "https://marketplace.zoom.us/develop/create",
                        UseShellExecute = true
                    });
                }
                catch (Exception ex)
                {
                    MessageBox.Show($"No se pudo abrir el navegador: {ex.Message}",
                                  "Error", MessageBoxButton.OK, MessageBoxImage.Warning);
                }
            }
        }
    }

    // Clase helper para seguridad XML
    public static class SecurityHelper
    {
        public static string EscapeXml(string input)
        {
            if (string.IsNullOrEmpty(input)) return input;

            return input
                .Replace("&", "&amp;")
                .Replace("<", "&lt;")
                .Replace(">", "&gt;")
                .Replace("\"", "&quot;")
                .Replace("'", "&apos;");
        }
    }
}
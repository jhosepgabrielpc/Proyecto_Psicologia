using System;
using System.Windows;
using Modulo_Alan.Vistas;

namespace Modulo_Alan
{
    public partial class VentanaPreparacionVideo : Window
    {
        public VentanaPreparacionVideo()
        {
            InitializeComponent();
        }

        private void BtnProbar_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                System.Diagnostics.Process.Start("https://zoom.us/test");
                MessageBox.Show("Sala de pruebas abierta. Verifica tu audio y video.",
                              "Prueba de Equipo",
                              MessageBoxButton.OK,
                              MessageBoxImage.Information);
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error: {ex.Message}", "Error");
            }
        }

        private void BtnIniciar_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                var ventanaSala = new VentanaSalaVideo(1);
                ventanaSala.Show();
                this.Close();
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error al iniciar sesión: {ex.Message}", "Error");
            }
        }

        private void BtnCancelar_Click(object sender, RoutedEventArgs e)
        {
            this.Close();
        }
    }
}
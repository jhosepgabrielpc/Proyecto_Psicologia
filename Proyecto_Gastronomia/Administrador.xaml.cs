using System.Windows;
using System.Windows.Input;

namespace Proyecto_Gastronomia
{
    public partial class Administrador : Window
    {
        public Administrador()
        {
            InitializeComponent();
        }

        private void AdministrarRecetas_Click(object sender, RoutedEventArgs e)
        {
            // --- CORREGIDO ---
            // 'AdmiReceta' ahora es 'AdmiPacientes'
            AdmiPacientes ventanaPacientes = new AdmiPacientes();
            ventanaPacientes.Show();
            this.Close();
        }

        private void AdministrarUsuarios_Click(object sender, RoutedEventArgs e)
        {
            AdmiUsuario ventanaUsuarios = new AdmiUsuario();
            ventanaUsuarios.Show();
            this.Close();
        }

        private void AdministrarIngredientes_Click(object sender, RoutedEventArgs e)
        {
            // --- CORREGIDO ---
            // 'AdmiIngredientes' ahora es 'AdmiTerapeutas'
            AdmiTerapeutas ventanaTerapeutas = new AdmiTerapeutas();
            ventanaTerapeutas.Show();
            this.Close();
        }

        private void btnAtras_Click(object sender, RoutedEventArgs e)
        {
            Menu menuWindow = new Menu();
            menuWindow.Show();
            this.Close();
        }

        private void btnSalir_Click(object sender, RoutedEventArgs e)
        {
            Application.Current.Shutdown();
        }
    }
}
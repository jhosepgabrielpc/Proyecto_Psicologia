using System.Windows;
using System.Windows.Input;

namespace Proyecto_Gastronomia
{
    public partial class Menu : Window
    {
        public Menu()
        {
            InitializeComponent();
            this.Loaded += Menu_Loaded;
            this.MouseLeftButtonDown += Window_MouseLeftButtonDown;
        }

        private void Menu_Loaded(object sender, RoutedEventArgs e)
        {
            // --- CORREGIDO (Línea 18) ---
            // Comprobamos la propiedad 'UserRole' que SÍ existe
            if (SessionManager.UserRole == "Administrador")
            {
                AdminOptionPanel.Visibility = Visibility.Visible;
            }
            else
            {
                AdminOptionPanel.Visibility = Visibility.Collapsed;
            }
        }

        private void btnVistaUsuario_Click(object sender, RoutedEventArgs e)
        {
            InicioUsuario inicioUsuarioWindow = new InicioUsuario();
            inicioUsuarioWindow.Show();
            this.Close();
        }

        private void btnVistaAdministrador_Click(object sender, RoutedEventArgs e)
        {
            Administrador administradorWindow = new Administrador();
            administradorWindow.Show();
            this.Close();
        }

        private void btnLogout_Click(object sender, RoutedEventArgs e)
        {
            // --- CORREGIDO (Línea 47) ---
            // Limpiamos la sesión manualmente
            SessionManager.CurrentUserId = 0;
            SessionManager.CurrentUserName = null;
            SessionManager.UserRole = null;

            Login loginWindow = new Login();
            loginWindow.Show();
            this.Close();
        }

        private void Window_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            if (e.ButtonState == MouseButtonState.Pressed)
            {
                this.DragMove();
            }
        }

        private void btnSalir_Click(object sender, RoutedEventArgs e)
        {
            Application.Current.Shutdown();
        }
    }
}
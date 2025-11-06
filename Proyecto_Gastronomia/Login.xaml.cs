using System;
using System.Configuration;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;

namespace Proyecto_Gastronomia
{
    public partial class Login : Window
    {
        private string connectionString;
        private DataClasses1DataContext db;

        public Login()
        {
            InitializeComponent();
            this.MouseLeftButtonDown += Window_MouseLeftButtonDown;
            connectionString = ConfigurationManager.ConnectionStrings["mindcareConnectionString"].ConnectionString;
            db = new DataClasses1DataContext(connectionString);
        }

        private void btnLogin_Click(object sender, RoutedEventArgs e)
        {
            string correo = txtCorreoLogin.Text.Trim();
            string contrasena = txtPassLogin.Password;

            if (string.IsNullOrWhiteSpace(correo) || string.IsNullOrWhiteSpace(contrasena))
            {
                MessageBox.Show("Por favor, ingresa tu correo y contraseña.", "Campos Requeridos", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            try
            {
                // --- LÓGICA PREDEFINIDA (ADMIN) ---
                if (correo.Equals("admi@est.univalle.edu", StringComparison.OrdinalIgnoreCase))
                {
                    if (contrasena == "admi-123456")
                    {
                        var adminUser = db.Usuarios.FirstOrDefault(u => u.correo == correo);
                        var rol = db.Roles.FirstOrDefault(r => r.id_rol == adminUser.id_rol);

                        SessionManager.CurrentUserId = adminUser.id_usuario;
                        SessionManager.CurrentUserName = adminUser.nombre + " " + adminUser.apellido;
                        SessionManager.UserRole = (rol != null) ? rol.nombre_rol : "Administrador";

                        MessageBox.Show($"¡Bienvenido (Admin), {adminUser.nombre}! Has iniciado sesión.", "Bienvenido", MessageBoxButton.OK, MessageBoxImage.Information);

                        // --- CORREGIDO: Redirige a Menu ---
                        new Menu().Show();
                        this.Close();
                        return;
                    }
                }

                // --- LÓGICA DE HASHING (OTROS USUARIOS) ---
                var usuario = db.Usuarios.FirstOrDefault(u => u.correo == correo && u.estado == true);

                if (usuario != null)
                {
                    if (PasswordManager.VerifyPassword(contrasena, usuario.contrasena, usuario.salt))
                    {
                        var rol = db.Roles.FirstOrDefault(r => r.id_rol == usuario.id_rol);
                        string nombreRol = (rol != null) ? rol.nombre_rol : "Desconocido";

                        SessionManager.CurrentUserId = usuario.id_usuario;
                        SessionManager.CurrentUserName = usuario.nombre + " " + usuario.apellido;
                        SessionManager.UserRole = nombreRol;

                        MessageBox.Show($"¡Bienvenido, {usuario.nombre}! Has iniciado sesión como {nombreRol}.", "Bienvenido", MessageBoxButton.OK, MessageBoxImage.Information);

                        // --- CORREGIDO: Redirige a Menu (ignora el rol) ---
                        new Menu().Show();
                        this.Close();
                    }
                    else
                    {
                        MessageBox.Show("Correo o contraseña incorrectos, o usuario inactivo.", "Error de Autenticación", MessageBoxButton.OK, MessageBoxImage.Error);
                    }
                }
                else
                {
                    MessageBox.Show("Correo o contraseña incorrectos, o usuario inactivo.", "Error de Autenticación", MessageBoxButton.OK, MessageBoxImage.Error);
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Ocurrió un error al intentar iniciar sesión: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private void RegisterTextBlock_MouseDown(object sender, MouseButtonEventArgs e)
        {
            SignUp signUpWindow = new SignUp();
            signUpWindow.Show();
            this.Close();
        }

        private void btnSalir_Click(object sender, RoutedEventArgs e)
        {
            Application.Current.Shutdown();
        }

        private void btnAtras_Click(object sender, RoutedEventArgs e)
        {
            Application.Current.Shutdown();
        }

        private void Window_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            if (e.ButtonState == MouseButtonState.Pressed)
            {
                this.DragMove();
            }
        }
    }

    public static class SessionManager
    {
        public static int CurrentUserId { get; set; }
        public static string CurrentUserName { get; set; }
        public static string UserRole { get; set; }
    }
}
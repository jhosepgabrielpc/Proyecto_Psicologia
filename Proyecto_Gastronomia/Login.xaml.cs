using System;
using System.Configuration; // Para leer el App.config
using System.Linq;          // Para usar LINQ to SQL
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;

namespace Proyecto_Gastronomia
{
    public partial class Login : Window
    {
        // Variable para la cadena de conexión
        private string connectionString;

        // Variable para el DataContext de LINQ to SQL
        // DataClasses1DataContext es el nombre que se genera desde tu archivo DataClasses1.dbml
        private DataClasses1DataContext db;

        public Login()
        {
            InitializeComponent();
            this.MouseLeftButtonDown += Window_MouseLeftButtonDown;

            // Lee la cadena de conexión desde App.config
            connectionString = ConfigurationManager.ConnectionStrings["mindcareConnectionString"].ConnectionString;

            // Inicializa el DataContext con esa cadena de conexión
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
                // Esta es la nueva consulta con LINQ to SQL
                // 1. Hacemos un 'join' entre Usuarios y Roles
                // 2. Filtramos por correo, contraseña y estado
                // 3. Seleccionamos un objeto anónimo con los datos que necesitamos
                var usuarioQuery = from u in db.Usuarios
                                   join r in db.Roles on u.id_rol equals r.id_rol
                                   where u.correo == correo && u.contrasena == contrasena && u.estado == true
                                   select new
                                   {
                                       Usuario = u,
                                       NombreRol = r.nombre_rol
                                   };

                // Ejecutamos la consulta y obtenemos el primer resultado (o null si no existe)
                var resultado = usuarioQuery.FirstOrDefault();

                if (resultado != null)
                {
                    // Guardar información del usuario en la sesión
                    SessionManager.CurrentUserId = resultado.Usuario.id_usuario;
                    SessionManager.CurrentUserName = resultado.Usuario.nombre + " " + resultado.Usuario.apellido;
                    SessionManager.UserRole = resultado.NombreRol; // Guardamos el nombre del rol

                    MessageBox.Show($"¡Bienvenido, {resultado.Usuario.nombre}! Has iniciado sesión como {resultado.NombreRol}.", "Bienvenido", MessageBoxButton.OK, MessageBoxImage.Information);

                    // Redirige según el rol del usuario (esto es idéntico a tu lógica anterior)
                    if (resultado.NombreRol == "Administrador")
                    {
                        new Administrador().Show(); // Abre la ventana del administrador
                    }
                    else if (resultado.NombreRol == "Paciente")
                    {
                        new InicioUsuario().Show(); // Abre la ventana del usuario normal (Paciente)
                    }
                    else if (resultado.NombreRol == "Terapeuta")
                    {
                        // Tu script SQL crea este rol, así que la lógica es válida
                        MessageBox.Show("Acceso para Terapeutas aún no implementado completamente.", "Información", MessageBoxButton.OK, MessageBoxImage.Information);
                        new Menu().Show(); // O redirige a una ventana de terapeuta si la tienes
                    }
                    else
                    {
                        MessageBox.Show("Tu rol no tiene una vista específica asignada.", "Advertencia", MessageBoxButton.OK, MessageBoxImage.Warning);
                        new Menu().Show();
                    }
                    this.Close();
                }
                else
                {
                    MessageBox.Show("Correo o contraseña incorrectos, o usuario inactivo.", "Error de Autenticación", MessageBoxButton.OK, MessageBoxImage.Error);
                }
            }
            catch (Exception ex)
            {
                // Este error ahora podría ser por problemas de conexión con LINQ to SQL
                MessageBox.Show($"Ocurrió un error al intentar iniciar sesión: {ex.Message}\nPor favor, verifica la conexión a la base de datos y que las tablas 'Usuarios' y 'Roles' estén en tu archivo DataClasses1.dbml.", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
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

    // La clase SessionManager no necesita cambios
    public static class SessionManager
    {
        public static int CurrentUserId { get; set; }
        public static string CurrentUserName { get; set; }
        public static string UserRole { get; set; }
    }
}
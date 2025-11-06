using System;
using System.Linq;
using System.Text.RegularExpressions;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Configuration;
using System.Diagnostics;

namespace Proyecto_Gastronomia
{
    public partial class SignUp : Window
    {
        private const int MAX_LENGTH_NOMBRE = 100;
        private const int MAX_LENGTH_CORREO = 150;
        private const int MAX_LENGTH_CONTRASENA = 50;
        private string connectionString;

        public SignUp()
        {
            InitializeComponent();
            connectionString = ConfigurationManager.ConnectionStrings["mindcareConnectionString"].ConnectionString;
        }

        private DataClasses1DataContext GetContext()
        {
            return new DataClasses1DataContext(connectionString);
        }

        // --- MÉTODOS DE VALIDACIÓN COMPLETOS (CORRIGE CS0161) ---

        // Valida el formato de correo electrónico.
        private bool EsFormatoCorreoValido(string email)
        {
            string pattern = @"^[a-zA-Z0-9._%+-]{3,}@[a-zA-Z0-9.-]{3,}\.[a-zA-Z]{2,}$";
            return Regex.IsMatch(email, pattern);
        }

        // Valida el nombre de usuario (solo formato)
        private string ValidateNombre(string nombre)
        {
            if (string.IsNullOrWhiteSpace(nombre)) return "El nombre no puede estar vacío.";
            if (nombre.Length > MAX_LENGTH_NOMBRE) return $"El nombre no debe exceder los {MAX_LENGTH_NOMBRE} caracteres.";
            return null; // Devuelve null si es válido
        }

        // Valida el correo electrónico (formato y unicidad).
        private string ValidateCorreoUsr(string correoUsr)
        {
            if (string.IsNullOrWhiteSpace(correoUsr)) return "El correo electrónico no puede estar vacío.";
            if (correoUsr.Length > MAX_LENGTH_CORREO) return $"El correo electrónico no debe exceder los {MAX_LENGTH_CORREO} caracteres.";
            if (!EsFormatoCorreoValido(correoUsr)) return "Formato de correo no válido. (Ej: usuario@dominio.com)";

            try
            {
                using (DataClasses1DataContext db = GetContext())
                {
                    // Ojo: Usando plural 'Usuarios' y columna 'correo'
                    if (db.Usuarios.Any(u => u.correo.ToLower() == correoUsr.ToLower()))
                    {
                        return "El correo electrónico ya está registrado.";
                    }
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error al verificar unicidad de correo: {ex.Message}", "Error de Validación", MessageBoxButton.OK, MessageBoxImage.Error);
                return "Error al verificar unicidad de correo.";
            }
            return null; // Devuelve null si es válido
        }

        // Valida el número de celular (formato).
        private string ValidateNCelUsr(string nCelUsr_text)
        {
            if (string.IsNullOrWhiteSpace(nCelUsr_text)) return "El número de celular no puede estar vacío.";
            if (nCelUsr_text.Length < 8) return "El número de celular debe tener 8 dígitos o más.";
            return null; // Devuelve null si es válido
        }

        // Valida la contraseña (longitud y complejidad).
        private string ValidatePassWdUsr(string passWdUsr)
        {
            if (string.IsNullOrWhiteSpace(passWdUsr)) return "La contraseña no puede estar vacía.";
            if (passWdUsr.Length < 8) return "La contraseña debe tener al menos 8 caracteres.";
            if (passWdUsr.Length > MAX_LENGTH_CONTRASENA) return $"La contraseña no debe exceder los {MAX_LENGTH_CONTRASENA} caracteres.";
            // (Puedes añadir más validaciones de complejidad aquí si quieres)
            return null; // Devuelve null si es válido
        }


        private void btnSignUp_Click(object sender, RoutedEventArgs e)
        {
            // Asumimos que 'txtNomUsr_SignUp' ahora es para 'Nombre'
            string nombre = txtNomUsr_SignUp.Text.Trim();
            // *** OJO: Necesitarás un campo de Apellido en el XAML ***
            string apellido = txtNomUsr_SignUp.Text.Trim(); // Usamos el nombre temporalmente

            string correoUsr = txtCorreoUsr_SignUp.Text.Trim();
            string nCelUsr_text = txtNCelUsr_SignUp.Text.Trim();
            string passWdUsr = txtPassWdUsr_SignUp.Password;
            string confirmPassWdUsr = txtConfirmPassWdUsr_SignUp.Password;

            // --- VALIDACIONES ---
            // (Ahora llaman a los métodos completos)
            string error = ValidateNombre(nombre);
            if (error != null) { MessageBox.Show(error, "Advertencia", MessageBoxButton.OK, MessageBoxImage.Warning); return; }
            error = ValidateCorreoUsr(correoUsr);
            if (error != null) { MessageBox.Show(error, "Advertencia", MessageBoxButton.OK, MessageBoxImage.Warning); return; }
            error = ValidateNCelUsr(nCelUsr_text);
            if (error != null) { MessageBox.Show(error, "Advertencia", MessageBoxButton.OK, MessageBoxImage.Warning); return; }
            error = ValidatePassWdUsr(passWdUsr);
            if (error != null) { MessageBox.Show(error, "Advertencia", MessageBoxButton.OK, MessageBoxImage.Warning); return; }

            if (passWdUsr != confirmPassWdUsr)
            {
                MessageBox.Show("Las contraseñas no coinciden.", "Advertencia", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            try
            {
                using (DataClasses1DataContext db = GetContext())
                {
                    int? rolPacienteId = db.Roles.FirstOrDefault(r => r.nombre_rol == "Paciente")?.id_rol;
                    if (rolPacienteId == null)
                    {
                        MessageBox.Show("Error crítico: No se encontró el rol 'Paciente'.", "Error de BD", MessageBoxButton.OK, MessageBoxImage.Error);
                        return;
                    }

                    // --- LÓGICA DE HASHING ---
                    string salt = PasswordManager.GenerateSalt();
                    string hash = PasswordManager.HashPassword(passWdUsr, salt);

                    Usuarios nuevoUsuario = new Usuarios
                    {
                        id_rol = rolPacienteId.Value,
                        nombre = nombre,
                        apellido = apellido,
                        correo = correoUsr,
                        telefono = nCelUsr_text,
                        contrasena = hash, // Guardar el HASH
                        salt = salt,       // Guardar el SALT
                        estado = true,
                        fecha_registro = DateTime.Now
                    };

                    db.Usuarios.InsertOnSubmit(nuevoUsuario);
                    db.SubmitChanges();

                    Pacientes nuevoPaciente = new Pacientes
                    {
                        id_usuario = nuevoUsuario.id_usuario,
                        id_terapeuta = null,
                        estado_tratamiento = "activo",
                        fecha_inicio_tratamiento = DateTime.Now
                    };

                    db.Pacientes.InsertOnSubmit(nuevoPaciente);
                    db.SubmitChanges();

                    MessageBox.Show("Usuario registrado exitosamente.", "Éxito", MessageBoxButton.OK, MessageBoxImage.Information);

                    Login loginWindow = new Login();
                    loginWindow.Show();
                    this.Close();
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Ocurrió un error al registrar usuario: {ex.Message}", "Error General", MessageBoxButton.OK, MessageBoxImage.Error);
                Debug.WriteLine($"Error SignUp: {ex.Message}");
            }
        }

        private void LoginTextBlock_MouseDown(object sender, MouseButtonEventArgs e)
        {
            Login loginWindow = new Login();
            loginWindow.Show();
            this.Close();
        }

        private void btnAtras_Click(object sender, RoutedEventArgs e)
        {
            MainWindow mainWindow = new MainWindow();
            mainWindow.Show();
            this.Close();
        }

        private void btnSalir_Click(object sender, RoutedEventArgs e)
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
}
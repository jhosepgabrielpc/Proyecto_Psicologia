using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Configuration; // Para la cadena de conexión
using System.Diagnostics; // Para Debug.WriteLine

namespace Proyecto_Gastronomia
{
    public partial class SignUp : Window
    {
        // Ajustamos los nombres de los campos de la nueva BD
        private const int MAX_LENGTH_NOMBRE = 100;
        private const int MAX_LENGTH_CORREO = 150;
        private const int MAX_LENGTH_CONTRASENA = 50; // Ajusta según tu BD

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

        // Valida el formato de correo electrónico.
        private bool EsFormatoCorreoValido(string email)
        {
            string pattern = @"^[a-zA-Z0-9._%+-]{3,}@[a-zA-Z0-9.-]{3,}\.[a-zA-Z]{2,}$";
            return Regex.IsMatch(email, pattern);
        }

        // --- CORREGIDO ---
        // Valida el nombre de usuario (solo formato, la BD validará unicidad de correo)
        private string ValidateNombre(string nombre)
        {
            if (string.IsNullOrWhiteSpace(nombre)) return "El nombre no puede estar vacío.";
            if (nombre.Length > MAX_LENGTH_NOMBRE) return $"El nombre no debe exceder los {MAX_LENGTH_NOMBRE} caracteres.";
            return null;
        }

        // --- CORREGIDO ---
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
            return null;
        }

        // Valida el número de celular (formato).
        private string ValidateNCelUsr(string nCelUsr_text)
        {
            if (string.IsNullOrWhiteSpace(nCelUsr_text)) return "El número de celular no puede estar vacío.";
            if (nCelUsr_text.Length < 8) return "El número de celular debe tener 8 dígitos o más.";
            // (Tu validación de 6 o 7 puede ser específica de Bolivia, la dejamos si quieres)
            // if (!Regex.IsMatch(nCelUsr_text, @"^[6-7]\d{7}$")) return "El número de celular debe empezar con 6 o 7.";
            return null;
        }

        // Valida la contraseña (longitud y complejidad).
        private string ValidatePassWdUsr(string passWdUsr)
        {
            if (string.IsNullOrWhiteSpace(passWdUsr)) return "La contraseña no puede estar vacía.";
            if (passWdUsr.Length < 8) return "La contraseña debe tener al menos 8 caracteres.";
            if (passWdUsr.Length > MAX_LENGTH_CONTRASENA) return $"La contraseña no debe exceder los {MAX_LENGTH_CONTRASENA} caracteres.";
            // (Puedes añadir más validaciones de complejidad aquí si quieres)
            return null;
        }

        // --- MÉTODO btnSignUp_Click TOTALMENTE CORREGIDO ---
        private void btnSignUp_Click(object sender, RoutedEventArgs e)
        {
            // Asumimos que 'txtNomUsr_SignUp' ahora es para 'Nombre'
            // y necesitamos un campo para 'Apellido' (que no tienes en el XAML original)
            // *** Solución temporal: Usamos el nombre para ambos ***
            string nombre = txtNomUsr_SignUp.Text.Trim();
            string apellido = txtNomUsr_SignUp.Text.Trim(); // *** OJO: Necesitarás un campo de Apellido ***

            string correoUsr = txtCorreoUsr_SignUp.Text.Trim();
            string nCelUsr_text = txtNCelUsr_SignUp.Text.Trim();
            string passWdUsr = txtPassWdUsr_SignUp.Password;
            string confirmPassWdUsr = txtConfirmPassWdUsr_SignUp.Password;

            // Validaciones de campos.
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
                MessageBox.Show("Las contraseñas no coinciden. Por favor, verifique.", "Advertencia", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            try
            {
                using (DataClasses1DataContext db = GetContext())
                {
                    // 1. Obtener el ID del rol "Paciente"
                    // Ojo: Usando plural 'Roles'
                    int? rolPacienteId = db.Roles.FirstOrDefault(r => r.nombre_rol == "Paciente")?.id_rol;
                    if (rolPacienteId == null)
                    {
                        MessageBox.Show("Error crítico: No se encontró el rol 'Paciente'.", "Error de BD", MessageBoxButton.OK, MessageBoxImage.Error);
                        return;
                    }

                    // 2. Crear el nuevo USUARIO
                    // Ojo: Usando plural 'Usuarios' y nombres de columna nuevos
                    Usuarios nuevoUsuario = new Usuarios
                    {
                        id_rol = rolPacienteId.Value,
                        nombre = nombre,
                        apellido = apellido, // Usando el nombre como apellido temporalmente
                        correo = correoUsr,
                        telefono = nCelUsr_text,
                        contrasena = passWdUsr,
                        estado = true, // Por defecto, un nuevo usuario está activo.
                        fecha_registro = DateTime.Now
                    };

                    db.Usuarios.InsertOnSubmit(nuevoUsuario);
                    db.SubmitChanges(); // Guarda el usuario para obtener su ID

                    // 3. Crear el nuevo PACIENTE
                    // Ojo: Usando plural 'Pacientes'
                    Pacientes nuevoPaciente = new Pacientes
                    {
                        id_usuario = nuevoUsuario.id_usuario, // El ID que acabamos de crear
                        id_terapeuta = null, // Sin terapeuta asignado al registrarse
                        estado_tratamiento = "activo",
                        fecha_inicio_tratamiento = DateTime.Now
                        // fecha_nacimiento, genero, historial_clinico son nulos por ahora
                    };

                    db.Pacientes.InsertOnSubmit(nuevoPaciente);
                    db.SubmitChanges(); // Guarda el paciente

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
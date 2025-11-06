using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Configuration;
using System.Diagnostics; // Añadido para Debug

namespace Proyecto_Gastronomia
{
    // --- CLASE DTO ---
    public class UsuarioDisplay
    {
        public int IdUsr { get; set; }
        public string NomUsr { get; set; }
        public string CorreoUsr { get; set; }
        public long NCelUsr { get; set; }
        public bool Estado { get; set; }
        public string PassWdUsr { get; set; }
    }


    public partial class AdmiUsuario : Window
    {
        private const int MAX_LENGTH_NOMUSR = 50;
        private const int MAX_LENGTH_CORREOUSR = 50;
        private const int MAX_LENGTH_PASSWDUSR_INPUT = 50;

        private int? selectedUserId;
        private string connectionString;

        public AdmiUsuario()
        {
            InitializeComponent();
            connectionString = ConfigurationManager.ConnectionStrings["mindcareConnectionString"].ConnectionString;
            CargarUsuarios();
            this.MouseLeftButtonDown += Window_MouseLeftButtonDown;
        }

        // --- CORRECCIÓN CS0161 ---
        // (Método GetContext COMPLETO)
        private DataClasses1DataContext GetContext()
        {
            return new DataClasses1DataContext(connectionString);
        }

        private void CargarUsuarios()
        {
            try
            {
                using (DataClasses1DataContext db = GetContext())
                {
                    // 1. Traer datos crudos
                    var datosDeDB = db.Usuarios.OrderBy(u => u.nombre).Select(u => new
                    {
                        u.id_usuario,
                        u.nombre,
                        u.apellido,
                        u.correo,
                        u.telefono,
                        u.estado,
                        u.contrasena
                    }).ToList();

                    // 2. Convertir en memoria
                    var usuarios = datosDeDB.Select(u => new UsuarioDisplay
                    {
                        IdUsr = u.id_usuario,
                        NomUsr = u.nombre + " " + u.apellido,
                        CorreoUsr = u.correo,
                        NCelUsr = long.TryParse(u.telefono, out long telefono) ? telefono : 0,
                        Estado = u.estado ?? true,
                        PassWdUsr = u.contrasena
                    }).ToList();

                    dgUsuarios.ItemsSource = usuarios;
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Ocurrió un error al cargar usuarios: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
                Debug.WriteLine($"Error CargarUsuarios: {ex.Message}");
            }
        }

        private void LimpiarCampos()
        {
            txtIdUsr.Clear();
            txtNomUsr.Clear();
            txtCorreoUsr.Clear();
            txtNCelUsr.Clear();
            txtPassWdUsr.Clear();
            chkEstado.IsChecked = true;
            selectedUserId = null;
        }

        private void DgUsuarios_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            if (dgUsuarios.SelectedItem is UsuarioDisplay selectedUser)
            {
                txtIdUsr.Text = selectedUser.IdUsr.ToString();
                txtNomUsr.Text = selectedUser.NomUsr;
                txtCorreoUsr.Text = selectedUser.CorreoUsr;
                txtNCelUsr.Text = selectedUser.NCelUsr.ToString();
                txtPassWdUsr.Text = selectedUser.PassWdUsr;
                chkEstado.IsChecked = selectedUser.Estado;
                selectedUserId = selectedUser.IdUsr;
            }
            else
            {
                LimpiarCampos();
            }
        }

        #region Validaciones de Campos

        private bool EsFormatoCorreoValido(string email)
        {
            string pattern = @"^[a-zA-Z0-9._%+-]{3,}@[a-zA-Z0-9.-]{3,}\.[a-zA-Z]{2,}$";
            return Regex.IsMatch(email, pattern);
        }

        private string ValidateNomUsr(string nomUsr, int? currentUserId)
        {
            if (string.IsNullOrWhiteSpace(nomUsr)) return "El nombre de usuario no puede estar vacío.";

            try
            {
                using (DataClasses1DataContext db = GetContext())
                {
                    if (db.Usuarios.Any(u => u.nombre.ToLower() == nomUsr.ToLower() && u.id_usuario != currentUserId))
                    {
                        return "El nombre de usuario ya existe.";
                    }
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error al verificar nombre de usuario: {ex.Message}", "Error de Validación", MessageBoxButton.OK, MessageBoxImage.Error);
                return "Error al verificar nombre de usuario.";
            }
            return null;
        }

        private string ValidateCorreoUsr(string correoUsr, int? currentUserId)
        {
            if (string.IsNullOrWhiteSpace(correoUsr)) return "El correo electrónico no puede estar vacío.";
            if (!EsFormatoCorreoValido(correoUsr)) return "Formato de correo no válido. (Ej: usuario@dominio.com)";

            try
            {
                using (DataClasses1DataContext db = GetContext())
                {
                    if (db.Usuarios.Any(u => u.correo.ToLower() == correoUsr.ToLower() && u.id_usuario != currentUserId))
                    {
                        return "El correo electrónico ya está registrado.";
                    }
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error al verificar correo electrónico: {ex.Message}", "Error de Validación", MessageBoxButton.OK, MessageBoxImage.Error);
                return "Error al verificar correo electrónico.";
            }
            return null;
        }

        private string ValidateNCelUsr(string nCelUsr_text)
        {
            if (string.IsNullOrWhiteSpace(nCelUsr_text)) return "El número de celular no puede estar vacío.";
            if (nCelUsr_text.Length < 8) return "El número de celular debe tener al menos 8 dígitos.";
            if (!long.TryParse(nCelUsr_text, out long numeroCelular)) return "El número de celular no es válido.";
            return null;
        }

        private string ValidatePassWdUsr(string passWdUsrText, bool isOptional = false)
        {
            if (string.IsNullOrWhiteSpace(passWdUsrText)) return isOptional ? null : "La contraseña no puede estar vacía.";
            return null;
        }

        // --- CORRECCIÓN CS0161 ---
        // (Método ValidarCamposParaEdicion COMPLETO)
        private bool ValidarCamposParaEdicion()
        {
            string nomUsr = txtNomUsr.Text.Trim();
            string correoUsr = txtCorreoUsr.Text.Trim();
            string nCelUsr_text = txtNCelUsr.Text.Trim();
            string passWdUsr = txtPassWdUsr.Text;

            if (string.IsNullOrWhiteSpace(nomUsr)) { MessageBox.Show("El nombre no puede estar vacío", "Advertencia", MessageBoxButton.OK, MessageBoxImage.Warning); return false; }

            string error = ValidateCorreoUsr(correoUsr, selectedUserId);
            if (error != null) { MessageBox.Show(error, "Advertencia", MessageBoxButton.OK, MessageBoxImage.Warning); return false; }

            error = ValidateNCelUsr(nCelUsr_text);
            if (error != null) { MessageBox.Show(error, "Advertencia", MessageBoxButton.OK, MessageBoxImage.Warning); return false; }

            error = ValidatePassWdUsr(passWdUsr, isOptional: true);
            if (error != null) { MessageBox.Show(error, "Advertencia", MessageBoxButton.OK, MessageBoxImage.Warning); return false; }

            return true; // <-- Devuelve un valor en la ruta exitosa
        }

        #endregion

        private void Nuevo_Click(object sender, RoutedEventArgs e)
        {
            SignUp signUpWindow = new SignUp();
            signUpWindow.ShowDialog();
            CargarUsuarios();
            LimpiarCampos();
        }

        private void Editar_Click(object sender, RoutedEventArgs e)
        {
            if (selectedUserId == null) { MessageBox.Show("Selecciona un usuario para editar.", "No Seleccionado", MessageBoxButton.OK, MessageBoxImage.Information); return; }
            if (!ValidarCamposParaEdicion()) return;

            string nombre = txtNomUsr.Text.Trim();
            string correo = txtCorreoUsr.Text.Trim();
            string telefono = txtNCelUsr.Text.Trim();
            string newPassWdUsr = txtPassWdUsr.Text;
            bool estado = chkEstado.IsChecked ?? false;

            try
            {
                using (DataClasses1DataContext db = GetContext())
                {
                    Usuarios userToUpdate = db.Usuarios.SingleOrDefault(u => u.id_usuario == selectedUserId.Value);

                    if (userToUpdate != null)
                    {
                        userToUpdate.nombre = nombre;
                        userToUpdate.correo = correo;
                        userToUpdate.telefono = telefono;
                        userToUpdate.estado = estado;

                        if (!string.IsNullOrWhiteSpace(newPassWdUsr) && newPassWdUsr != userToUpdate.contrasena)
                        {
                            string salt = PasswordManager.GenerateSalt();
                            string hash = PasswordManager.HashPassword(newPassWdUsr, salt);

                            userToUpdate.contrasena = hash;
                            userToUpdate.salt = salt;
                        }

                        db.SubmitChanges();
                        MessageBox.Show("Usuario actualizado exitosamente.", "Éxito", MessageBoxButton.OK, MessageBoxImage.Information);
                        LimpiarCampos();
                        CargarUsuarios();
                    }
                    else
                    {
                        MessageBox.Show("Usuario no encontrado para editar.", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
                    }
                }
            }
            // --- CORRECCIÓN CS0168 ---
            // (Usamos la variable 'ex' en el MessageBox)
            catch (Exception ex)
            {
                MessageBox.Show($"Ocurrió un error al editar usuario: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private void Eliminar_Click(object sender, RoutedEventArgs e)
        {
            if (selectedUserId == null)
            {
                MessageBox.Show("Selecciona un usuario para eliminar (desactivar).", "No Seleccionado", MessageBoxButton.OK, MessageBoxImage.Information);
                return;
            }

            MessageBoxResult result = MessageBox.Show(
                "¿Desactivar este usuario? (No se eliminará permanentemente)",
                "Confirmar Desactivación",
                MessageBoxButton.YesNo,
                MessageBoxImage.Question);

            if (result == MessageBoxResult.Yes)
            {
                try
                {
                    using (DataClasses1DataContext db = GetContext())
                    {
                        Usuarios userToDeactivate = db.Usuarios.SingleOrDefault(u => u.id_usuario == selectedUserId.Value);

                        if (userToDeactivate != null)
                        {
                            userToDeactivate.estado = false;
                            db.SubmitChanges();
                            MessageBox.Show("Usuario desactivado exitosamente.", "Éxito", MessageBoxButton.OK, MessageBoxImage.Information);
                            LimpiarCampos();
                            CargarUsuarios();
                        }
                        else
                        {
                            MessageBox.Show("Usuario no encontrado para desactivar.", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
                        }
                    }
                }
                catch (Exception ex)
                {
                    MessageBox.Show($"Ocurrió un error al desactivar usuario: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
                }
            }
        }

        private void btnAtras_Click(object sender, RoutedEventArgs e)
        {
            Administrador adminWindow = new Administrador();
            adminWindow.Show();
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
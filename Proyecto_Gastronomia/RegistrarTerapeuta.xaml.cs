using System;
using System.Collections.Generic;
using System.Configuration;
using System.Linq;
using System.Text.RegularExpressions;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Diagnostics;

namespace Proyecto_Gastronomia
{
    // --- CLASE DE DATOS NECESARIA (Arregla CS0246) ---
    public class TerapeutaData
    {
        public int IdUsuario { get; set; }
        public int IdTerapeuta { get; set; }
        public string Nombre { get; set; }
        public string Apellido { get; set; }
        public string Correo { get; set; }
        public string Telefono { get; set; }
        public string Especialidad { get; set; }
        public string NroLicencia { get; set; }
        public int? ExperienciaAnios { get; set; }
        public bool Estado { get; set; }
    }

    public partial class RegistrarTerapeuta : Window
    {
        private string connectionString;
        private TerapeutaData _terapeutaAEditar;
        private bool _modoEdicion = false;

        private DataClasses1DataContext GetContext()
        {
            return new DataClasses1DataContext(connectionString);
        }

        // (El método 'GetContent()' que causaba el error CS0161 ha sido eliminado)

        public RegistrarTerapeuta()
        {
            InitializeComponent();
            connectionString = ConfigurationManager.ConnectionStrings["mindcareConnectionString"].ConnectionString;
            this.MouseLeftButtonDown += Window_MouseLeftButtonDown;
            LimpiarCampos();
        }

        public RegistrarTerapeuta(TerapeutaData terapeutaParaEditar) : this()
        {
            _terapeutaAEditar = terapeutaParaEditar;
            _modoEdicion = true;
            CargarDatosParaEdicion();
        }

        private void LimpiarCampos()
        {
            txtNombre.Clear();
            txtApellido.Clear();
            txtCorreo.Clear();
            pbContrasena.Clear();
            txtTelefono.Clear();
            txtEspecialidad.Clear();
            txtNroLicencia.Clear();
            txtExperienciaAnios.Clear();
            chkEstado.IsChecked = true;
            txtCorreo.IsReadOnly = false;
            pbContrasena.IsEnabled = true;
            txtNombre.Focus();
            btnGuardar.Content = "Guardar";
            _terapeutaAEditar = null;
            _modoEdicion = false;
        }

        private void CargarDatosParaEdicion()
        {
            if (_terapeutaAEditar != null)
            {
                txtIdUsuario.Text = _terapeutaAEditar.IdUsuario.ToString();
                txtNombre.Text = _terapeutaAEditar.Nombre;
                txtApellido.Text = _terapeutaAEditar.Apellido;
                txtCorreo.Text = _terapeutaAEditar.Correo;
                txtTelefono.Text = _terapeutaAEditar.Telefono;
                chkEstado.IsChecked = _terapeutaAEditar.Estado;
                txtIdTerapeuta.Text = _terapeutaAEditar.IdTerapeuta.ToString();
                txtEspecialidad.Text = _terapeutaAEditar.Especialidad;
                txtNroLicencia.Text = _terapeutaAEditar.NroLicencia;
                txtExperienciaAnios.Text = _terapeutaAEditar.ExperienciaAnios?.ToString();
                txtCorreo.IsReadOnly = true;
                pbContrasena.IsEnabled = false;
                pbContrasena.Password = "********";
                btnGuardar.Content = "Actualizar";
            }
        }

        // --- MÉTODO 'ValidarCampos' COMPLETO (Corrige CS0161) ---
        private bool ValidarCampos()
        {
            if (string.IsNullOrWhiteSpace(txtNombre.Text) || string.IsNullOrWhiteSpace(txtApellido.Text) || string.IsNullOrWhiteSpace(txtCorreo.Text))
            {
                MessageBox.Show("Nombre, Apellido y Correo son obligatorios.", "Advertencia", MessageBoxButton.OK, MessageBoxImage.Warning);
                return false;
            }
            if (!_modoEdicion && string.IsNullOrWhiteSpace(pbContrasena.Password))
            {
                MessageBox.Show("La contraseña es obligatoria para nuevos terapeutas.", "Advertencia", MessageBoxButton.OK, MessageBoxImage.Warning);
                return false;
            }
            if (string.IsNullOrWhiteSpace(txtEspecialidad.Text) || string.IsNullOrWhiteSpace(txtNroLicencia.Text))
            {
                MessageBox.Show("Especialidad y Nro. Licencia son obligatorios.", "Advertencia", MessageBoxButton.OK, MessageBoxImage.Warning);
                return false;
            }
            if (!string.IsNullOrWhiteSpace(txtExperienciaAnios.Text) && (!int.TryParse(txtExperienciaAnios.Text, out int exp) || exp < 0))
            {
                MessageBox.Show("Años de experiencia debe ser un número positivo.", "Advertencia", MessageBoxButton.OK, MessageBoxImage.Warning);
                return false;
            }
            try
            {
                using (DataClasses1DataContext db = GetContext())
                {
                    string correoActual = txtCorreo.Text.Trim().ToLower();
                    Usuarios existingUser;
                    if (_modoEdicion)
                    {
                        existingUser = db.Usuarios
                                         .FirstOrDefault(u => u.correo.ToLower() == correoActual &&
                                                              u.id_usuario != _terapeutaAEditar.IdUsuario);
                    }
                    else
                    {
                        existingUser = db.Usuarios
                                         .FirstOrDefault(u => u.correo.ToLower() == correoActual);
                    }

                    if (existingUser != null)
                    {
                        MessageBox.Show("Ya existe un usuario registrado con ese correo.", "Advertencia", MessageBoxButton.OK, MessageBoxImage.Warning);
                        return false;
                    }
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error al validar correo: {ex.Message}", "Error de BD", MessageBoxButton.OK, MessageBoxImage.Error);
                return false;
            }
            return true;
        }

        private void btnGuardar_Click(object sender, RoutedEventArgs e)
        {
            if (!ValidarCampos()) return;
            try
            {
                using (DataClasses1DataContext db = GetContext())
                {
                    if (!_modoEdicion) // --- MODO NUEVO ---
                    {
                        int? rolTerapeutaId = db.Roles.FirstOrDefault(r => r.nombre_rol == "Terapeuta")?.id_rol;
                        if (rolTerapeutaId == null) { MessageBox.Show("Error: Rol 'Terapeuta' no encontrado."); return; }

                        string salt = PasswordManager.GenerateSalt();
                        string hash = PasswordManager.HashPassword(pbContrasena.Password, salt);

                        Usuarios nuevoUsuario = new Usuarios
                        {
                            id_rol = rolTerapeutaId.Value,
                            nombre = txtNombre.Text,
                            apellido = txtApellido.Text,
                            correo = txtCorreo.Text,
                            contrasena = hash,
                            salt = salt,
                            telefono = txtTelefono.Text,
                            estado = chkEstado.IsChecked ?? true,
                            fecha_registro = DateTime.Now
                        };
                        db.Usuarios.InsertOnSubmit(nuevoUsuario);
                        db.SubmitChanges();

                        Terapeutas nuevoTerapeuta = new Terapeutas
                        {
                            id_usuario = nuevoUsuario.id_usuario,
                            especialidad = txtEspecialidad.Text,
                            nro_licencia = txtNroLicencia.Text,
                            experiencia_anios = string.IsNullOrWhiteSpace(txtExperienciaAnios.Text) ? (int?)null : int.Parse(txtExperienciaAnios.Text)
                        };
                        db.Terapeutas.InsertOnSubmit(nuevoTerapeuta);

                        MessageBox.Show("Terapeuta registrado exitosamente.", "Éxito", MessageBoxButton.OK, MessageBoxImage.Information);
                    }
                    else // --- MODO EDICIÓN ---
                    {
                        Usuarios usuarioToUpdate = db.Usuarios.SingleOrDefault(u => u.id_usuario == _terapeutaAEditar.IdUsuario);
                        Terapeutas terapeutaToUpdate = db.Terapeutas.SingleOrDefault(t => t.id_terapeuta == _terapeutaAEditar.IdTerapeuta);

                        if (usuarioToUpdate != null && terapeutaToUpdate != null)
                        {
                            usuarioToUpdate.nombre = txtNombre.Text;
                            usuarioToUpdate.apellido = txtApellido.Text;
                            usuarioToUpdate.telefono = txtTelefono.Text;
                            usuarioToUpdate.estado = chkEstado.IsChecked ?? true;

                            terapeutaToUpdate.especialidad = txtEspecialidad.Text;
                            terapeutaToUpdate.nro_licencia = txtNroLicencia.Text;
                            terapeutaToUpdate.experiencia_anios = string.IsNullOrWhiteSpace(txtExperienciaAnios.Text) ? (int?)null : int.Parse(txtExperienciaAnios.Text);
                        }

                        MessageBox.Show("Terapeuta actualizado exitosamente.", "Éxito", MessageBoxButton.OK, MessageBoxImage.Information);
                    }
                    db.SubmitChanges();
                    this.DialogResult = true;
                    this.Close();
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Ocurrió un error al guardar: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
                Debug.WriteLine($"Error Guardar Terapeuta: {ex.Message}");
                this.DialogResult = false;
            }
        }

        private void btnLimpiar_Click(object sender, RoutedEventArgs e) { LimpiarCampos(); }
        private void btnVolver_Click(object sender, RoutedEventArgs e) { this.DialogResult = false; this.Close(); }
        private void btnAtras_Click(object sender, RoutedEventArgs e) { this.DialogResult = false; this.Close(); }
        private void btnSalir_Click(object sender, RoutedEventArgs e) { Application.Current.Shutdown(); }
        private void NumericInput_PreviewTextInput(object sender, TextCompositionEventArgs e)
        {
            Regex regex = new Regex("[^0-9]+");
            e.Handled = regex.IsMatch(e.Text);
        }
        private void NumericInput_Pasting(object sender, DataObjectPastingEventArgs e)
        {
            if (e.DataObject.GetDataPresent(typeof(String)))
            {
                String text = (String)e.DataObject.GetData(typeof(String));
                Regex regex = new Regex("[^0-9]+");
                if (regex.IsMatch(text))
                {
                    e.CancelCommand();
                }
            }
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
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
    public partial class RegistrarPaciente : Window
    {
        private string connectionString;
        private int? _pacienteParaEditarId;
        private bool _modoEdicion = false;

        public RegistrarPaciente()
        {
            InitializeComponent();
            connectionString = ConfigurationManager.ConnectionStrings["mindcareConnectionString"].ConnectionString;
            CargarTerapeutas();
            LimpiarCampos();
            this.MouseLeftButtonDown += Window_MouseLeftButtonDown;
        }

        public RegistrarPaciente(int idPaciente) : this()
        {
            _pacienteParaEditarId = idPaciente;
            _modoEdicion = true;
            CargarDatosParaEdicion();
        }

        private DataClasses1DataContext GetContext()
        {
            return new DataClasses1DataContext(connectionString);
        }

        private void CargarTerapeutas()
        {
            try
            {
                using (DataClasses1DataContext db = GetContext())
                {
                    var terapeutas = (from t in db.Terapeutas
                                      join u in db.Usuarios on t.id_usuario equals u.id_usuario
                                      where u.estado == true
                                      select new
                                      {
                                          IdTerapeuta = t.id_terapeuta,
                                          NombreCompleto = u.nombre + " " + u.apellido
                                      }).ToList();

                    cmbTerapeutas.ItemsSource = terapeutas;
                    cmbTerapeutas.DisplayMemberPath = "NombreCompleto";
                    cmbTerapeutas.SelectedValuePath = "IdTerapeuta";
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error al cargar terapeutas: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private void CargarDatosParaEdicion()
        {
            if (_pacienteParaEditarId == null) return;
            try
            {
                using (DataClasses1DataContext db = GetContext())
                {
                    var query = (from p in db.Pacientes
                                 join u in db.Usuarios on p.id_usuario equals u.id_usuario
                                 where p.id_paciente == _pacienteParaEditarId.Value
                                 select new { Paciente = p, Usuario = u }).FirstOrDefault();

                    if (query != null)
                    {
                        var paciente = query.Paciente;
                        var usuario = query.Usuario;

                        txtIdUsuario.Text = usuario.id_usuario.ToString();
                        txtIdPaciente.Text = paciente.id_paciente.ToString();
                        txtNombre.Text = usuario.nombre;
                        txtApellido.Text = usuario.apellido;
                        txtCorreo.Text = usuario.correo;
                        txtTelefono.Text = usuario.telefono;
                        chkEstado.IsChecked = usuario.estado ?? true;
                        cmbTerapeutas.SelectedValue = paciente.id_terapeuta;
                        dpFechaNacimiento.SelectedDate = paciente.fecha_nacimiento;
                        txtGenero.Text = paciente.genero;
                        txtEstadoTratamiento.Text = paciente.estado_tratamiento;
                        txtHistorialClinico.Text = paciente.historial_clinico;

                        txtCorreo.IsReadOnly = true;
                        pbContrasena.IsEnabled = false;
                        pbContrasena.Password = "********";
                    }
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error al cargar datos del paciente: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
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
                        int? rolPacienteId = db.Roles.FirstOrDefault(r => r.nombre_rol == "Paciente")?.id_rol;
                        if (rolPacienteId == null) { MessageBox.Show("Error: Rol 'Paciente' no encontrado."); return; }

                        string salt = PasswordManager.GenerateSalt();
                        string hash = PasswordManager.HashPassword(pbContrasena.Password, salt);

                        Usuarios nuevoUsuario = new Usuarios
                        {
                            id_rol = rolPacienteId.Value,
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

                        Pacientes nuevoPaciente = new Pacientes
                        {
                            id_usuario = nuevoUsuario.id_usuario,
                            id_terapeuta = (int?)cmbTerapeutas.SelectedValue,
                            fecha_nacimiento = dpFechaNacimiento.SelectedDate,
                            genero = txtGenero.Text,
                            historial_clinico = txtHistorialClinico.Text,
                            estado_tratamiento = txtEstadoTratamiento.Text,
                            fecha_inicio_tratamiento = DateTime.Now
                        };
                        db.Pacientes.InsertOnSubmit(nuevoPaciente);
                        db.SubmitChanges();
                        MessageBox.Show("Paciente registrado exitosamente.", "Éxito", MessageBoxButton.OK, MessageBoxImage.Information);
                    }
                    else // --- MODO EDICIÓN ---
                    {
                        Pacientes pacienteToUpdate = db.Pacientes.SingleOrDefault(p => p.id_paciente == _pacienteParaEditarId.Value);
                        if (pacienteToUpdate != null)
                        {
                            Usuarios usuarioToUpdate = db.Usuarios.SingleOrDefault(u => u.id_usuario == pacienteToUpdate.id_usuario);
                            if (usuarioToUpdate != null)
                            {
                                usuarioToUpdate.nombre = txtNombre.Text;
                                usuarioToUpdate.apellido = txtApellido.Text;
                                usuarioToUpdate.telefono = txtTelefono.Text;
                                usuarioToUpdate.estado = chkEstado.IsChecked ?? true;
                            }

                            pacienteToUpdate.id_terapeuta = (int?)cmbTerapeutas.SelectedValue;
                            pacienteToUpdate.fecha_nacimiento = dpFechaNacimiento.SelectedDate;
                            pacienteToUpdate.genero = txtGenero.Text;
                            pacienteToUpdate.historial_clinico = txtHistorialClinico.Text;
                            pacienteToUpdate.estado_tratamiento = txtEstadoTratamiento.Text;

                            db.SubmitChanges();
                            MessageBox.Show("Paciente actualizado exitosamente.", "Éxito", MessageBoxButton.OK, MessageBoxImage.Information);
                        }
                    }
                    this.DialogResult = true;
                    this.Close();
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Ocurrió un error al guardar: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
                Debug.WriteLine($"Error Guardar Paciente: {ex.Message}");
                this.DialogResult = false;
            }
        }

        // --- MÉTODO 'ValidarCampos' CON LA NUEVA VALIDACIÓN DE FECHA ---
        private bool ValidarCampos()
        {
            string correo = txtCorreo.Text;
            string telefono = txtTelefono.Text;

            if (string.IsNullOrWhiteSpace(txtNombre.Text) ||
                string.IsNullOrWhiteSpace(txtApellido.Text) ||
                string.IsNullOrWhiteSpace(correo))
            {
                MessageBox.Show("Completa Nombre, Apellido y Correo.", "Campos Incompletos", MessageBoxButton.OK, MessageBoxImage.Warning);
                return false;
            }
            if (!_modoEdicion && string.IsNullOrWhiteSpace(pbContrasena.Password))
            {
                MessageBox.Show("Debe ingresar una contraseña para el nuevo paciente.", "Campos Incompletos", MessageBoxButton.OK, MessageBoxImage.Warning);
                return false;
            }

            // --- VALIDACIÓN DE FECHA (MODIFICADA) ---
            if (dpFechaNacimiento.SelectedDate == null)
            {
                MessageBox.Show("Debe seleccionar una fecha de nacimiento.", "Campos Incompletos", MessageBoxButton.OK, MessageBoxImage.Warning);
                return false;
            }
            // ¡NUEVA LÍNEA!
            if (dpFechaNacimiento.SelectedDate.Value > DateTime.Now)
            {
                MessageBox.Show("La fecha de nacimiento no puede ser en el futuro.", "Validación", MessageBoxButton.OK, MessageBoxImage.Warning);
                return false;
            }
            // --- FIN DE LA MODIFICACIÓN ---

            // Validación de Correo
            if (!ValidationManager.IsEmailValid(correo))
            {
                MessageBox.Show("El formato del correo electrónico no es válido.", "Validación", MessageBoxButton.OK, MessageBoxImage.Warning);
                return false;
            }
            try
            {
                using (DataClasses1DataContext db = GetContext())
                {
                    int? currentUserId = _modoEdicion ? (int?)int.Parse(txtIdUsuario.Text) : null;
                    if (!ValidationManager.IsEmailUnique(correo, currentUserId, db))
                    {
                        MessageBox.Show("Ese correo electrónico ya está registrado.", "Validación", MessageBoxButton.OK, MessageBoxImage.Warning);
                        return false;
                    }
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error al validar correo: {ex.Message}", "Error de BD", MessageBoxButton.OK, MessageBoxImage.Error);
                return false;
            }

            // Validación de Teléfono
            if (!ValidationManager.IsPhoneValid(telefono))
            {
                MessageBox.Show("El teléfono debe tener 8 dígitos y empezar con 6 o 7.", "Validación", MessageBoxButton.OK, MessageBoxImage.Warning);
                return false;
            }

            return true; // Devuelve true si todo es válido
        }
        // --- FIN DEL MÉTODO ValidarCampos ---

        private void LimpiarCampos()
        {
            txtIdUsuario.Clear();
            txtIdPaciente.Clear();
            txtNombre.Clear();
            txtApellido.Clear();
            txtCorreo.Clear();
            pbContrasena.Clear();
            txtTelefono.Clear();
            chkEstado.IsChecked = true;
            cmbTerapeutas.SelectedIndex = -1;
            dpFechaNacimiento.SelectedDate = null;
            txtGenero.Clear();
            txtEstadoTratamiento.Text = "activo";
            txtHistorialClinico.Clear();
            _pacienteParaEditarId = null;
            _modoEdicion = false;
            txtCorreo.IsReadOnly = false;
            pbContrasena.IsEnabled = true;
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
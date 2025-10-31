using System;
using System.Collections.Generic;
using System.Configuration; // Para App.config
using System.Linq;
using System.Text.RegularExpressions; // Para validación numérica
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;

namespace Proyecto_Gastronomia
{
    public partial class RegistrarPaciente : Window
    {
        private string connectionString;
        private int? _pacienteParaEditarId; // Contiene el ID si es edición.

        // --- CONSTRUCTORES ---

        // Constructor para NUEVO Paciente (llamado desde AdmiPacientes)
        public RegistrarPaciente()
        {
            InitializeComponent();
            connectionString = ConfigurationManager.ConnectionStrings["mindcareConnectionString"].ConnectionString;
            CargarTerapeutas();
            LimpiarCampos();
            this.MouseLeftButtonDown += Window_MouseLeftButtonDown;
        }

        // Constructor para EDITAR Paciente (llamado desde AdmiPacientes)
        public RegistrarPaciente(int idPaciente) : this() // Llama al constructor base
        {
            _pacienteParaEditarId = idPaciente;
            CargarDatosPacienteParaEdicion();
        }

        private DataClasses1DataContext GetContext()
        {
            return new DataClasses1DataContext(connectionString);
        }

        // --- Carga de Datos ---

        private void CargarTerapeutas()
        {
            try
            {
                using (DataClasses1DataContext db = GetContext())
                {
                    // Obtiene terapeutas activos
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

        private void CargarDatosPacienteParaEdicion()
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

                        // Llenar campos
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

                        // Deshabilitar campos de login en modo edición
                        txtCorreo.IsReadOnly = true;
                        pbContrasena.IsEnabled = false;
                        pbContrasena.Password = "********"; // Placeholder
                    }
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error al cargar datos del paciente: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        // --- Botones de Acción ---

        private void btnGuardar_Click(object sender, RoutedEventArgs e)
        {
            if (!ValidarCampos()) return;

            try
            {
                using (DataClasses1DataContext db = GetContext())
                {
                    // --- MODO NUEVO ---
                    if (_pacienteParaEditarId == null)
                    {
                        // 1. Obtener el ID del rol "Paciente"
                        int? rolPacienteId = db.Roles.FirstOrDefault(r => r.nombre_rol == "Paciente")?.id_rol;
                        if (rolPacienteId == null)
                        {
                            MessageBox.Show("Error crítico: No se encontró el rol 'Paciente'.", "Error de BD", MessageBoxButton.OK, MessageBoxImage.Error);
                            return;
                        }

                        // 2. Crear el USUARIO
                        Usuarios nuevoUsuario = new Usuarios
                        {
                            id_rol = rolPacienteId.Value,
                            nombre = txtNombre.Text,
                            apellido = txtApellido.Text,
                            correo = txtCorreo.Text,
                            contrasena = pbContrasena.Password, // ¡Recuerda hashear esto en un proyecto real!
                            telefono = txtTelefono.Text,
                            estado = chkEstado.IsChecked ?? true,
                            fecha_registro = DateTime.Now
                        };
                        db.Usuarios.InsertOnSubmit(nuevoUsuario);

                        // 3. Guardar cambios para obtener el ID del nuevo usuario
                        db.SubmitChanges();

                        // 4. Crear el PACIENTE
                        Pacientes nuevoPaciente = new Pacientes
                        {
                            id_usuario = nuevoUsuario.id_usuario, // ID recién creado
                            id_terapeuta = (int?)cmbTerapeutas.SelectedValue,
                            fecha_nacimiento = dpFechaNacimiento.SelectedDate,
                            genero = txtGenero.Text,
                            historial_clinico = txtHistorialClinico.Text,
                            estado_tratamiento = txtEstadoTratamiento.Text,
                            fecha_inicio_tratamiento = DateTime.Now
                        };
                        db.Pacientes.InsertOnSubmit(nuevoPaciente);

                        // 5. Guardar Paciente
                        db.SubmitChanges();
                        MessageBox.Show("Paciente registrado exitosamente.", "Éxito", MessageBoxButton.OK, MessageBoxImage.Information);
                    }
                    // --- MODO EDICIÓN ---
                    else
                    {
                        Pacientes pacienteToUpdate = db.Pacientes.SingleOrDefault(p => p.id_paciente == _pacienteParaEditarId.Value);
                        if (pacienteToUpdate != null)
                        {
                            Usuarios usuarioToUpdate = db.Usuarios.SingleOrDefault(u => u.id_usuario == pacienteToUpdate.id_usuario);
                            if (usuarioToUpdate != null)
                            {
                                // Actualizar Usuario
                                usuarioToUpdate.nombre = txtNombre.Text;
                                usuarioToUpdate.apellido = txtApellido.Text;
                                usuarioToUpdate.telefono = txtTelefono.Text;
                                usuarioToUpdate.estado = chkEstado.IsChecked ?? true;
                                // No actualizamos correo ni contraseña desde aquí
                            }

                            // Actualizar Paciente
                            pacienteToUpdate.id_terapeuta = (int?)cmbTerapeutas.SelectedValue;
                            pacienteToUpdate.fecha_nacimiento = dpFechaNacimiento.SelectedDate;
                            pacienteToUpdate.genero = txtGenero.Text;
                            pacienteToUpdate.historial_clinico = txtHistorialClinico.Text;
                            pacienteToUpdate.estado_tratamiento = txtEstadoTratamiento.Text;

                            db.SubmitChanges();
                            MessageBox.Show("Paciente actualizado exitosamente.", "Éxito", MessageBoxButton.OK, MessageBoxImage.Information);
                        }
                    }

                    this.DialogResult = true; // Indica éxito a AdmiPacientes
                    this.Close();
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Ocurrió un error al guardar: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
                this.DialogResult = false;
            }
        }

        private bool ValidarCampos()
        {
            if (string.IsNullOrWhiteSpace(txtNombre.Text) ||
                string.IsNullOrWhiteSpace(txtApellido.Text) ||
                string.IsNullOrWhiteSpace(txtCorreo.Text))
            {
                MessageBox.Show("Completa Nombre, Apellido y Correo.", "Campos Incompletos", MessageBoxButton.OK, MessageBoxImage.Warning);
                return false;
            }

            // Validar contraseña solo si es un NUEVO paciente
            if (_pacienteParaEditarId == null && string.IsNullOrWhiteSpace(pbContrasena.Password))
            {
                MessageBox.Show("Debe ingresar una contraseña para el nuevo paciente.", "Campos Incompletos", MessageBoxButton.OK, MessageBoxImage.Warning);
                return false;
            }

            // Validar fecha de nacimiento
            if (dpFechaNacimiento.SelectedDate == null)
            {
                MessageBox.Show("Debe seleccionar una fecha de nacimiento.", "Campos Incompletos", MessageBoxButton.OK, MessageBoxImage.Warning);
                return false;
            }

            return true;
        }

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
            txtEstadoTratamiento.Text = "activo"; // Valor por defecto
            txtHistorialClinico.Clear();

            _pacienteParaEditarId = null;
            txtCorreo.IsReadOnly = false;
            pbContrasena.IsEnabled = true;
        }

        private void btnLimpiar_Click(object sender, RoutedEventArgs e)
        {
            LimpiarCampos();
        }

        // --- Navegación y Validación ---

        private void btnVolver_Click(object sender, RoutedEventArgs e)
        {
            this.DialogResult = false; // Indica que no hubo cambios
            this.Close();
        }

        private void btnAtras_Click(object sender, RoutedEventArgs e)
        {
            this.DialogResult = false;
            this.Close();
        }

        private void btnSalir_Click(object sender, RoutedEventArgs e)
        {
            Application.Current.Shutdown();
        }

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
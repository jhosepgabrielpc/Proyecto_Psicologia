using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Diagnostics;
using System.Configuration;

namespace Proyecto_Gastronomia
{
    // --- CLASES DE DATOS (DTOs) PARA ESTA VENTANA ---

    public class PacienteDisplay
    {
        public int IdPaciente { get; set; }
        public int IdUsuario { get; set; }
        public string Nombre { get; set; }
        public string Apellido { get; set; }
        public string Correo { get; set; }
        public string Telefono { get; set; }
        public DateTime? FechaNacimiento { get; set; }
        public string Genero { get; set; }
        public string HistorialClinico { get; set; }
        public string EstadoTratamiento { get; set; }
        public bool EstadoUsuario { get; set; }
        public int? IdTerapeuta { get; set; }
        public string NombreTerapeuta { get; set; }
    }

    // --- ¡CLASE RENOMBRADA! ---
    // Renombrada de 'TerapeutaData' a 'TerapeutaComboBoxItem' para evitar conflictos
    public class TerapeutaComboBoxItem
    {
        public int IdTerapeuta { get; set; }
        public string NombreCompleto { get; set; }
    }


    // --- VENTANA PRINCIPAL ---
    public partial class AdmiPacientes : Window
    {
        private MindcareDataService _dataService;

        public AdmiPacientes()
        {
            InitializeComponent();
            _dataService = new MindcareDataService();
            CargarTerapeutas();
            CargarPacientes();
        }

        private void CargarTerapeutas()
        {
            try
            {
                // Ahora usa la clase 'TerapeutaComboBoxItem'
                var terapeutas = _dataService.ObtenerTodosLosTerapeutas();
                cmbTerapeutas.ItemsSource = terapeutas;
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error al cargar terapeutas: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
                Debug.WriteLine($"ERROR en CargarTerapeutas: {ex.ToString()}");
            }
        }

        private void CargarPacientes()
        {
            try
            {
                var pacientesList = _dataService.ObtenerTodosLosPacientesDisplay();
                dgPacientes.ItemsSource = pacientesList;
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error inesperado al cargar pacientes: {ex.Message}", "Error General", MessageBoxButton.OK, MessageBoxImage.Error);
                Debug.WriteLine($"CRITICAL ERROR en CargarPacientes: {ex.ToString()}");
            }
        }

        private void DgPacientes_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            if (dgPacientes.SelectedItem is PacienteDisplay selectedPaciente)
            {
                txtIdPaciente.Text = selectedPaciente.IdPaciente.ToString();
                txtNombre.Text = selectedPaciente.Nombre;
                txtApellido.Text = selectedPaciente.Apellido;
                txtCorreo.Text = selectedPaciente.Correo;
                txtEstadoTratamiento.Text = selectedPaciente.EstadoTratamiento;
                txtHistorialClinico.Text = selectedPaciente.HistorialClinico;
                chkEstadoUsuario.IsChecked = selectedPaciente.EstadoUsuario;

                if (selectedPaciente.IdTerapeuta.HasValue)
                {
                    cmbTerapeutas.SelectedValue = selectedPaciente.IdTerapeuta.Value;
                }
                else
                {
                    cmbTerapeutas.SelectedIndex = -1;
                }
            }
            else
            {
                LimpiarCampos();
            }
        }

        private void LimpiarCampos()
        {
            txtIdPaciente.Clear();
            txtNombre.Clear();
            txtApellido.Clear();
            txtCorreo.Clear();
            cmbTerapeutas.SelectedIndex = -1;
            chkEstadoUsuario.IsChecked = false;
            txtEstadoTratamiento.Clear();
            txtHistorialClinico.Clear();
        }

        private void btnNuevo_Click(object sender, RoutedEventArgs e)
        {
            RegistrarPaciente registrarPacienteWindow = new RegistrarPaciente();
            registrarPacienteWindow.ShowDialog();
            CargarPacientes();
            LimpiarCampos();
        }

        private void btnEditar_Click(object sender, RoutedEventArgs e)
        {
            if (dgPacientes.SelectedItem is PacienteDisplay selectedPaciente)
            {
                RegistrarPaciente registrarPacienteWindow = new RegistrarPaciente(selectedPaciente.IdPaciente);
                registrarPacienteWindow.ShowDialog();
                CargarPacientes();
                LimpiarCampos();
            }
            else
            {
                MessageBox.Show("Por favor, selecciona un paciente para editar.", "Advertencia", MessageBoxButton.OK, MessageBoxImage.Warning);
            }
        }

        private void btnEliminar_Click(object sender, RoutedEventArgs e)
        {
            if (dgPacientes.SelectedItem is PacienteDisplay selectedPaciente)
            {
                MessageBoxResult result = MessageBox.Show(
                    $"¿Estás seguro de que quieres DESACTIVAR al usuario '{selectedPaciente.Nombre} {selectedPaciente.Apellido}'?",
                    "Confirmar Desactivación",
                    MessageBoxButton.YesNo,
                    MessageBoxImage.Question);

                if (result == MessageBoxResult.Yes)
                {
                    try
                    {
                        bool exito = _dataService.DesactivarUsuario(selectedPaciente.IdUsuario);
                        if (exito)
                        {
                            MessageBox.Show("Usuario desactivado exitosamente.", "Éxito", MessageBoxButton.OK, MessageBoxImage.Information);
                            CargarPacientes();
                        }
                        else
                        {
                            MessageBox.Show("Usuario no encontrado para desactivar.", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
                        }
                    }
                    catch (Exception ex)
                    {
                        MessageBox.Show($"Ocurrió un error al desactivar el usuario: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
                        Debug.WriteLine($"ERROR en btnEliminar_Click: {ex.ToString()}");
                    }
                }
            }
            else
            {
                MessageBox.Show("Por favor, selecciona un paciente para desactivar.", "Advertencia", MessageBoxButton.OK, MessageBoxImage.Warning);
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
    }

    // --- CAPA DE SERVICIO DE DATOS ---
    public class MindcareDataService
    {
        private string connectionString;

        public MindcareDataService()
        {
            connectionString = ConfigurationManager.ConnectionStrings["mindcareConnectionString"].ConnectionString;
        }

        private DataClasses1DataContext GetContext()
        {
            return new DataClasses1DataContext(connectionString);
        }

        // --- ¡MÉTODO CORREGIDO! ---
        // Ahora devuelve una lista de la clase 'TerapeutaComboBoxItem'
        public List<TerapeutaComboBoxItem> ObtenerTodosLosTerapeutas()
        {
            using (DataClasses1DataContext db = GetContext())
            {
                // Ojo: Usando plural 'Terapeutas' y 'Usuarios'
                return (from t in db.Terapeutas
                        join u in db.Usuarios on t.id_usuario equals u.id_usuario
                        where u.estado == true
                        // --- ¡CLASE CORREGIDA! ---
                        // (Esta era la línea 216 que daba error)
                        select new TerapeutaComboBoxItem
                        {
                            IdTerapeuta = t.id_terapeuta,
                            NombreCompleto = u.nombre + " " + u.apellido
                        }).ToList();
            }
        }

        public List<PacienteDisplay> ObtenerTodosLosPacientesDisplay()
        {
            using (DataClasses1DataContext db = GetContext())
            {
                // Ojo: Usando plural 'Pacientes', 'Usuarios', 'Terapeutas'
                return (from p in db.Pacientes
                        join u in db.Usuarios on p.id_usuario equals u.id_usuario
                        join t in db.Terapeutas on p.id_terapeuta equals t.id_terapeuta into tj
                        from terapeuta in tj.DefaultIfEmpty()
                        join ut in db.Usuarios on terapeuta.id_usuario equals ut.id_usuario into utj
                        from terapeutaUsuario in utj.DefaultIfEmpty()
                        select new PacienteDisplay
                        {
                            IdPaciente = p.id_paciente,
                            IdUsuario = u.id_usuario,
                            Nombre = u.nombre,
                            Apellido = u.apellido,
                            Correo = u.correo,
                            Telefono = u.telefono,
                            FechaNacimiento = p.fecha_nacimiento,
                            Genero = p.genero,
                            HistorialClinico = p.historial_clinico,
                            EstadoTratamiento = p.estado_tratamiento,
                            EstadoUsuario = u.estado ?? true,
                            IdTerapeuta = p.id_terapeuta,
                            NombreTerapeuta = (terapeutaUsuario == null) ? "No asignado" : (terapeutaUsuario.nombre + " " + terapeutaUsuario.apellido)
                        }).ToList();
            }
        }

        public bool DesactivarUsuario(int idUsuario)
        {
            using (DataClasses1DataContext db = GetContext())
            {
                // Ojo: Usando plural 'Usuarios'
                Usuarios usuarioToDeactivate = db.Usuarios.SingleOrDefault(u => u.id_usuario == idUsuario);

                if (usuarioToDeactivate != null)
                {
                    usuarioToDeactivate.estado = false;
                    db.SubmitChanges();
                    return true;
                }
                return false;
            }
        }
    }
}
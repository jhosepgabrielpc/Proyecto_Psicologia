using System;
using System.Collections.Generic;
using System.Configuration; // Para leer App.config
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Diagnostics; // Añadido para Debug.WriteLine

namespace Proyecto_Gastronomia
{
    // --- CLASES DE DATOS (DTOs) ---

    // Para mostrar en el DataGrid
    public class TerapeutaDisplay
    {
        public int IdUsuario { get; set; }
        public int IdTerapeuta { get; set; }
        public string Nombre { get; set; }
        public string Apellido { get; set; }
        public string Correo { get; set; }
        public string Especialidad { get; set; }
        public string NroLicencia { get; set; }
        public int? ExperienciaAnios { get; set; }
        public bool Estado { get; set; }
    }

    // --- CLASE AÑADIDA PARA CORREGIR LOS 8 ERRORES CS0117 ---
    // Para pasar datos a la ventana de edición/registro
    


    // --- VENTANA PRINCIPAL ---

    public partial class AdmiTerapeutas : Window
    {
        private string connectionString;
        private int? selectedUsuarioId;

        public AdmiTerapeutas()
        {
            InitializeComponent();
            connectionString = ConfigurationManager.ConnectionStrings["mindcareConnectionString"].ConnectionString;
            CargarTerapeutas();
            this.MouseLeftButtonDown += Window_MouseLeftButtonDown;
        }

        private DataClasses1DataContext GetContext()
        {
            return new DataClasses1DataContext(connectionString);
        }

        public void CargarTerapeutas()
        {
            try
            {
                using (DataClasses1DataContext db = GetContext())
                {
                    // Ojo: Usando nombres en plural (Terapeutas, Usuarios, Roles)
                    var terapeutasDB = from t in db.Terapeutas
                                       join u in db.Usuarios on t.id_usuario equals u.id_usuario
                                       join r in db.Roles on u.id_rol equals r.id_rol
                                       where r.nombre_rol == "Terapeuta"
                                       orderby u.apellido
                                       select new TerapeutaDisplay
                                       {
                                           IdUsuario = u.id_usuario,
                                           IdTerapeuta = t.id_terapeuta,
                                           Nombre = u.nombre,
                                           Apellido = u.apellido,
                                           Correo = u.correo,
                                           Especialidad = t.especialidad,
                                           NroLicencia = t.nro_licencia,
                                           ExperienciaAnios = t.experiencia_anios,
                                           Estado = u.estado ?? true
                                       };

                    dgTerapeutas.ItemsSource = terapeutasDB.ToList();
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error al cargar terapeutas: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
                Debug.WriteLine($"Error CargarTerapeutas: {ex.Message}");
            }
        }

        private void LimpiarCampos()
        {
            txtIdUsuario.Clear();
            txtNombre.Clear();
            txtApellido.Clear();
            txtCorreo.Clear();
            txtEspecialidad.Clear();
            txtNroLicencia.Clear();
            chkEstado.IsChecked = false;
            selectedUsuarioId = null;
            dgTerapeutas.SelectedItem = null;
        }

        private void DgTerapeutas_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            if (dgTerapeutas.SelectedItem is TerapeutaDisplay selectedTerapeuta)
            {
                txtIdUsuario.Text = selectedTerapeuta.IdUsuario.ToString();
                txtNombre.Text = selectedTerapeuta.Nombre;
                txtApellido.Text = selectedTerapeuta.Apellido;
                txtCorreo.Text = selectedTerapeuta.Correo;
                txtEspecialidad.Text = selectedTerapeuta.Especialidad;
                txtNroLicencia.Text = selectedTerapeuta.NroLicencia;
                chkEstado.IsChecked = selectedTerapeuta.Estado;
                selectedUsuarioId = selectedTerapeuta.IdUsuario;
            }
            else
            {
                LimpiarCampos();
            }
        }

        private void Nuevo_Click(object sender, RoutedEventArgs e)
        {
            // Este es uno de los errores (CS0246)
            RegistrarTerapeuta registrarTerapeutaWindow = new RegistrarTerapeuta();
            bool? result = registrarTerapeutaWindow.ShowDialog();

            if (result == true)
            {
                CargarTerapeutas();
                LimpiarCampos();
            }
        }

        private void Editar_Click(object sender, RoutedEventArgs e)
        {
            if (dgTerapeutas.SelectedItem is TerapeutaDisplay selectedTerapeuta)
            {
                // Ahora 'TerapeutaData' SÍ existe (la añadimos arriba)
                TerapeutaData terapeutaParaEditar = new TerapeutaData
                {
                    IdUsuario = selectedTerapeuta.IdUsuario,
                    IdTerapeuta = selectedTerapeuta.IdTerapeuta,
                    Nombre = selectedTerapeuta.Nombre,
                    Apellido = selectedTerapeuta.Apellido,
                    Correo = selectedTerapeuta.Correo,
                    Especialidad = selectedTerapeuta.Especialidad,
                    NroLicencia = selectedTerapeuta.NroLicencia,
                    ExperienciaAnios = selectedTerapeuta.ExperienciaAnios,
                    Estado = selectedTerapeuta.Estado
                    // 'Telefono' no se está cargando aquí, podemos añadirlo luego si es necesario
                };

                // Este es el otro error (CS0246)
                RegistrarTerapeuta registrarTerapeutaWindow = new RegistrarTerapeuta(terapeutaParaEditar);
                bool? result = registrarTerapeutaWindow.ShowDialog();

                if (result == true)
                {
                    CargarTerapeutas();
                    LimpiarCampos();
                }
            }
            else
            {
                MessageBox.Show("Por favor, selecciona un terapeuta para editar.", "No Seleccionado", MessageBoxButton.OK, MessageBoxImage.Information);
            }
        }

        private void Eliminar_Click(object sender, RoutedEventArgs e)
        {
            if (selectedUsuarioId == null)
            {
                MessageBox.Show("Seleccione un terapeuta para desactivar.", "No Seleccionado", MessageBoxButton.OK, MessageBoxImage.Information);
                return;
            }

            MessageBoxResult result = MessageBox.Show(
                $"¿Seguro que desea desactivar a este usuario terapeuta?",
                "Confirmar Desactivación",
                MessageBoxButton.YesNo,
                MessageBoxImage.Question);

            if (result == MessageBoxResult.Yes)
            {
                try
                {
                    using (DataClasses1DataContext db = GetContext())
                    {
                        // Ojo: Usando plural 'Usuarios'
                        Usuarios usuarioToDeactivate = db.Usuarios.SingleOrDefault(u => u.id_usuario == selectedUsuarioId.Value);

                        if (usuarioToDeactivate != null)
                        {
                            usuarioToDeactivate.estado = false;
                            db.SubmitChanges();
                            MessageBox.Show("Terapeuta desactivado exitosamente.", "Éxito", MessageBoxButton.OK, MessageBoxImage.Information);
                            LimpiarCampos();
                            CargarTerapeutas();
                        }
                        else
                        {
                            MessageBox.Show("Usuario no encontrado para desactivar.", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
                        }
                    }
                }
                catch (Exception ex)
                {
                    MessageBox.Show($"Ocurrió un error al desactivar al terapeuta: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
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
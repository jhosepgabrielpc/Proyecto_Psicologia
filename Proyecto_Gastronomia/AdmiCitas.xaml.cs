using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Effects;
using System.Configuration; // Para la cadena de conexión
using System.Diagnostics; // Para Debug.WriteLine

namespace Proyecto_Gastronomia
{
    // --- CLASES DE DATOS (DTOs) ---
    // (TerapeutaComboBoxItem se leerá desde AdmiPacientes.xaml.cs)

    // Para las tarjetas de Citas
    public class CitaDisplay
    {
        public int IdCita { get; set; }
        public string NombrePaciente { get; set; }
        public DateTime fecha_hora { get; set; }
        public string Modalidad { get; set; }
        public string Estado { get; set; }
        public string EnlaceSesion { get; set; }
    }


    // --- VENTANA PRINCIPAL ---

    public partial class AdmiCitas : Window
    {
        // --- CORRECCIÓN 1 ---
        // La lista ahora es del tipo 'TerapeutaComboBoxItem'
        private List<TerapeutaComboBoxItem> allTerapeutas; // Lista para el ComboBox.
        private string connectionString;

        //inicio de citas
        public AdmiCitas()
        {
            InitializeComponent();
            connectionString = ConfigurationManager.ConnectionStrings["mindcareConnectionString"].ConnectionString;
        }

        private DataClasses1DataContext GetContext()
        {
            return new DataClasses1DataContext(connectionString);
        }

        private void Window_Loaded(object sender, RoutedEventArgs e)
        {
            CargarTerapeutasEnComboBox();
        }

        private void CargarTerapeutasEnComboBox()
        {
            // --- CORRECCIÓN 2 ---
            allTerapeutas = new List<TerapeutaComboBoxItem>();

            try
            {
                using (DataClasses1DataContext db = GetContext())
                {
                    // Ojo: Usando plurales 'Terapeutas' y 'Usuarios'
                    var terapeutasDB = (from t in db.Terapeutas
                                        join u in db.Usuarios on t.id_usuario equals u.id_usuario
                                        where u.estado == true
                                        orderby u.apellido
                                        // --- CORRECCIÓN 3 (Esta era la línea 70) ---
                                        // Ahora crea la clase correcta
                                        select new TerapeutaComboBoxItem
                                        {
                                            IdTerapeuta = t.id_terapeuta,
                                            NombreCompleto = u.nombre + " " + u.apellido
                                        }).ToList();

                    allTerapeutas = terapeutasDB;
                }

                cmbTerapeutas.ItemsSource = allTerapeutas;

                if (allTerapeutas.Count > 0)
                {
                    cmbTerapeutas.SelectedIndex = 0; // Selecciona el primero
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error al cargar terapeutas: {ex.Message}", "Error General", MessageBoxButton.OK, MessageBoxImage.Error);
                Debug.WriteLine($"Error CargarTerapeutas (AdmiCitas): {ex.Message}");
            }
        }

        private void cmbTerapeutas_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            if (cmbTerapeutas.SelectedValue != null)
            {
                int selectedTerapeutaId = (int)cmbTerapeutas.SelectedValue;
                CargarCitasPorTerapeuta(selectedTerapeutaId);
            }
        }

        private void CargarCitasPorTerapeuta(int idTerapeuta)
        {
            CitasContainer.Children.Clear();
            List<CitaDisplay> citas = new List<CitaDisplay>();

            try
            {
                using (DataClasses1DataContext db = GetContext())
                {
                    // Ojo: Usando plurales 'Citas', 'Pacientes', 'Usuarios'
                    var queryCitas = from c in db.Citas
                                     join p in db.Pacientes on c.id_paciente equals p.id_paciente
                                     join u in db.Usuarios on p.id_usuario equals u.id_usuario
                                     where c.id_terapeuta == idTerapeuta
                                     orderby c.fecha_hora ascending
                                     select new CitaDisplay
                                     {
                                         IdCita = c.id_cita,
                                         NombrePaciente = u.nombre + " " + u.apellido,
                                         fecha_hora = c.fecha_hora,
                                         Modalidad = c.modalidad,
                                         Estado = c.estado,
                                         EnlaceSesion = c.enlace_sesion
                                     };

                    citas = queryCitas.ToList();
                }

                if (citas.Count == 0)
                {
                    TextBlock noCitasText = new TextBlock
                    {
                        Text = "No hay citas programadas para este terapeuta.",
                        FontSize = 18,
                        Foreground = Brushes.White,
                        HorizontalAlignment = HorizontalAlignment.Center,
                        VerticalAlignment = VerticalAlignment.Center,
                        Margin = new Thickness(0, 50, 0, 0)
                    };
                    CitasContainer.Children.Add(noCitasText);
                }
                else
                {
                    foreach (var cita in citas)
                    {
                        DisplayCitaCard(cita);
                    }
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Ocurrió un error al cargar citas: {ex.Message}", "Error General", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private void DisplayCitaCard(CitaDisplay cita)
        {
            Border citaCard = new Border
            {
                Background = Brushes.White,
                CornerRadius = new CornerRadius(15),
                Margin = new Thickness(10, 15, 10, 15),
                Effect = (DropShadowEffect)Application.Current.Resources["RecipeCardShadowEffect"],
                Padding = new Thickness(20),
                HorizontalAlignment = HorizontalAlignment.Stretch
            };

            Grid contentGrid = new Grid();
            contentGrid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            contentGrid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            contentGrid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });

            TextBlock nameTextBlock = new TextBlock
            {
                Text = $"CITA CON: {cita.NombrePaciente.ToUpper()}",
                FontSize = 24,
                FontWeight = FontWeights.Bold,
                Foreground = (Brush)new BrushConverter().ConvertFromString("#0056b3"),
                Margin = new Thickness(0, 0, 0, 10),
                HorizontalAlignment = HorizontalAlignment.Center,
                TextAlignment = TextAlignment.Center,
                TextWrapping = TextWrapping.Wrap
            };
            Grid.SetRow(nameTextBlock, 0);
            contentGrid.Children.Add(nameTextBlock);

            StackPanel detailsPanel = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Center, Margin = new Thickness(0, 0, 0, 5) };
            detailsPanel.Children.Add(new TextBlock
            {
                Text = $"Fecha: {cita.fecha_hora:g}",
                FontSize = 14,
                Foreground = Brushes.Gray,
                Margin = new Thickness(0, 0, 15, 0)
            });
            detailsPanel.Children.Add(new TextBlock
            {
                Text = $"Estado: {cita.Estado}",
                FontSize = 14,
                Foreground = Brushes.Gray
            });
            Grid.SetRow(detailsPanel, 1);
            contentGrid.Children.Add(detailsPanel);

            StackPanel citaDetailsPanel = new StackPanel { Margin = new Thickness(0, 5, 0, 10) };
            citaDetailsPanel.Children.Add(new TextBlock
            {
                Text = "Detalles de Sesión:",
                FontWeight = FontWeights.SemiBold,
                FontSize = 16,
                Margin = new Thickness(0, 0, 0, 5)
            });
            citaDetailsPanel.Children.Add(new TextBlock
            {
                Text = $"• Modalidad: {cita.Modalidad}",
                FontSize = 14,
                Foreground = (Brush)new BrushConverter().ConvertFromString("#333333")
            });
            citaDetailsPanel.Children.Add(new TextBlock
            {
                Text = $"• Enlace: {(string.IsNullOrEmpty(cita.EnlaceSesion) ? "N/A" : cita.EnlaceSesion)}",
                FontSize = 14,
                Foreground = (Brush)new BrushConverter().ConvertFromString("#333333")
            });

            Grid.SetRow(citaDetailsPanel, 2);
            contentGrid.Children.Add(citaDetailsPanel);

            citaCard.Child = contentGrid;
            CitasContainer.Children.Add(citaCard);
        }

        private void btnAtras_Click(object sender, RoutedEventArgs e)
        {
            // Corregido: Vuelve al panel de InicioUsuario
            InicioUsuario inicioUsuarioWindow = new InicioUsuario();
            inicioUsuarioWindow.Show();
            this.Close();
        }

        private void btnSalir_Click(object sender, RoutedEventArgs e)
        {
            Application.Current.Shutdown();
        }
    }
}
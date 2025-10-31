using System;
using System.Collections.Generic;
using System.Configuration; // Para App.config
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Effects;
using System.Diagnostics; // Para Debug.WriteLine

namespace Proyecto_Gastronomia
{
    // --- CLASES DE DATOS (DTOs) ---
    public class EmocionData
    {
        public int id_emocion { get; set; }
        public string nombre { get; set; }
    }

    public class RegistroDisplay
    {
        public int IdRegistro { get; set; }
        public string NombreEmocion { get; set; }
        public DateTime FechaRegistro { get; set; }
        public int? Valencia { get; set; }
        public int? Activacion { get; set; }
        public string NotasPaciente { get; set; }
        public string ColorHex { get; set; }
    }


    // --- VENTANA PRINCIPAL ---
    public partial class VerRegistros : Window
    {
        private string connectionString;
        private int? currentPacienteId;

        public VerRegistros()
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
            currentPacienteId = GetPacienteIdFromUsuarioId(SessionManager.CurrentUserId);

            if (currentPacienteId == null)
            {
                MessageBox.Show("Error: No se pudo identificar al paciente. Por favor, inicie sesión de nuevo.", "Error de Sesión", MessageBoxButton.OK, MessageBoxImage.Error);
                btnAtras_Click(null, null); // Volver
                return;
            }

            CargarEmocionesEnComboBox();
            FiltrarYMostrarRegistros();
        }

        private int? GetPacienteIdFromUsuarioId(int usuarioId)
        {
            try
            {
                using (DataClasses1DataContext db = GetContext())
                {
                    return db.Pacientes
                             .Where(p => p.id_usuario == usuarioId)
                             .Select(p => (int?)p.id_paciente)
                             .FirstOrDefault();
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error al obtener ID del paciente: {ex.Message}", "Error de BD", MessageBoxButton.OK, MessageBoxImage.Error);
                return null;
            }
        }

        private void CargarEmocionesEnComboBox()
        {
            try
            {
                using (DataClasses1DataContext db = GetContext())
                {
                    var emociones = db.Emociones_Modelo
                                      .OrderBy(em => em.nombre)
                                      .Select(em => new EmocionData { id_emocion = em.id_emocion, nombre = em.nombre })
                                      .ToList();

                    cmbEmociones.ItemsSource = emociones;
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error al cargar emociones: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private void FiltrarYMostrarRegistros(int? idEmocionFiltro = null, DateTime? fechaDesdeFiltro = null, DateTime? fechaHastaFiltro = null)
        {
            if (currentPacienteId == null) return;

            RegistrosContainer.Children.Clear();
            List<RegistroDisplay> registros = new List<RegistroDisplay>();

            try
            {
                using (DataClasses1DataContext db = GetContext())
                {
                    IQueryable<Registros_Emocionales> query = db.Registros_Emocionales
                                                               .Where(r => r.id_paciente == currentPacienteId.Value);

                    // --- Aplicar Filtros ---
                    if (idEmocionFiltro.HasValue)
                    {
                        query = query.Where(r => r.id_emocion == idEmocionFiltro.Value);
                    }

                    if (fechaDesdeFiltro.HasValue)
                    {
                        // --- CORRECCIÓN 1 (Línea 131) ---
                        // Añadimos .Value para acceder a la fecha de 'DateTime?'
                        query = query.Where(r => r.fecha_registro.Value.Date >= fechaDesdeFiltro.Value.Date);
                    }
                    if (fechaHastaFiltro.HasValue)
                    {
                        // --- CORRECCIÓN 2 (Línea 135) ---
                        // Añadimos .Value para acceder a la fecha de 'DateTime?'
                        query = query.Where(r => r.fecha_registro.Value.Date <= fechaHastaFiltro.Value.Date);
                    }

                    query = query.OrderByDescending(r => r.fecha_registro);

                    registros = query.Select(r => new RegistroDisplay
                    {
                        IdRegistro = r.id_registro,
                        NombreEmocion = r.Emociones_Modelo.nombre,
                        FechaRegistro = r.fecha_registro.GetValueOrDefault(),
                        Valencia = r.valencia ?? r.Emociones_Modelo.valencia,
                        Activacion = r.activacion ?? r.Emociones_Modelo.activacion,
                        NotasPaciente = r.notas_paciente,
                        ColorHex = r.Emociones_Modelo.color_hex ?? "#CCCCCC"
                    }).ToList();
                }

                if (registros.Count == 0)
                {
                    TextBlock noRegistrosText = new TextBlock
                    {
                        Text = "No hay registros emocionales con los filtros seleccionados.",
                        FontSize = 18,
                        Foreground = Brushes.White,
                        HorizontalAlignment = HorizontalAlignment.Center,
                        VerticalAlignment = VerticalAlignment.Center,
                        Margin = new Thickness(0, 50, 0, 0)
                    };
                    RegistrosContainer.Children.Add(noRegistrosText);
                }
                else
                {
                    foreach (var registro in registros)
                    {
                        DisplayRegistroCard(registro);
                    }
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Ocurrió un error inesperado al cargar registros: {ex.Message}\n{ex.InnerException?.Message}", "Error General", MessageBoxButton.OK, MessageBoxImage.Error);
                Debug.WriteLine($"Error FiltrarRegistros: {ex.Message}");
            }
        }

        private void DisplayRegistroCard(RegistroDisplay registro)
        {
            Border registroCard = new Border
            {
                Width = 450,
                Background = Brushes.White,
                CornerRadius = new CornerRadius(15),
                Margin = new Thickness(10, 15, 10, 15),
                Effect = (DropShadowEffect)Application.Current.Resources["RecipeCardShadowEffect"],
                Padding = new Thickness(20)
            };

            StackPanel contentStack = new StackPanel();

            TextBlock titleTextBlock = new TextBlock
            {
                Text = registro.NombreEmocion.ToUpper(),
                FontSize = 24,
                TextAlignment = TextAlignment.Center,
                FontWeight = FontWeights.Bold,
                Foreground = (Brush)new BrushConverter().ConvertFromString(registro.ColorHex),
                TextWrapping = TextWrapping.Wrap,
                Margin = new Thickness(0, 0, 0, 10)
            };
            contentStack.Children.Add(titleTextBlock);

            contentStack.Children.Add(new TextBlock
            {
                Text = $"FECHA: {registro.FechaRegistro:g}", // Formato corto fecha y hora
                FontSize = 14,
                FontWeight = FontWeights.SemiBold,
                Foreground = (Brush)new BrushConverter().ConvertFromString("#666666"),
                Margin = new Thickness(0, 0, 0, 10)
            });

            contentStack.Children.Add(new TextBlock
            {
                Text = "NOTAS:",
                FontSize = 14,
                FontWeight = FontWeights.SemiBold,
                Foreground = (Brush)new BrushConverter().ConvertFromString("#333333"),
                Margin = new Thickness(0, 0, 0, 5)
            });

            contentStack.Children.Add(new TextBlock
            {
                Text = string.IsNullOrEmpty(registro.NotasPaciente) ? "(Sin notas)" : registro.NotasPaciente,
                FontSize = 14,
                Foreground = (Brush)new BrushConverter().ConvertFromString("#333333"),
                TextWrapping = TextWrapping.Wrap,
                LineHeight = 18,
                Margin = new Thickness(0, 0, 0, 10)
            });

            StackPanel detailsStack = new StackPanel { Orientation = Orientation.Vertical };
            detailsStack.Children.Add(new TextBlock
            {
                Text = $"Nivel de Valencia (Placer): {registro.Valencia}/5",
                FontSize = 14,
                Foreground = (Brush)new BrushConverter().ConvertFromString("#505050")
            });
            detailsStack.Children.Add(new TextBlock
            {
                Text = $"Nivel de Activación (Energía): {registro.Activacion}/5",
                FontSize = 14,
                Foreground = (Brush)new BrushConverter().ConvertFromString("#505050")
            });
            contentStack.Children.Add(detailsStack);

            registroCard.Child = contentStack;
            RegistrosContainer.Children.Add(registroCard);
        }

        private void btnAtras_Click(object sender, RoutedEventArgs e)
        {
            InicioUsuario inicioUsuarioWindow = new InicioUsuario();
            inicioUsuarioWindow.Show();
            this.Close();
        }

        private void btnSalir_Click(object sender, RoutedEventArgs e)
        {
            Application.Current.Shutdown();
        }

        private void btnBuscar_Click(object sender, RoutedEventArgs e)
        {
            int? emocionId = (int?)cmbEmociones.SelectedValue;
            DateTime? fechaDesde = dpFechaDesde.SelectedDate;
            DateTime? fechaHasta = dpFechaHasta.SelectedDate;

            if (fechaDesde.HasValue && fechaHasta.HasValue && fechaDesde.Value > fechaHasta.Value)
            {
                MessageBox.Show("La fecha 'Desde' no puede ser mayor que la fecha 'Hasta'.", "Error de Validación", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            FiltrarYMostrarRegistros(emocionId, fechaDesde, fechaHasta);
        }

        private void btnLimpiarBusqueda_Click(object sender, RoutedEventArgs e)
        {
            cmbEmociones.SelectedIndex = -1;
            dpFechaDesde.SelectedDate = null;
            dpFechaHasta.SelectedDate = null;
            FiltrarYMostrarRegistros();
        }
    }
}
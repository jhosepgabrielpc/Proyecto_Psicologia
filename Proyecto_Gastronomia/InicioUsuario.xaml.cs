using System.Windows;

namespace Proyecto_Gastronomia
{
    public partial class InicioUsuario : Window
    {
        public InicioUsuario()
        {
            InitializeComponent();
        }


        private void btnRecetas_Click(object sender, RoutedEventArgs e)
        {
            // --- CORREGIDO ---
            // 'Recetas' (la vista de usuario) ahora es 'VerRegistros'
            VerRegistros verRegistrosWindow = new VerRegistros();
            verRegistrosWindow.Show();
            this.Close();
        }


        private void btnIngredientes_Click(object sender, RoutedEventArgs e)
        {
            // --- COMENTADO ---
            // Este archivo 'Ingredientes.xaml' es del proyecto antiguo
            // y no lo hemos reutilizado. Lo comentamos para que compile.

            // Ingredientes ingredientesWindow = new Ingredientes();
            // ingredientesWindow.Show();
            // this.Close();
            MessageBox.Show("Esta sección no está implementada.", "Información", MessageBoxButton.OK, MessageBoxImage.Information);
        }
        
        private void btnDepartamentos_Click(object sender, RoutedEventArgs e)
        {
            // --- CORREGIDO ---
            // 'Departamentos' (la vista de usuario) ahora es 'AdmiCitas'
            // (que muestra las citas por terapeuta)
            AdmiCitas citasWindow = new AdmiCitas();
            citasWindow.Show();
            this.Close();
        }
        //SE AGREGO UN BOTON PARA PODER RETONRAR A LA PAGINA ANTERIOR
        private void btnAtras_Click(object sender, RoutedEventArgs e)
        {
            Menu menuWindow = new Menu();
            menuWindow.Show();
            this.Close();
        }

        private void btnSalir_Click(object sender, RoutedEventArgs e)
        {
            Application.Current.Shutdown();
        }
    }
}
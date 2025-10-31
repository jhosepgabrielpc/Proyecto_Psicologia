using System.Windows;

namespace Proyecto_Gastronomia
{
    public partial class MainWindow : Window
    {
        public MainWindow()
        {
            InitializeComponent();
        }

        private void btnIngresar_Click(object sender, RoutedEventArgs e)
        {  
            Login loginWindow = new Login();
            loginWindow.Show();
            this.Close();
        }
    }
}

using System;
using System.Linq;
using System.Text.RegularExpressions;

namespace Proyecto_Gastronomia
{
    public static class ValidationManager
    {
        /// <summary>
        /// Verifica el formato de un correo electrónico usando Regex.
        /// </summary>
        public static bool IsEmailValid(string email)
        {
            if (string.IsNullOrWhiteSpace(email))
                return false;

            // Expresión regular robusta para validar la mayoría de correos
            string pattern = @"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$";
            return Regex.IsMatch(email, pattern);
        }

        /// <summary>
        /// Verifica si un teléfono tiene 8 dígitos y empieza con 6 o 7.
        /// </summary>
        public static bool IsPhoneValid(string phone)
        {
            if (string.IsNullOrWhiteSpace(phone))
                return false;

            // 1. Debe tener 8 dígitos
            if (phone.Length != 8)
                return false;

            // 2. Debe contener solo números
            if (!phone.All(char.IsDigit))
                return false;

            // 3. Debe empezar con 6 o 7
            if (!phone.StartsWith("6") && !phone.StartsWith("7"))
                return false;

            return true;
        }

        /// <summary>
        /// Revisa la base de datos para ver si un correo ya está en uso.
        /// </summary>
        /// <param name="email">El correo a chequear.</param>
        /// <param name="currentUserId">Opcional: El ID del usuario que estamos editando (para excluirlo de la búsqueda).</param>
        /// <param name="db">La instancia del DataContext.</param>
        public static bool IsEmailUnique(string email, int? currentUserId, DataClasses1DataContext db)
        {
            var query = db.Usuarios.Where(u => u.correo.ToLower() == email.ToLower());

            // Si estamos editando (currentUserId tiene valor), excluimos a ese usuario de la búsqueda
            if (currentUserId.HasValue)
            {
                query = query.Where(u => u.id_usuario != currentUserId.Value);
            }

            // Si .Any() es 'true', significa que encontró un duplicado.
            // Por lo tanto, 'IsEmailUnique' debe ser 'false'.
            return !query.Any();
        }
    }
}
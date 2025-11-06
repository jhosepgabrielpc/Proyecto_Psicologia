using System;
using System.Security.Cryptography;
using System.Text;

namespace Proyecto_Gastronomia
{
    public static class PasswordManager
    {
        // Genera un "salt" aleatorio para un nuevo usuario
        public static string GenerateSalt()
        {
            using (var rng = new RNGCryptoServiceProvider())
            {
                byte[] saltBytes = new byte[16];
                rng.GetBytes(saltBytes);
                return Convert.ToBase64String(saltBytes);
            }
        }

        // Crea el hash de la contraseña + salt
        public static string HashPassword(string password, string salt)
        {
            using (var sha256 = SHA256Managed.Create())
            {
                byte[] passwordBytes = Encoding.UTF8.GetBytes(password + salt);
                byte[] hashBytes = sha256.ComputeHash(passwordBytes);
                return Convert.ToBase64String(hashBytes);
            }
        }

        // Verifica si la contraseña ingresada coincide con el hash guardado
        public static bool VerifyPassword(string password, string storedHash, string storedSalt)
        {
            if (string.IsNullOrEmpty(storedHash) || string.IsNullOrEmpty(storedSalt))
            {
                // Si el usuario no tiene salt/hash (antiguo), no puede loguearse
                return false;
            }

            string newHash = HashPassword(password, storedSalt);
            return newHash == storedHash;
        }
    }
}
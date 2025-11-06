// Modelos/Cita.cs
using System;

namespace Modulo_Alan.Modelos
{
    public class Cita
    {
        public int Id { get; set; }
        public int PacienteId { get; set; }
        public int PsicologoId { get; set; }
        public DateTime FechaHora { get; set; }
        public string Modalidad { get; set; } = "Virtual";
        public string Estado { get; set; } = "Programada";
        public string Notas { get; set; }
        public DateTime FechaCreacion { get; set; } = DateTime.Now;

        // Navigation property
        public virtual SesionVideo SesionVideo { get; set; }
    }
}
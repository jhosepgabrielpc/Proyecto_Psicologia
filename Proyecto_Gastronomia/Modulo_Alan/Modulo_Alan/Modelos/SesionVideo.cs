// Modelos/SesionVideo.cs
using System;

namespace Modulo_Alan.Modelos
{
    public class SesionVideo
    {
        public int Id { get; set; }
        public int CitaId { get; set; }
        public string UrlSala { get; set; }
        public string TokenAcceso { get; set; }
        public DateTime FechaInicio { get; set; }
        public DateTime? FechaFin { get; set; }
        public string Estado { get; set; } = "Programada";
        public string CalidadVideo { get; set; }
        public string CalidadAudio { get; set; }
        public string NotasTecnicas { get; set; }
        public DateTime FechaCreacion { get; set; } = DateTime.Now;

        // Navigation property (QUITA "virtual" si no usas Entity Framework)
        public Cita Cita { get; set; }
    }
}
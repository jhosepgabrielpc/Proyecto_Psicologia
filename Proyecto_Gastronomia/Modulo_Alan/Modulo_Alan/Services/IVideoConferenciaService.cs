// Services/IVideoConferenciaService.cs
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Modulo_Alan.Modelos;

namespace Modulo_Alan.Services
{
    public interface IVideoConferenciaService
    {
        Task<SesionVideo> ProgramarSesionAsync(int citaId, DateTime fechaHora, int duracionMinutos);
        Task<string> ObtenerUrlSesionAsync(int sesionId);
        Task<bool> ValidarConexionAsync();
        Task<bool> ProbarConexion(); // Método que falta
        Task<bool> IniciarSesionAsync(int sesionId);
        Task<bool> FinalizarSesionAsync(int sesionId);
        Task<string> ObtenerTokenParticipanteAsync(int sesionId, int usuarioId);
        Task<List<SesionVideo>> ObtenerSesionesDelDiaAsync();
    }
}
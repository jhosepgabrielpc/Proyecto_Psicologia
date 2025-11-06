using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Modulo_Alan.Modelos
{
    public class ConfiguracionVideo
    {
        public string ZoomApiKey { get; set; }
        public string ZoomApiSecret { get; set; }
        public string ZoomAccountId { get; set; }
        public bool UsarWebRTC { get; set; }
        public bool HabilitarGrabacion { get; set; }
        public int TiempoEsperaMinutos { get; set; } = 15;
    }
}

using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using Newtonsoft.Json;

namespace Modulo_Alan.Services
{
    public class ZoomService
    {
        private readonly string _clientId;
        private readonly string _clientSecret;
        private readonly string _accountId;
        private string _accessToken;
        private DateTime _tokenExpiry;

        // ✅ CORREGIDO: Constructor con 3 parámetros
        public ZoomService(string clientId, string clientSecret, string accountId)
        {
            _clientId = clientId;
            _clientSecret = clientSecret;
            _accountId = accountId;
            _accessToken = null;
            _tokenExpiry = DateTime.MinValue;
        }

        public async Task<string> GetAccessTokenAsync()
        {
            if (!string.IsNullOrEmpty(_accessToken) && DateTime.Now < _tokenExpiry)
            {
                return _accessToken;
            }

            using var client = new HttpClient();

            var credentials = Convert.ToBase64String(
                Encoding.UTF8.GetBytes($"{_clientId}:{_clientSecret}"));

            client.DefaultRequestHeaders.Authorization =
                new System.Net.Http.Headers.AuthenticationHeaderValue("Basic", credentials);

            var content = new FormUrlEncodedContent(new[]
            {
                new KeyValuePair<string, string>("grant_type", "account_credentials"),
                new KeyValuePair<string, string>("account_id", _accountId)
            });

            var response = await client.PostAsync("https://zoom.us/oauth/token", content);
            var result = await response.Content.ReadAsStringAsync();

            if (!response.IsSuccessStatusCode)
            {
                throw new Exception($"Error obteniendo token: {result}");
            }

            dynamic tokenData = JsonConvert.DeserializeObject(result);
            _accessToken = tokenData.access_token;
            _tokenExpiry = DateTime.Now.AddSeconds((double)tokenData.expires_in - 300);

            return _accessToken;
        }

        // ✅ CORREGIDO: Método se llama TestConnectionAsync (no ProbarConexion)
        public async Task<bool> TestConnectionAsync()
        {
            try
            {
                var token = await GetAccessTokenAsync();
                return !string.IsNullOrEmpty(token);
            }
            catch
            {
                return false;
            }
        }

        public async Task<string> CreateMeetingAsync(string topic, DateTime startTime, int durationMinutes = 60)
        {
            try
            {
                var accessToken = await GetAccessTokenAsync();

                using var client = new HttpClient();
                client.DefaultRequestHeaders.Authorization =
                    new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", accessToken);

                var meetingRequest = new
                {
                    topic = topic,
                    type = 2,
                    start_time = startTime.ToString("yyyy-MM-ddTHH:mm:ss"),
                    duration = durationMinutes,
                    timezone = "America/Mexico_City",
                    settings = new
                    {
                        host_video = true,
                        participant_video = true,
                        join_before_host = false,
                        mute_upon_entry = false,
                        waiting_room = true
                    }
                };

                var jsonContent = JsonConvert.SerializeObject(meetingRequest);
                var content = new StringContent(jsonContent, Encoding.UTF8, "application/json");

                var response = await client.PostAsync("https://api.zoom.us/v2/users/me/meetings", content);
                var result = await response.Content.ReadAsStringAsync();

                if (!response.IsSuccessStatusCode)
                {
                    throw new Exception($"Error creando reunión: {result}");
                }

                dynamic meetingData = JsonConvert.DeserializeObject(result);
                return meetingData.join_url;
            }
            catch (Exception ex)
            {
                throw new Exception($"Error en CreateMeetingAsync: {ex.Message}", ex);
            }
        }
    }
}
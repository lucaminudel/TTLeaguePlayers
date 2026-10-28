using System.Text.Json;
using System.Text.Json.Serialization;

namespace TTLeaguePlayersApp.BackEnd.FrontendEvents;

public class FrontendApiCallDiagnostic : IFrontendApiCallDiagnostic
{
    [JsonPropertyName("event_id")] public string? EventId { get; set; }
    [JsonPropertyName("timestamp")] public DateTimeOffset? Timestamp { get; set; }
    [JsonPropertyName("event_category")] public string? EventCategory { get; set; }
    [JsonPropertyName("client_api_type")] public string? ClientApiType { get; set; }
    [JsonPropertyName("operation")] public string? Operation { get; set; }
    [JsonPropertyName("event_name")] public string? EventName { get; set; }
    [JsonExtensionData] public Dictionary<string, JsonElement>? Details { get; set; }
    [JsonPropertyName("page")] public string? Page { get; set; }
    [JsonPropertyName("app_version")] public string? AppVersion { get; set; }
}

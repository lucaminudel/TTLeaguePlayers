using System.Text.Json;

namespace TTLeaguePlayersApp.BackEnd.FrontendEvents;

public interface IFrontendApiCallDiagnostic
{
    string? EventId { get; set; }
    DateTimeOffset? Timestamp { get; set; }
    string? EventCategory { get; set; }
    string? ClientApiType { get; set; }
    string? Operation { get; set; }
    string? EventName { get; set; }
    Dictionary<string, JsonElement>? Details { get; set; }
    string? Page { get; set; }
    string? AppVersion { get; set; }
}

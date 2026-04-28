using System.Text.Json.Serialization;

namespace TTLeaguePlayersApp.BackEnd.Cognito;

public class ManagedClub
{
    [JsonPropertyName("league")]
    public string League { get; set; } = string.Empty;

    [JsonPropertyName("season")]
    public string Season { get; set; } = string.Empty;

    [JsonPropertyName("club_name")]
    public string ClubName { get; set; } = string.Empty;

    [JsonPropertyName("club_location")]
    public string ClubLocation { get; set; } = string.Empty;

    [JsonPropertyName("manager_name")]
    public required string ManagerName { get; set; }
}

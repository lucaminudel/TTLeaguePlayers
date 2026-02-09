using System.Text.Json.Serialization;

namespace TTLeaguePlayersApp.BackEnd.Kudos.Lambdas;

public class RetrieveKudosGivenByPlayerRequest
{
    [JsonPropertyName("given_by")]
    public string GiverPersonSub { get; set; } = string.Empty;

    [JsonPropertyName("league")]
    public string League { get; set; } = string.Empty;

    [JsonPropertyName("season")]
    public string Season { get; set; } = string.Empty;

    [JsonPropertyName("team_division")]
    public string TeamDivision { get; set; } = string.Empty;

    [JsonPropertyName("team_name")]
    public string TeamName { get; set; } = string.Empty;
}

using System.Text.Json.Serialization;

namespace TTLeaguePlayersApp.BackEnd.Kudos.Lambdas;

public class RetrieveKudosAwardedToTeamRequest
{
    [JsonPropertyName("league")]
    public required string League { get; set; }

    [JsonPropertyName("season")]
    public required string Season { get; set; }

    [JsonPropertyName("team_division")]
    public required string TeamDivision { get; set; }

    [JsonPropertyName("team_name")]
    public required string TeamName { get; set; }
}

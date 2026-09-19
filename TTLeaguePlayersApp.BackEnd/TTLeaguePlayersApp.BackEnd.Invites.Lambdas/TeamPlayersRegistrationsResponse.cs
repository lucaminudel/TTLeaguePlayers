using System.Text.Json.Serialization;

namespace TTLeaguePlayersApp.BackEnd.Invites.Lambdas;

public class TeamPlayersRegistrationsResponse
{
    [JsonPropertyName("league")]
    public required string League { get; set; }

    [JsonPropertyName("season")]
    public required string Season { get; set; }

    [JsonPropertyName("team_division")]
    public required string TeamDivision { get; set; }

    [JsonPropertyName("team_name")]
    public required string TeamName { get; set; }

    // A FULL OUTER JOIN between the requested player_names and the team's invites
    [JsonPropertyName("players")]
    public required List<PlayerRegistrationEntry> Players { get; set; }
}

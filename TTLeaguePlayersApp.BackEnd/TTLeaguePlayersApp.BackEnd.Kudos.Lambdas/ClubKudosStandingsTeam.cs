using System.Text.Json.Serialization;

namespace TTLeaguePlayersApp.BackEnd.Kudos.Lambdas;

public class ClubKudosStandingsTeam
{
    [JsonPropertyName("team_name")]
    public required string TeamName { get; set; }

    [JsonPropertyName("team_division")]
    public required string TeamDivision { get; set; }
}

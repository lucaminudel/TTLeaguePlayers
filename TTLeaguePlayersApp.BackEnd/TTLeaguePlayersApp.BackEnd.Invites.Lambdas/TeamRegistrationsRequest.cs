using System.Text.Json.Serialization;

namespace TTLeaguePlayersApp.BackEnd.Invites.Lambdas;

// Body of POST /invites/registrations. 
public class TeamRegistrationsRequest
{
    [JsonPropertyName("league")]
    public required string League { get; set; }

    [JsonPropertyName("season")]
    public required string Season { get; set; }

    [JsonPropertyName("club_name")]
    public required string ClubName { get; set; }

    [JsonPropertyName("club_location")]
    public required string ClubLocation { get; set; }

    [JsonPropertyName("team_names")]
    public required List<string> TeamNames { get; set; }
}

using System.Text.Json.Serialization;

namespace TTLeaguePlayersApp.BackEnd.Invites.Lambdas;

// Response of POST /invites/registrations. 
public class TeamRegistrationsResponse
{
    [JsonPropertyName("league")]
    public required string League { get; set; }

    [JsonPropertyName("season")]
    public required string Season { get; set; }

    [JsonPropertyName("club_name")]
    public required string ClubName { get; set; }

    [JsonPropertyName("club_location")]
    public required string ClubLocation { get; set; }

    // One entry per REQUESTED team, in the order the caller sent them — a left join, not a filter.
    // A team with no invite still gets an entry, with status NOT_INVITED.
    [JsonPropertyName("teams")]
    public required List<TeamRegistrationEntry> Teams { get; set; }
}

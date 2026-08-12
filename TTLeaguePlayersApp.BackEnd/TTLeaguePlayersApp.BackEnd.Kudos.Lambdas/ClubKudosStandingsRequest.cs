using System.Text.Json.Serialization;

namespace TTLeaguePlayersApp.BackEnd.Kudos.Lambdas;

// Body of POST /kudos/clubstandings.
public class ClubKudosStandingsRequest
{
    [JsonPropertyName("league")]
    public required string League { get; set; }

    [JsonPropertyName("season")]
    public required string Season { get; set; }

    // club_name and club_location are not used by the kudos query, which is keyed on
    // league#season#division. They are here because the season-scoped ClubManagerSecurityCheck
    // needs them to tell whether the caller manages this club in this season.
    [JsonPropertyName("club_name")]
    public required string ClubName { get; set; }

    [JsonPropertyName("club_location")]
    public required string ClubLocation { get; set; }

    // The division travels with each team: the kudos partition key is per division, and the
    // caller (the club page) is the only party that knows which division a team plays in.
    [JsonPropertyName("teams")]
    public required List<ClubKudosStandingsTeam> Teams { get; set; }
}

using System.Text.Json.Serialization;

namespace TTLeaguePlayersApp.BackEnd.ClubsAndTournaments.Lambdas;

public class ClubWithTournamentsResponse
{
    [JsonPropertyName("location")]
    public required string Location { get; set; }

    [JsonPropertyName("club_name")]
    public required string ClubName { get; set; }

    [JsonPropertyName("homepage")]
    public required Uri Homepage { get; set; }

    [JsonPropertyName("instagram")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public Uri? Instagram { get; set; }

    [JsonPropertyName("facebook")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public Uri? Facebook { get; set; }

    [JsonPropertyName("youtube")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public Uri? Youtube { get; set; }

    [JsonPropertyName("tournaments")]
    public required List<TournamentResponse> Tournaments { get; set; }
}

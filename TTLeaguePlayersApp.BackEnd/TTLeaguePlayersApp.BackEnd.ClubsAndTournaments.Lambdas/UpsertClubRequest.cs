using System.Text.Json.Serialization;

namespace TTLeaguePlayersApp.BackEnd.ClubsAndTournaments.Lambdas;

public class UpsertClubRequest
{
    [JsonPropertyName("homepage")]
    public required string Homepage { get; set; }

    [JsonPropertyName("instagram")]
    public string? Instagram { get; set; }

    [JsonPropertyName("facebook")]
    public string? Facebook { get; set; }

    [JsonPropertyName("youtube")]
    public string? Youtube { get; set; }
}

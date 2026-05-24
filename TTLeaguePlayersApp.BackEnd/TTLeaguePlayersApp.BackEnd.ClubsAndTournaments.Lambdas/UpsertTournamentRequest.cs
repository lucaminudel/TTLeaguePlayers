using System.Text.Json.Serialization;

namespace TTLeaguePlayersApp.BackEnd.ClubsAndTournaments.Lambdas;

public class UpsertTournamentRequest
{
    [JsonPropertyName("tournament_info")]
    public required string TournamentInfo { get; set; }

    [JsonPropertyName("instagram")]
    public string? Instagram { get; set; }

    [JsonPropertyName("facebook")]
    public string? Facebook { get; set; }

    [JsonPropertyName("start_date")]
    public long StartDate { get; set; }

    [JsonPropertyName("end_date")]
    public long EndDate { get; set; }
}

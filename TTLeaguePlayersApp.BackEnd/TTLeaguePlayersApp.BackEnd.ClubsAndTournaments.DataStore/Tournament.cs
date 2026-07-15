using System.Text.Json.Serialization;

namespace TTLeaguePlayersApp.BackEnd.ClubsAndTournaments.DataStore;

public class Tournament
{
    [JsonPropertyName("location")]
    public required string Location { get; set; }

    [JsonPropertyName("club_name")]
    public required string ClubName { get; set; }

    [JsonPropertyName("tournament_name")]
    public required string TournamentName { get; set; }

    [JsonPropertyName("tournament_info")]
    public required Uri TournamentInfo { get; set; }

    [JsonPropertyName("instagram")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public Uri? Instagram { get; set; }

    [JsonPropertyName("facebook")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public Uri? Facebook { get; set; }

    [JsonPropertyName("start_date")]
    public long StartDate { get; set; }

    [JsonPropertyName("end_date")]
    public long EndDate { get; set; }

    [JsonPropertyName("last_updated_at")]
    public long LastUpdatedAt { get; set; }
}

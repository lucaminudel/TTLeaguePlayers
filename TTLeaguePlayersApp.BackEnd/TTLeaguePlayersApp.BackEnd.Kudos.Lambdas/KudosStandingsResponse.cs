using System.Text.Json.Serialization;

namespace TTLeaguePlayersApp.BackEnd.Kudos.Lambdas;

public class KudosStandingsResponse
{
    [JsonPropertyName("positive_kudos_table")]
    public List<KudosStandingsEntry> PositiveKudosTable { get; set; } = new();

    [JsonPropertyName("negative_kudos_table")]
    public List<KudosStandingsEntry> NegativeKudosTable { get; set; } = new();

    [JsonPropertyName("neutral_kudos_table")]
    public List<KudosStandingsEntry> NeutralKudosTable { get; set; } = new();
}

public class KudosStandingsEntry
{
    [JsonPropertyName("team_name")]
    public required string TeamName { get; set; }

    [JsonPropertyName("count")]
    public int Count { get; set; }
}

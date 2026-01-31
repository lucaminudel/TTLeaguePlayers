using System.Text.Json.Serialization;

namespace TTLeaguePlayersApp.BackEnd.Kudos.Lambdas;

public class KudosSummary
{
    [JsonPropertyName("league")]
    public required string League { get; set; }

    [JsonPropertyName("season")]
    public required string Season { get; set; }

    [JsonPropertyName("division")]
    public required string Division { get; set; }

    [JsonPropertyName("home_team")]
    public required string HomeTeam { get; set; }

    [JsonPropertyName("away_team")]
    public required string AwayTeam { get; set; }

    [JsonPropertyName("receiving_team")]
    public required string ReceivingTeam { get; set; }

    [JsonPropertyName("match_date_time")]
    public long MatchDateTime { get; set; }

    [JsonPropertyName("positive_kudos_count")]
    public int PositiveKudosCount { get; set; }

    [JsonPropertyName("neutral_kudos_count")]
    public int NeutralKudosCount { get; set; }

    [JsonPropertyName("negative_kudos_count")]
    public int NegativeKudosCount { get; set; }

    [JsonPropertyName("item_type")]
    public string ItemType { get; set; } = "SUMMARY";
}

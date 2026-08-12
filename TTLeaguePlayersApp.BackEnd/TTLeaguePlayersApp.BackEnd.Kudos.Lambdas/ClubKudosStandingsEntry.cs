using System.Text.Json.Serialization;

namespace TTLeaguePlayersApp.BackEnd.Kudos.Lambdas;

public class ClubKudosStandingsEntry
{
    [JsonPropertyName("team_name")]
    public required string TeamName { get; set; }

    // All three are MATCH TALLIES, not kudos counts: a match contributes 1 to a counter when the
    // team received at least one kudos of that kind in it, however many were given.
    [JsonPropertyName("positive_count")]
    public required int PositiveCount { get; set; }

    [JsonPropertyName("neutral_count")]
    public required int NeutralCount { get; set; }

    [JsonPropertyName("negative_count")]
    public required int NegativeCount { get; set; }
}

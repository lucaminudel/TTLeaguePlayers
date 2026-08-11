using System.Text.Json.Serialization;

namespace TTLeaguePlayersApp.BackEnd.Kudos.Lambdas;

// Response of POST /kudos/clubstandings.
//
// Deliberately NOT KudosStandingsResponse, which groups by division into three tables. A club
// manager wants their whole club at a glance, so this is one flat list.
public class ClubKudosStandingsResponse
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
    // A team that was never awarded any kudos still gets an entry, with all three counts at zero.
    [JsonPropertyName("teams")]
    public required List<ClubKudosStandingsEntry> Teams { get; set; }
}

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

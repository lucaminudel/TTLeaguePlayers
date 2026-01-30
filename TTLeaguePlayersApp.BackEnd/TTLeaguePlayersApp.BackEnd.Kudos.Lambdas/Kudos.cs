using System.Text.Json.Serialization;

namespace TTLeaguePlayersApp.BackEnd.Kudos.Lambdas;

public class Kudos
{
    [JsonPropertyName("league")]
    public required string League { get; set; }

    [JsonPropertyName("season")]
    public required string Season { get; set; }

    [JsonPropertyName("division")]
    public required string Division { get; set; }

    [JsonPropertyName("receiving_team")]
    public required string ReceivingTeam { get; set; }

    [JsonPropertyName("home_team")]
    public required string HomeTeam { get; set; }

    [JsonPropertyName("away_team")]
    public required string AwayTeam { get; set; }

    [JsonPropertyName("match_date_time")]
    public long MatchDateTime { get; set; }

    [JsonPropertyName("giver_team")]
    public required string GiverTeam { get; set; }

    [JsonPropertyName("giver_person_name")]
    public required string GiverPersonName { get; set; }

    [JsonPropertyName("giver_person_sub")]
    public required string GiverPersonSub { get; set; }

    [JsonPropertyName("kudos_value")]
    public int KudosValue { get; set; }
}

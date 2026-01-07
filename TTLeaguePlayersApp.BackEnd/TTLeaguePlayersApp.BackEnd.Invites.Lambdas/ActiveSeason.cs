using System.Text.Json.Serialization;

namespace TTLeaguePlayersApp.BackEnd.Invites.Lambdas;

public partial class AccepteInviteLambda
{
    private class ActiveSeason
    {
        [JsonPropertyName("league")]
        public string League { get; set; } = string.Empty;

        [JsonPropertyName("season")]
        public string Season { get; set; } = string.Empty;

        [JsonPropertyName("team_name")]
        public string TeamName { get; set; } = string.Empty;

        [JsonPropertyName("team_division")]
        public string TeamDivision { get; set; } = string.Empty;

        [JsonPropertyName("person_name")]
        public required string PersonName { get; set; }

        [JsonPropertyName("role")]
        public string Role { get; set; } = string.Empty;
    }
}

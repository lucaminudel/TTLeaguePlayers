using System.Text.Json.Serialization;

namespace TTLeaguePlayersApp.BackEnd.Lambdas.Invites;

public class Invite
{
    [JsonPropertyName("nano_id")]
    public required string NanoId { get; set; }

    [JsonPropertyName("name")]
    public required string Name { get; set; }

    [JsonPropertyName("email_ID")]
    public required string EmailId { get; set; }

    [JsonPropertyName("role")]
    public required Role Role { get; set; }
    
    [JsonPropertyName("team_name")]
    public required string TeamName { get; set; }

    [JsonPropertyName("division")]
    public required string Division { get; set; }

    [JsonPropertyName("league")]
    public required string League { get; set; }

    [JsonPropertyName("season")]
    public required string Season { get; set; }

    [JsonPropertyName("created_at")]    
    public long CreatedAt { get; set; }

    [JsonPropertyName("accepted_at")]
    public long? AcceptedAt { get; set; }
}

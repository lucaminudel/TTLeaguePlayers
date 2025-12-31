using System.Text.Json.Serialization;

namespace TTLeaguePlayersApp.BackEnd.Invites.Lambdas;

public class Invite
{
    [JsonPropertyName("nano_id")]
    public required string NanoId { get; set; }

    [JsonPropertyName("invitee_name")]
    public required string InviteeName { get; set; }

    [JsonPropertyName("invitee_email_id")]
    public required string InviteeEmailId { get; set; }

    [JsonPropertyName("invitee_role")]
    public required Role InviteeRole { get; set; }
    
    [JsonPropertyName("invitee_team")]
    public required string InviteeTeam { get; set; }

    [JsonPropertyName("team_division")]
    public required string TeamDivision { get; set; }

    [JsonPropertyName("league")]
    public required string League { get; set; }

    [JsonPropertyName("season")]
    public required string Season { get; set; }

    [JsonPropertyName("invited_by")]
    public required string InvitedBy { get; set; }

    [JsonPropertyName("created_at")]    
    public long CreatedAt { get; set; }

    [JsonPropertyName("accepted_at")]
    public long? AcceptedAt { get; set; }
}

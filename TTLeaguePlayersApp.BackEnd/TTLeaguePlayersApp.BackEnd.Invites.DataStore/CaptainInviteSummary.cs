namespace TTLeaguePlayersApp.BackEnd.Invites.DataStore;

// No [JsonPropertyName] attributes on purpose: this is an internal read model, never serialised to
// the wire. The HTTP shape is TeamRegistrationsResponse, and the lambda maps between them.
public class CaptainInviteSummary
{
    // Index RANGE key.
    public required string InviteeTeam { get; set; }

    public required string NanoId { get; set; }
    public required Role InviteeRole { get; set; }
    public required string InviteeName { get; set; }
    public required string InviteeEmailId { get; set; }
    public required string TeamDivision { get; set; }
    public required string League { get; set; }
    public required string Season { get; set; }
    public required long CreatedAt { get; set; }

    // Null when the invite has not been accepted. 
    public long? AcceptedAt { get; set; }
}

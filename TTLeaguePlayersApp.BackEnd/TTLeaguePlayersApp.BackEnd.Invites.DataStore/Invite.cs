using System.Text.Json.Serialization;

namespace TTLeaguePlayersApp.BackEnd.Invites.DataStore;

public abstract class Invite
{
    [JsonPropertyName("nano_id")]
    public required string NanoId { get; set; }

    [JsonPropertyName("invitee_name")]
    public required string InviteeName { get; set; }

    [JsonPropertyName("invitee_email_id")]
    public required string InviteeEmailId { get; set; }

    [JsonPropertyName("invitee_role")]
    public required Role InviteeRole { get; set; }
    
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

    public static void ValidateNanoId(string nanoId)
    {
        var nanoIdJsonName = JsonFieldName.For<Invite>(nameof(NanoId));

        if (string.IsNullOrWhiteSpace(nanoId))
            throw new ValidationException(new List<string> { $"{nanoIdJsonName} is required" });

        if (nanoId.Length != 8)
            throw new ValidationException(new List<string> { $"{nanoIdJsonName} malformed." });    
    }

    public static void ValidateAcceptedAt(long acceptedAt)
    {
        var acceptedAtJsonName = JsonFieldName.For<Invite>(nameof(acceptedAt));

        if (acceptedAt <= 0)
        {
            throw new ValidationException(new List<string> { $"{acceptedAtJsonName} must be a positive unix timestamp." });
        } 
    }    
}

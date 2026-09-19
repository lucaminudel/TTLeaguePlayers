using System.Text.Json.Serialization;
using TTLeaguePlayersApp.BackEnd.Invites.DataStore;

namespace TTLeaguePlayersApp.BackEnd.Invites.Lambdas;

// One row of TeamPlayersRegistrationsResponse.Players.
public class PlayerRegistrationEntry
{
    [JsonPropertyName("player_name")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? PlayerName { get; set; }

    [JsonPropertyName("status")]
    public required TeamRegistrationStatus Status { get; set; }

    // CAPTAIN or PLAYER, from the invite. Absent on NOT_INVITED.
    [JsonPropertyName("invitee_role")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public Role? InviteeRole { get; set; }

    [JsonPropertyName("nano_id")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? NanoId { get; set; }

    [JsonPropertyName("invitee_name")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? InviteeName { get; set; }

    [JsonPropertyName("invitee_email_id")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? InviteeEmailId { get; set; }

    [JsonPropertyName("created_at")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public long? CreatedAt { get; set; }

    // ALWAYS PRESENT, unlike the fields above — deliberately no [JsonIgnore]. It is a number on
    // ACCEPTED and explicitly null on both PENDING and NOT_INVITED, so a consumer can read
    // entry.accepted_at without first checking whether the key exists. Its null does not distinguish
    // PENDING from NOT_INVITED; `status` is what does that.
    [JsonPropertyName("accepted_at")]
    public long? AcceptedAt { get; set; }
}

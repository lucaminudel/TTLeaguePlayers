using System.Text.Json.Serialization;

namespace TTLeaguePlayersApp.BackEnd.Invites.Lambdas;

public class TeamRegistrationEntry
{
    [JsonPropertyName("team_name")]
    public required string TeamName { get; set; }

    [JsonPropertyName("status")]
    public required TeamRegistrationStatus Status { get; set; }

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

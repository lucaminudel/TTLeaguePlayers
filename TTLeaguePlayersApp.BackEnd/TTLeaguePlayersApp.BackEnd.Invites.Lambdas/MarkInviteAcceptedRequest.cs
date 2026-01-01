using System.Text.Json.Serialization;

namespace TTLeaguePlayersApp.BackEnd.Invites.Lambdas;

public class MarkInviteAcceptedRequest
{
    [JsonPropertyName("nano_id")]
    public required string NanoId { get; set; }
}

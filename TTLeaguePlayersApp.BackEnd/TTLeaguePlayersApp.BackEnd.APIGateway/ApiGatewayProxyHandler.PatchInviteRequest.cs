using System.Text.Json.Serialization;

namespace TTLeaguePlayersApp.BackEnd.APIGateway;

public partial class ApiGatewayProxyHandler
{
    public sealed class PatchInviteRequest
    {
        [JsonPropertyName("accepted_at")]
        public long? AcceptedAt { get; set; }
    }

}

using System.Text.Json.Serialization;

namespace TTLeaguePlayersApp.BackEnd.Configuration.DataStore;

public partial class Loader
{
    internal class DynamoDBConfigDeserialisation
    {
        public string? ServiceLocalUrl { get; set; }

        [JsonPropertyName("AWS.Profile")]
        public string? AWSProfile { get; set; }

        [JsonPropertyName("AWS.Region")]
        public string? AWSRegion { get; set; }
    }
}

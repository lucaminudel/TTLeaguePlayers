namespace TTLeaguePlayersApp.BackEnd.Configuration.DataStore;

public partial class Loader
{
    internal class EnvironmentConfigDeserialisation
    {
        public FrontEndConfigDeserialisation FrontEnd { get; set; } = new();

        public ApiGateWayConfigDeserialisation ApiGateWay { get; set; } = new();

        public DynamoDBConfigDeserialisation DynamoDB { get; set; } = new();

        public CognitoConfigDeserialisation Cognito { get; set; } = new();

        public EmailForwarderConfigDeserialisation EmailForwarder { get; set; } = new();

        [System.Text.Json.Serialization.JsonPropertyName("active_seasons_data_source")]
        public List<ActiveSeasonDataSourceDeserialisation> ActiveSeasonsDataSource { get; set; } = new();
    }
}

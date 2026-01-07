namespace TTLeaguePlayersApp.BackEnd.Configuration.DataStore;

public partial class Loader
{
    internal class CognitoConfigDeserialisation
    {
        public string UserPoolId { get; set; } = string.Empty;
        public string ClientId { get; set; } = string.Empty;
        public string Domain { get; set; } = string.Empty;
    }
}

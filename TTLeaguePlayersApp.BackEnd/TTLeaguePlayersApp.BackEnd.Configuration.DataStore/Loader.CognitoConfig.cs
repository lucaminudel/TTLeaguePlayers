namespace TTLeaguePlayersApp.BackEnd.Configuration.DataStore;

public partial class Loader
{
    public class CognitoConfig
    {
        public string UserPoolId { get; internal set; } = string.Empty;
        public string ClientId { get; internal set; } = string.Empty;
        public string Domain { get; internal set; } = string.Empty;
    }
}

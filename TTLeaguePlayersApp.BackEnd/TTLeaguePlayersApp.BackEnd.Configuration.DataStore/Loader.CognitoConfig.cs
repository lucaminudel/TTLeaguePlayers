namespace TTLeaguePlayersApp.BackEnd.Configuration.DataStore;

public partial class Loader
{
    public class CognitoConfig
    {
        public string? UserPoolId { get; internal set; }
        public string? ClientId { get; internal set; }
        public string? Domain { get; internal set; }
    }
}

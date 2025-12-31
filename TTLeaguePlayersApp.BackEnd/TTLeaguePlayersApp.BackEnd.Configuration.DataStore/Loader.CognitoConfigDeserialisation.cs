namespace TTLeaguePlayersApp.BackEnd.Configuration.DataStore;

public partial class Loader
{
    internal class CognitoConfigDeserialisation
    {
        public string? UserPoolId { get; set; }
        public string? ClientId { get; set; }
        public string? Domain { get; set; }
    }
}

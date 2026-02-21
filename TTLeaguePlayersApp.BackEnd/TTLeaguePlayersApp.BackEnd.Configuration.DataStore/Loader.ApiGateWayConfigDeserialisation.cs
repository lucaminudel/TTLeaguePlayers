namespace TTLeaguePlayersApp.BackEnd.Configuration.DataStore;

public partial class Loader
{
    internal class ApiGateWayConfigDeserialisation
    {
        public string ApiBaseUrl { get; set; } = string.Empty;
        public bool CreateInviteAutomaticallySendInviteEmail { get; set; }
    }
}

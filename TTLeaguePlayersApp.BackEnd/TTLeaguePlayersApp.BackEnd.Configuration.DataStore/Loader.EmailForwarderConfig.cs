namespace TTLeaguePlayersApp.BackEnd.Configuration.DataStore;

public partial class Loader
{
    public class EmailForwarderConfig
    {
        public string InviteEmailAddress { get; internal set; } = string.Empty;
        public string ContactUsEmailAddress { get; internal set; } = string.Empty;
        public string ForwardToEmailAddress { get; internal set; } = string.Empty;
    }
}

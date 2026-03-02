namespace TTLeaguePlayersApp.BackEnd.Configuration.DataStore;

public partial class Loader
{
    internal class EmailForwarderConfigDeserialisation
    {
        public string InviteEmailAddress { get; set; } = string.Empty;
        public string ContactUsEmailAddress { get; set; } = string.Empty;
        public string ForwardToEmailAddress { get; set; } = string.Empty;
    }
}

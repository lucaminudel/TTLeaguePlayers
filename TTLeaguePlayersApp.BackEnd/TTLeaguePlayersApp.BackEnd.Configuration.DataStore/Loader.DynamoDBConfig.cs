namespace TTLeaguePlayersApp.BackEnd.Configuration.DataStore;

public partial class Loader
{
    public class DynamoDBConfig
    {
        public Uri? ServiceLocalUrl { get; internal set; }
        public string? AWSProfile { get; internal set; }
        public string? AWSRegion { get; internal set; }
        public string TablesNameSuffix { get; internal set; } = string.Empty;
    }
}

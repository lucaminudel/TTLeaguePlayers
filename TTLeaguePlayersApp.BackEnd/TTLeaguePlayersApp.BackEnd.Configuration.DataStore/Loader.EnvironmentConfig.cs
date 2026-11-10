namespace TTLeaguePlayersApp.BackEnd.Configuration.DataStore;

public partial class Loader
{
    public class EnvironmentConfig
    {
        public FrontEndConfig FrontEnd { get; internal set; } = new();
        public ApiGateWayConfig ApiGateWay { get; internal set; } = new();
        public DynamoDBConfig DynamoDB { get; internal set; } = new();
        public CognitoConfig Cognito { get; internal set; } = new();
        public EmailForwarderConfig EmailForwarder { get; internal set; } = new();
        public IReadOnlyList<ActiveSeasonStrategyConfig> ActiveSeasonsDataSource { get; internal set; } = Array.Empty<ActiveSeasonStrategyConfig>();

        internal EnvironmentConfig(EnvironmentConfigDeserialisation cfg, string environment)
        {
            ValidateConfigFileInfo(cfg);
            ActiveSeasonsDataSource = cfg.ActiveSeasonsDataSource.Select(ParseAndValidateStrategy).ToArray();

            FrontEnd.WebsiteBaseUrl = new Uri(cfg.FrontEnd.WebsiteBaseUrl);
            ApiGateWay.ApiBaseUrl = new Uri(cfg.ApiGateWay.ApiBaseUrl);
            ApiGateWay.CreateInviteAutomaticallySendInviteEmail = cfg.ApiGateWay.CreateInviteAutomaticallySendInviteEmail;
            
            if (!string.IsNullOrEmpty(cfg.DynamoDB.ServiceLocalUrl))
            {
                // Remove potential trailing ' ?' from draft json editing if present, though ideally JSON should be clean.
                // Assuming standard valid URL for now based on strict type requirements.
                var url = cfg.DynamoDB.ServiceLocalUrl.Trim().Split(' ')[0]; 
                if (Uri.TryCreate(url, UriKind.Absolute, out var uri))
                    DynamoDB.ServiceLocalUrl = uri;
            }
            DynamoDB.AWSProfile = cfg.DynamoDB.AWSProfile;
            DynamoDB.AWSRegion = cfg.DynamoDB.AWSRegion;
            DynamoDB.TablesNameSuffix = environment;

            Cognito.UserPoolId = cfg.Cognito.UserPoolId.TrimEnd(' ', '?');
            Cognito.ClientId = cfg.Cognito.ClientId.TrimEnd(' ', '?');
            Cognito.Domain = cfg.Cognito.Domain.TrimEnd(' ', '?');

            EmailForwarder.InviteEmailAddress = cfg.EmailForwarder.InviteEmailAddress;
            EmailForwarder.ContactUsEmailAddress = cfg.EmailForwarder.ContactUsEmailAddress;
            EmailForwarder.ForwardToEmailAddress = cfg.EmailForwarder.ForwardToEmailAddress;
        }

        private static readonly string[] RequiredStrategySourceNames =
        [
            // These are the required sources for the TT365 CLTTL season strategy processor. 
            // For other leagues and source websites, to be considered in the future, the required sources may differ.
            "Divisions Teams List",
            "Divisions Teams Players List",
            "League Tables",
            "Ranking",
            "Fixtures"
        ];

        private static ActiveSeasonStrategyConfig ParseAndValidateStrategy(ActiveSeasonDataSourceDeserialisation season)
        {
            var strategySources = season.StrategySources;
            if (season.CustomStrategyProcessor is null || strategySources is null)
                throw new ArgumentException($"Strategy settings are required for {season.League} {season.Season}.");

            if (season.CustomStrategyProcessor.Length == 0 && strategySources.Count == 0)
                return new(season.League, season.Season, "", new Dictionary<string, Uri>());

            if (string.IsNullOrWhiteSpace(season.CustomStrategyProcessor) || strategySources.Count == 0)
                throw new ArgumentException($"Strategy settings must both be empty or configured for {season.League} {season.Season}.");

            var processorTypeName = $"TTLeaguePlayersApp.BackEnd.Strategy.{season.CustomStrategyProcessor}";
            var processorType = typeof(EnvironmentConfig).Assembly.GetType(processorTypeName);
            if (processorType is null || !processorType.IsClass)
                throw new ArgumentException($"Unknown strategy processor '{processorTypeName}' for {season.League} {season.Season}.");

            var strategySourceUrls = ParseStrategySourceUrls(season);
            var missingSourceNames = RequiredStrategySourceNames.Where(name => !strategySourceUrls.ContainsKey(name)).ToArray();
            if (missingSourceNames.Length != 0)
                throw new ArgumentException($"Missing strategy sources for {season.League} {season.Season}: {string.Join(", ", missingSourceNames)}.");

            return new(season.League, season.Season, season.CustomStrategyProcessor, strategySourceUrls);
        }

        private static Dictionary<string, Uri> ParseStrategySourceUrls(ActiveSeasonDataSourceDeserialisation season)
        {
            var urlsBySourceName = new Dictionary<string, Uri>(StringComparer.Ordinal);
            foreach (var (sourceName, sourceAddress) in season.StrategySources!)
            {
                if (string.IsNullOrWhiteSpace(sourceName))
                    throw new ArgumentException($"Strategy source names cannot be empty for {season.League} {season.Season}.");

                if (sourceAddress is null ||
                    !Uri.IsWellFormedUriString(sourceAddress, UriKind.Absolute) ||
                    !Uri.TryCreate(sourceAddress, UriKind.Absolute, out var sourceUrl) ||
                    (sourceUrl.Scheme != Uri.UriSchemeHttp && sourceUrl.Scheme != Uri.UriSchemeHttps))
                {
                    throw new ArgumentException($"Invalid HTTP(S) URL for strategy source '{sourceName}' in {season.League} {season.Season}.");
                }

                urlsBySourceName.Add(sourceName, sourceUrl);
            }

            return urlsBySourceName;
        }

        private static void ValidateConfigFileInfo(EnvironmentConfigDeserialisation cfg)
        {
            if (string.IsNullOrEmpty(cfg.FrontEnd.WebsiteBaseUrl))
                throw new ArgumentNullException($"{nameof(cfg.FrontEnd)}.{nameof(cfg.FrontEnd.WebsiteBaseUrl)} configuration value cannot be null or empty.");

            if (!Uri.IsWellFormedUriString(cfg.FrontEnd.WebsiteBaseUrl, UriKind.Absolute))
                throw new ArgumentException($"{nameof(cfg.FrontEnd)}.{nameof(cfg.FrontEnd.WebsiteBaseUrl)} configuration value needs to be a well formed Url ('{cfg.FrontEnd.WebsiteBaseUrl}').");

            if (string.IsNullOrEmpty(cfg.ApiGateWay.ApiBaseUrl))
                throw new ArgumentNullException($"{nameof(cfg.ApiGateWay)}.{nameof(cfg.ApiGateWay.ApiBaseUrl)} configuration value cannot be null or empty.");

            if (!Uri.IsWellFormedUriString(cfg.ApiGateWay.ApiBaseUrl, UriKind.Absolute))
                throw new ArgumentException($"{nameof(cfg.ApiGateWay)}.{nameof(cfg.ApiGateWay.ApiBaseUrl)} configuration value needs to be a well formed Url ('{cfg.ApiGateWay.ApiBaseUrl}').");

            if (cfg.DynamoDB.AWSProfile == null)
                throw new ArgumentNullException($"{nameof(cfg.DynamoDB)}.{nameof(cfg.DynamoDB.AWSProfile)} configuration value cannot be null.");


            if (string.IsNullOrEmpty(cfg.Cognito.UserPoolId))
                throw new ArgumentNullException($"{nameof(cfg.Cognito)}.{nameof(cfg.Cognito.UserPoolId)} configuration value cannot be null or empty.");

            if (string.IsNullOrEmpty(cfg.Cognito.ClientId))
                throw new ArgumentNullException($"{nameof(cfg.Cognito)}.{nameof(cfg.Cognito.ClientId)} configuration value cannot be null or empty.");

            if (string.IsNullOrEmpty(cfg.Cognito.Domain))
                throw new ArgumentNullException($"{nameof(cfg.Cognito)}.{nameof(cfg.Cognito.Domain)} configuration value cannot be null or empty.");

            if (string.IsNullOrEmpty(cfg.EmailForwarder.InviteEmailAddress))
                throw new ArgumentNullException($"{nameof(cfg.EmailForwarder)}.{nameof(cfg.EmailForwarder.InviteEmailAddress)} configuration value cannot be null or empty.");

            if (string.IsNullOrEmpty(cfg.EmailForwarder.ContactUsEmailAddress))
                throw new ArgumentNullException($"{nameof(cfg.EmailForwarder)}.{nameof(cfg.EmailForwarder.ContactUsEmailAddress)} configuration value cannot be null or empty.");

            if (string.IsNullOrEmpty(cfg.EmailForwarder.ForwardToEmailAddress))
                throw new ArgumentNullException($"{nameof(cfg.EmailForwarder)}.{nameof(cfg.EmailForwarder.ForwardToEmailAddress)} configuration value cannot be null or empty.");
        }
    }
}

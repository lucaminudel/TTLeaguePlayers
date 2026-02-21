namespace TTLeaguePlayersApp.BackEnd.Configuration.DataStore;

public partial class Loader
{
    public class EnvironmentConfig
    {
        public FrontEndConfig FrontEnd { get; internal set; } = new();
        public ApiGateWayConfig ApiGateWay { get; internal set; } = new();
        public DynamoDBConfig DynamoDB { get; internal set; } = new();
        public CognitoConfig Cognito { get; internal set; } = new();

        internal EnvironmentConfig(EnvironmentConfigDeserialisation cfg, string environment)
        {
            ValidateConfigFileInfo(cfg);

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
        }
    }
}

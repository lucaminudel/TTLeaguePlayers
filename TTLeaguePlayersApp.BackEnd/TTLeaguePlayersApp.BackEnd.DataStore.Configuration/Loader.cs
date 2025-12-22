using System.Text.Json;
using System.Text.Json.Serialization;

namespace TTLeaguePlayersApp.BackEnd.DataStore.Configuration;

public class Loader
{
    private EnvironmentConfig? _cachedConfig;

    public EnvironmentConfig GetEnvironmentVariables()
    {
        if (_cachedConfig != null)
            return _cachedConfig;

        // Variable initialised by SAM's template.yaml inside SAM.
        var runtimeEnvironment = Environment.GetEnvironmentVariable("ENVIRONMENT");

        if (string.IsNullOrEmpty(runtimeEnvironment))
        {
#if DEBUG
            // Fallback for code running outside SAM as C# tests in the IDE's Tests Explorer
            runtimeEnvironment = "dev";
#else
            throw new InvalidOperationException("The ENVIRONMENT variable should be set (dev, test, staging, prod) but is not.");
#endif
        }

        var configPath = Path.Combine(GetConfigDirectory(), $"{runtimeEnvironment}.env.json");

        if (!File.Exists(configPath))
            throw new FileNotFoundException($"Configuration file not found: {configPath}");

        var jsonContent = File.ReadAllText(configPath);
        var deserialisedConfigFile = JsonSerializer.Deserialize<EnvironmentConfigDeserialisation>(jsonContent)
            ?? throw new InvalidOperationException($"Failed to deserialize configuration from {configPath}");

        return _cachedConfig = new EnvironmentConfig(deserialisedConfigFile);

    }

    private static bool HasConfigFiles(string directory)
    {
        return Directory.GetFiles(directory, "*.env.json").Any();
    }

    private static string GetConfigDirectory()
    {
        // For Lambda/SAM: Look for config files in the same directory as the assembly
        var assemblyDir = Path.GetDirectoryName(System.Reflection.Assembly.GetExecutingAssembly().Location);
        if (!string.IsNullOrEmpty(assemblyDir) && Directory.Exists(assemblyDir) && HasConfigFiles(assemblyDir))
            return assemblyDir;

        // Second try: current working directory
        var currentDirectory = Directory.GetCurrentDirectory();
        if (Directory.Exists(currentDirectory) && HasConfigFiles(currentDirectory))
            return currentDirectory;

        // Third try: navigate up from current directory 
        var parentDir = Directory.GetParent(currentDirectory);
        while (parentDir != null)
        {
            if (HasConfigFiles(parentDir.FullName))
                return parentDir.FullName;

            var configSubDir = Path.Combine(parentDir.FullName, "config");
            if (Directory.Exists(configSubDir) && HasConfigFiles(configSubDir))
                return configSubDir;

            parentDir = parentDir.Parent;
        }

        throw new DirectoryNotFoundException($"Config directory not found. Searched in assembly dir: {assemblyDir}, current dir: {currentDirectory}");
    }

    internal class EnvironmentConfigDeserialisation
    {
        public FrontEndConfigDeserialisation FrontEnd { get; set; } = new();

        [JsonPropertyName("BackEnd.ApiGateWay")]
        public BackEndApiGateWayConfigDeserialisation BackEndApiGateWay { get; set; } = new();
    }

    internal class FrontEndConfigDeserialisation
    {
        public string WebsiteBaseUrl { get; set; } = string.Empty;
    }

    internal class BackEndApiGateWayConfigDeserialisation
    {
        public string ApiBaseUrl { get; set; } = string.Empty;
    }

    public class EnvironmentConfig
    {
        public FrontEndConfig FrontEnd { get; internal set; } = new();
        public BackEndApiGateWayConfig BackEndApiGateWay { get; internal set; } = new();

        internal EnvironmentConfig(EnvironmentConfigDeserialisation cfg)
        {
            ValidateConfigFileInfo(cfg);

            FrontEnd.WebsiteBaseUrl = new Uri(cfg.FrontEnd.WebsiteBaseUrl);
            BackEndApiGateWay.ApiBaseUrl = new Uri(cfg.BackEndApiGateWay.ApiBaseUrl);
        }

        private static void ValidateConfigFileInfo(EnvironmentConfigDeserialisation cfg)
        {
            if (string.IsNullOrEmpty(cfg.FrontEnd.WebsiteBaseUrl))
                throw new ArgumentNullException($"{nameof(cfg.FrontEnd)}.{nameof(cfg.FrontEnd.WebsiteBaseUrl)} configuration value cannot be null or empty.");

            if (!Uri.IsWellFormedUriString(cfg.FrontEnd.WebsiteBaseUrl, UriKind.Absolute))
                throw new ArgumentException($"{nameof(cfg.FrontEnd)}.{nameof(cfg.FrontEnd.WebsiteBaseUrl)} configuration value needs to be a well formed Url ('{cfg.FrontEnd.WebsiteBaseUrl}').");

            if (string.IsNullOrEmpty(cfg.BackEndApiGateWay.ApiBaseUrl))
                throw new ArgumentNullException($"{nameof(cfg.BackEndApiGateWay)}.{nameof(cfg.BackEndApiGateWay.ApiBaseUrl)} configuration value cannot be null or empty.");

            if (!Uri.IsWellFormedUriString(cfg.BackEndApiGateWay.ApiBaseUrl, UriKind.Absolute))
                throw new ArgumentException($"{nameof(cfg.BackEndApiGateWay)}.{nameof(cfg.BackEndApiGateWay.ApiBaseUrl)} configuration value needs to be a well formed Url ('{cfg.BackEndApiGateWay.ApiBaseUrl}').");
        }
    }

    public class FrontEndConfig
    {
        public Uri WebsiteBaseUrl { get; internal set; } = null!;
    }

    public class BackEndApiGateWayConfig
    {
        public Uri ApiBaseUrl { get; internal set; } = null!;
    }
}

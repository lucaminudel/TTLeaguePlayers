using System.Text.Json;

namespace TTLeaguePlayersApp.BackEnd.Configuration.DataStore;

public partial class Loader
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

        return _cachedConfig = new EnvironmentConfig(deserialisedConfigFile, runtimeEnvironment);

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
}

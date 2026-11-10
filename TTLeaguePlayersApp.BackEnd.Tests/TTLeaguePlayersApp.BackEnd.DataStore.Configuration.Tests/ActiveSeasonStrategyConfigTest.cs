using System.Text.Json;
using TTLeaguePlayersApp.BackEnd.Configuration.DataStore;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.Configuration.DataStore.Tests;

public class ActiveSeasonStrategyConfigTest
{
    private const string RequiredSources = """
        {
          "Divisions Teams List": "https://example.test/teams",
          "Divisions Teams Players List": "https://example.test/players?teamId=",
          "League Tables": "https://example.test/tables",
          "Ranking": "https://example.test/ranking",
          "Fixtures": "https://example.test/fixtures"
        }
        """;

    [Fact]
    public void ParsesConfiguredStrategyAndPreservesTheIncompleteQueryValue()
    {
        var configuration = LoadStrategyConfiguration($"\"custom_strategy_processor\":\"TT365.CLTTLStrategy2026Processor\",\"strategy_sources\":{RequiredSources}");

        Assert.Equal("CLTTL", configuration.League);
        Assert.Equal("2026-2027", configuration.Season);
        Assert.Equal("TT365.CLTTLStrategy2026Processor", configuration.CustomStrategyProcessor);
        Assert.Equal(5, configuration.StrategySources.Count);
        Assert.Equal("https://example.test/players?teamId=", configuration.StrategySources["Divisions Teams Players List"].OriginalString);
    }

    [Fact]
    public void AllowsBothStrategySettingsToBeEmpty()
    {
        var configuration = LoadStrategyConfiguration("\"custom_strategy_processor\":\"\",\"strategy_sources\":{}");

        Assert.Empty(configuration.CustomStrategyProcessor);
        Assert.Empty(configuration.StrategySources);
    }

    [Theory]
    [InlineData("\"strategy_sources\":{}")]
    [InlineData("\"custom_strategy_processor\":null,\"strategy_sources\":{}")]
    [InlineData("\"custom_strategy_processor\":\"\"")]
    [InlineData("\"custom_strategy_processor\":\"\",\"strategy_sources\":null")]
    public void RejectsMissingOrNullStrategyProperties(string strategyProperties)
    {
        Assert.Throws<ArgumentException>(() => LoadStrategyConfiguration(strategyProperties));
    }

    [Theory]
    [InlineData("\"custom_strategy_processor\":\"TT365.CLTTLStrategy2026Processor\",\"strategy_sources\":{}")]
    [InlineData("\"custom_strategy_processor\":\"\",\"strategy_sources\":{\"Fixtures\":\"https://example.test/fixtures\"}")]
    public void RejectsMismatchedEmptyAndConfiguredSettings(string strategyProperties)
    {
        Assert.Throws<ArgumentException>(() => LoadStrategyConfiguration(strategyProperties));
    }

    [Theory]
    [InlineData("MissingProcessor")]
    [InlineData("System.String")]
    public void RejectsUnknownOrNonStrategyProcessor(string processorName)
    {
        var strategyProperties = $"\"custom_strategy_processor\":\"{processorName}\",\"strategy_sources\":{RequiredSources}";

        Assert.Throws<ArgumentException>(() => LoadStrategyConfiguration(strategyProperties));
    }

    [Theory]
    [InlineData("Divisions Teams List")]
    [InlineData("Divisions Teams Players List")]
    [InlineData("League Tables")]
    [InlineData("Ranking")]
    [InlineData("Fixtures")]
    public void RejectsEachMissingRequiredSource(string missingSourceName)
    {
        using var sources = JsonDocument.Parse(RequiredSources);
        var remainingSources = sources.RootElement.EnumerateObject()
            .Where(property => property.Name != missingSourceName)
            .ToDictionary(property => property.Name, property => property.Value.GetString());
        var serializedSources = JsonSerializer.Serialize(remainingSources);
        var strategyProperties = $"\"custom_strategy_processor\":\"TT365.CLTTLStrategy2026Processor\",\"strategy_sources\":{serializedSources}";

        Assert.Throws<ArgumentException>(() => LoadStrategyConfiguration(strategyProperties));
    }

    [Fact]
    public void AcceptsDuplicateSourceNamesAndUsesTheLastValue()
    {
        var strategyProperties = "\"custom_strategy_processor\":\"TT365.CLTTLStrategy2026Processor\",\"strategy_sources\":{\"Divisions Teams List\":\"https://example.test/teams\",\"Divisions Teams Players List\":\"https://example.test/players?teamId=\",\"League Tables\":\"https://example.test/tables\",\"Ranking\":\"https://example.test/ranking\",\"Ranking\":\"https://example.test/other-ranking\",\"Fixtures\":\"https://example.test/fixtures\"}";

        var configuration = LoadStrategyConfiguration(strategyProperties);

        Assert.Equal("https://example.test/other-ranking", configuration.StrategySources["Ranking"].OriginalString);
    }

    [Theory]
    [InlineData("\"custom_strategy_processor\":\"TT365.CLTTLStrategy2026Processor\",\"strategy_sources\":[42]")]
    [InlineData("\"custom_strategy_processor\":\"TT365.CLTTLStrategy2026Processor\",\"strategy_sources\":{\"Fixtures\":42}")]
    public void RejectsMalformedStrategySourceStructures(string strategyProperties)
    {
        Assert.ThrowsAny<JsonException>(() => LoadStrategyConfiguration(strategyProperties));
    }

    [Fact]
    public void RejectsEmptyStrategySourceNames()
    {
        var strategyProperties = "\"custom_strategy_processor\":\"TT365.CLTTLStrategy2026Processor\",\"strategy_sources\":{\"\":\"https://example.test/unnamed\"}";

        Assert.Throws<ArgumentException>(() => LoadStrategyConfiguration(strategyProperties));
    }

    [Theory]
    [InlineData("not a url")]
    [InlineData("file:///tmp/strategy")]
    [InlineData("https://")]
    [InlineData("https://example.test/path with spaces")]
    [InlineData("42")]
    public void RejectsInvalidStrategyUrls(string invalidUrl)
    {
        var sourcesWithInvalidUrl = RequiredSources.Replace("https://example.test/fixtures", invalidUrl);
        var strategyProperties = $"\"custom_strategy_processor\":\"TT365.CLTTLStrategy2026Processor\",\"strategy_sources\":{sourcesWithInvalidUrl}";

        Assert.Throws<ArgumentException>(() => LoadStrategyConfiguration(strategyProperties));
    }

    [Fact]
    public void PreservesAdditionalValidNamedSources()
    {
        var sourcesWithExtra = RequiredSources.Replace(
            "\"Fixtures\": \"https://example.test/fixtures\"",
            "\"Fixtures\": \"https://example.test/fixtures\", \"Archive\": \"https://example.test/archive\"");
        var strategyProperties = $"\"custom_strategy_processor\":\"TT365.CLTTLStrategy2026Processor\",\"strategy_sources\":{sourcesWithExtra}";

        var configuration = LoadStrategyConfiguration(strategyProperties);

        Assert.Equal("https://example.test/archive", configuration.StrategySources["Archive"].OriginalString);
    }

    private static ActiveSeasonStrategyConfig LoadStrategyConfiguration(string strategyProperties)
    {
        var json = $$"""
            {
              "FrontEnd": { "WebsiteBaseUrl": "https://example.test" },
              "ApiGateWay": { "ApiBaseUrl": "https://example.test/api", "CreateInviteAutomaticallySendInviteEmail": false },
              "DynamoDB": { "AWS.Profile": "default", "AWS.Region": "eu-west-2" },
              "Cognito": { "UserPoolId": "pool", "ClientId": "client", "Domain": "domain" },
              "EmailForwarder": { "InviteEmailAddress": "invite@example.test", "ContactUsEmailAddress": "contact@example.test", "ForwardToEmailAddress": "forward@example.test" },
              "active_seasons_data_source": [{ "league": "CLTTL", "season": "2026-2027", {{strategyProperties}} }]
            }
            """;
        var environmentConfig = new Loader(json).GetEnvironmentVariables();

        return Assert.Single(environmentConfig.ActiveSeasonsDataSource);
    }
}

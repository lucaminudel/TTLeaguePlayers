using System.Text.Json;
using TTLeaguePlayersApp.BackEnd.Configuration.DataStore;
using ScraperProxyClient = TTLeaguePlayersApp.BackEnd.Strategy.ScraperProxy.ScraperProxy;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.Tests.Strategy.ScraperProxy;

[Trait("Environment", "Staging")]
public class LiveScraperProxyAcceptanceTest
{
    [Fact]
    public async Task FetchesConfiguredClttlSourcesWithExpectedContent()
    {
        var originalEnvironment = Environment.GetEnvironmentVariable("ENVIRONMENT");
        try
        {
            var requestedEnvironment = originalEnvironment;
            var configEnvironment = requestedEnvironment is "dev" or "test" ? requestedEnvironment : "dev";
            Environment.SetEnvironmentVariable("ENVIRONMENT", configEnvironment);
            var configJson = await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory, $"{configEnvironment}.env.json"));
            var clttl = Assert.Single(new Loader(configJson).GetEnvironmentVariables().ActiveSeasonsDataSource,
                season => season.League == "CLTTL" && season.Season == "2026-2027");

            using var scraperProxy = new ScraperProxyClient();
            var teamChecker = await scraperProxy.FetchAsync(clttl.StrategySources["Divisions Teams List"]);
            Assert.Contains("id=\"teamSelect\"", teamChecker);
            Assert.Contains("75774", teamChecker);

            var playersSource = clttl.StrategySources["Divisions Teams Players List"];
            var playersUrl = new Uri(playersSource.OriginalString + "75774");
            var playersJson = await scraperProxy.FetchAsync(playersUrl);
            using (var playersDocument = JsonDocument.Parse(playersJson))
            {
                Assert.Equal(JsonValueKind.Array, playersDocument.RootElement.GetProperty("teamPlayers").ValueKind);
                Assert.Equal(JsonValueKind.Array, playersDocument.RootElement.GetProperty("otherPlayers").ValueKind);
            }

            var tables = await scraperProxy.FetchAsync(clttl.StrategySources["League Tables"]);
            Assert.Contains("League Tables", tables, StringComparison.OrdinalIgnoreCase);

            var ranking = await scraperProxy.FetchAsync(clttl.StrategySources["Ranking"]);
            Assert.Contains("Central London Ranking", ranking, StringComparison.OrdinalIgnoreCase);

            var fixtures = await scraperProxy.FetchAsync(clttl.StrategySources["Fixtures"]);
            Assert.Contains("Fixtures", fixtures, StringComparison.OrdinalIgnoreCase);
        }
        finally
        {
            Environment.SetEnvironmentVariable("ENVIRONMENT", originalEnvironment);
        }
    }
}

using System.Text.Json;
using HtmlAgilityPack;
using TTLeaguePlayersApp.BackEnd.Configuration.DataStore;
using ScraperProxyClient = TTLeaguePlayersApp.BackEnd.Strategy.ScraperProxy.ScraperProxy;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.Tests.ExternalServicesAcceptanceTests.TT365;

public class LiveScraperProxyAcceptanceTest
{
    [Fact]
    public async Task FetchesConfiguredClttlSourcesWithExpectedContent()
    {
        var originalEnvironment = Environment.GetEnvironmentVariable("ENVIRONMENT");
        try
        {
            var configEnvironment = originalEnvironment is "dev" or "test" ? originalEnvironment : "dev";
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
            AssertLeagueTablesHaveExpectedStructure(tables);

            var fixtures = await scraperProxy.FetchAsync(clttl.StrategySources["Fixtures"]);
            Assert.Contains("Fixtures", fixtures, StringComparison.OrdinalIgnoreCase);
        }
        finally
        {
            Environment.SetEnvironmentVariable("ENVIRONMENT", originalEnvironment);
        }
    }

    private static void AssertLeagueTablesHaveExpectedStructure(string html)
    {
        var document = new HtmlDocument();
        document.LoadHtml(html);

        var divisionSections = document.DocumentNode.SelectNodes(
            "//div[contains(concat(' ', normalize-space(@class), ' '), ' tt-table-section ')]");
        Assert.NotNull(divisionSections);
        Assert.NotEmpty(divisionSections!);

        foreach (var section in divisionSections!)
        {
            Assert.NotNull(section.SelectSingleNode(
                ".//h3[contains(concat(' ', normalize-space(@class), ' '), ' tt-table-division-title ')]"));

            var table = section.SelectSingleNode(
                ".//table[contains(concat(' ', normalize-space(@class), ' '), ' tt-league-table ')]");
            Assert.NotNull(table);

            var headers = table!.SelectNodes("./thead/tr/th");
            Assert.NotNull(headers);
            var headerNames = headers!.Select(header => NormalizeCellText(header.InnerText)).ToArray();
            Assert.Equal(headerNames.Length, headerNames.Distinct(StringComparer.OrdinalIgnoreCase).Count());

            var requiredColumns = new[] { "#", "Team", "P", "SF", "SA", "Pts" };
            var columnIndexes = requiredColumns.ToDictionary(
                column => column,
                column => Array.FindIndex(headerNames, header => header.Equals(column, StringComparison.OrdinalIgnoreCase)),
                StringComparer.OrdinalIgnoreCase);
            Assert.All(columnIndexes, column => Assert.True(column.Value >= 0, $"Missing {column.Key} column."));

            var rows = table.SelectNodes("./tbody/tr");
            Assert.NotNull(rows);
            Assert.NotEmpty(rows!);
            foreach (var row in rows!)
            {
                var cells = row.SelectNodes("./td");
                Assert.NotNull(cells);
                Assert.Equal(headerNames.Length, cells!.Count);
                Assert.NotEmpty(NormalizeCellText(cells[columnIndexes["Team"]].InnerText));
                foreach (var numericColumn in new[] { "#", "P", "SF", "SA", "Pts" })
                {
                    Assert.True(int.TryParse(
                        NormalizeCellText(cells[columnIndexes[numericColumn]].InnerText),
                        out _),
                        $"The {numericColumn} value must be an integer.");
                }
            }
        }
    }

    private static string NormalizeCellText(string value) =>
        HtmlEntity.DeEntitize(value).Replace('\u00a0', ' ').Trim();
}

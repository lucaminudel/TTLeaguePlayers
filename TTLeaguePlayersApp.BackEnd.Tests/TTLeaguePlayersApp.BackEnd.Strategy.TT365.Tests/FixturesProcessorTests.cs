using TTLeaguePlayersApp.BackEnd.Strategy.Lambdas;
using System.Globalization;
using System.Text.Json;
using TTLeaguePlayersApp.BackEnd.Strategy.TT365;
using TTLeaguePlayersApp.BackEnd.Strategy.Lambdas;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.Tests.Strategy.TT365;

public sealed class FixturesProcessorTests
{
    [Fact]
    public async Task GetAllDivisionFixtures_FetchesAndParsesTheCapturedPage()
    {
        var sources = Clttl2026TestConfig.Load().StrategySources;
        var source = sources["Fixtures"];
        var directory = Path.Combine(AppContext.BaseDirectory, "Fixtures", "Fixtures");
        var html = File.ReadAllText(Path.Combine(directory, "CLTTL-2026-fixtures.html"));
        var proxy = new ScraperProxyImpersonator(new Dictionary<Uri, IReadOnlyList<ScraperProxyImpersonatorResponse>>
        {
            [source] = [ScraperProxyImpersonatorResponse.FromContent(html)],
            [sources["League Tables"]] = [ScraperProxyImpersonatorResponse.FromContent(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "LeagueTables", "LeagueTables.html")))]
        });

        var (_, divisions, _) = await new CLTTLStrategy2026Processor(proxy, sources).GetAllTablesAndFixtures(new OrderedDictionary<string, Division>());

        using var expected = JsonDocument.Parse(File.ReadAllText(Path.Combine(directory, "CLTTL-2026-fixtures.expected.json")));
        var expectedDivisions = expected.RootElement.EnumerateObject().ToArray();
        Assert.Equal(expectedDivisions.Select(division => division.Name), divisions.Keys);
        foreach (var expectedDivision in expectedDivisions)
        {
            var fixtures = divisions[expectedDivision.Name];
            var expectedFixtures = expectedDivision.Value.EnumerateArray().ToArray();
            Assert.Equal(expectedFixtures.Length, fixtures.Count);
            for (var i = 0; i < fixtures.Count; i++)
            {
                var fixture = fixtures[i];
                var item = expectedFixtures[i];
                Assert.Equal(DateOnly.ParseExact(item.GetProperty("date").GetString()!, "yyyy-MM-dd", CultureInfo.InvariantCulture), fixture.Date);
                Assert.Equal(item.GetProperty("played").GetBoolean(), fixture.Played);
                Assert.Equal(item.GetProperty("homeTeamName").GetString(), fixture.HomeTeamName);
                Assert.Equal(item.GetProperty("awayTeamName").GetString(), fixture.AwayTeamName);
                Assert.Equal(Score(item, "homeTeamScore"), fixture.HomeTeamScore);
                Assert.Equal(Score(item, "awayTeamScore"), fixture.AwayTeamScore);
                AssertPlayers(item.GetProperty("homeTeamPlayersScore"), fixture.HomeTeamPlayersScore);
                AssertPlayers(item.GetProperty("awayTeamPlayersScore"), fixture.AwayTeamPlayersScore);
            }
        }
        Assert.Equal([sources["League Tables"], source], proxy.RequestedUrls);
    }

    [Fact]
    public async Task GetAllTablesAndFixtures_ReturnsReconciliationAnomaliesAndRequiresRosterCoverage()
    {
        var sources = Clttl2026TestConfig.Load().StrategySources;
        var tables = "<div class='tt-table-section'><h3 class='tt-table-division-title'>Premier</h3><table class='tt-league-table'><thead><tr><th>Team</th><th>P</th><th>SF</th><th>SA</th><th>Pts</th></tr></thead><tbody><tr><td>A</td><td>1</td><td>6</td><td>4</td><td>0</td></tr><tr><td>B</td><td>1</td><td>4</td><td>6</td><td>0</td></tr></tbody></table></div>";
        var fixtures = "<h3 class='tt-potm-division-title'>Premier</h3><div class='tt-fixture-week-header'><span class='tt-fixture-week-period'>05 Oct 2026 – 09 Oct 2026</span></div><table class='tt-fixture-table'><tbody><tr><td class='tt-fixture-date'>Mon 05 Oct</td><td class='tt-fixture-teamcell'><a class='tt-team-link'>A</a></td><td class='tt-fixture-score'>vs</td><td class='tt-fixture-teamcell'><a class='tt-team-link'>B</a></td></tr></tbody></table>";
        var proxy = new ScraperProxyImpersonator(new Dictionary<Uri, IReadOnlyList<ScraperProxyImpersonatorResponse>>
        {
            [sources["League Tables"]] = [ScraperProxyImpersonatorResponse.FromContent(tables), ScraperProxyImpersonatorResponse.FromContent(tables)],
            [sources["Fixtures"]] = [ScraperProxyImpersonatorResponse.FromContent(fixtures), ScraperProxyImpersonatorResponse.FromContent(fixtures)]
        });
        var roster = new OrderedDictionary<string, Division> { ["premier"] = new Division("Premier") };
        var processor = new CLTTLStrategy2026Processor(proxy, sources);

        var (parsedTables, parsedFixtures, anomalies) = await processor.GetAllTablesAndFixtures(roster);
        
        Assert.Single(parsedTables);
        Assert.Single(parsedFixtures);
        Assert.Equal(2, anomalies.Count);
        Assert.Equal(new[] { sources["League Tables"], sources["Fixtures"] }, proxy.RequestedUrls);
        roster.Add("Missing", new Division("Missing"));
        await Assert.ThrowsAsync<StrategySourceCheckException>(() => processor.GetAllTablesAndFixtures(roster));
    }

    private static int? Score(JsonElement fixture, string name) =>
        fixture.GetProperty(name).ValueKind == JsonValueKind.Null ? null : fixture.GetProperty(name).GetInt32();

    private static void AssertPlayers(JsonElement expected, IReadOnlyList<PlayerScore> players) =>
        Assert.Equal(expected.EnumerateArray().Select(player => (player.GetProperty("name").GetString()!, player.GetProperty("won").GetInt32(), player.GetProperty("played").GetInt32())),
            players.Select(player => (player.Name, player.Won, player.Played)));
}

using System.Text.Json;
using TTLeaguePlayersApp.BackEnd.Strategy.TT365;
using TTLeaguePlayersApp.BackEnd.Strategy.Lambdas;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.Tests.Strategy.TT365;

public sealed class LeagueTablesProcessorTests
{
    [Fact]
    public async Task GetAllDivisionTables_FetchesAndParsesAllConfiguredDivisionStandings()
    {
        var sources = Clttl2026TestConfig.Load().StrategySources;
        var source = sources["League Tables"];
        var html = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "LeagueTables", "LeagueTables.html"));
        var proxy = new ScraperProxyImpersonator(new Dictionary<Uri, IReadOnlyList<ScraperProxyImpersonatorResponse>>
        {
            [source] = [ScraperProxyImpersonatorResponse.FromContent(html)],
            [sources["Fixtures"]] = [ScraperProxyImpersonatorResponse.FromContent(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "Fixtures", "CLTTL-2026-fixtures.html")))]
        });
        var processor = new CLTTLStrategy2026Processor(proxy, sources);
        
        var (tables, _, _) = await processor.GetAllTablesAndFixtures(new OrderedDictionary<string, Division>());

        using var expected = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "LeagueTables", "ExpectedStandings.json")));
        LeagueTablesParserTests.CheckTables(expected.RootElement, tables);
        Assert.Equal([source, sources["Fixtures"]], proxy.RequestedUrls);
    }
}

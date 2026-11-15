using TTLeaguePlayersApp.BackEnd.Strategy.TT365;
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
            [source] = [ScraperProxyImpersonatorResponse.FromContent(html)]
        });
        var processor = new CLTTLStrategy2026Processor(proxy, sources);

        var tables = await processor.GetAllDivisionTables();

        Assert.Equal(8, tables.Count);
        Assert.Equal(12, tables["Premier"].TeamsStanding.Count);
        Assert.Equal(6, tables["Premier"].TeamsStanding["St Katharines Trust 1"].Played);
        Assert.Equal([source], proxy.RequestedUrls);
    }
}

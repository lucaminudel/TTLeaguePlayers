using TTLeaguePlayersApp.BackEnd.Strategy.Lambdas;
using TTLeaguePlayersApp.BackEnd.Strategy.TT365;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.Tests.Strategy.TT365;

public sealed class LeagueTablesFetcherTests
{
    [Fact]
    public async Task FetchLeagueTablesAsync_FetchesTheConfiguredSourceOnce()
    {
        var source = Clttl2026TestConfig.Load().StrategySources["League Tables"];
        var html = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "LeagueTables", "LeagueTables.html"));
        var proxy = new ScraperProxyImpersonator(new Dictionary<Uri, IReadOnlyList<ScraperProxyImpersonatorResponse>>
        {
            [source] = [ScraperProxyImpersonatorResponse.FromContent(html)]
        });
        var fetcher = new CLTTLStrategy2026Fetcher(proxy, Clttl2026TestConfig.Load().StrategySources);

        var result = await fetcher.FetchLeagueTablesAsync();

        Assert.Equal(html, result);
        Assert.Equal([source], proxy.RequestedUrls);
    }

    [Fact]
    public async Task FetchLeagueTablesAsync_PreservesNamedProxyFailure()
    {
        var sources = Clttl2026TestConfig.Load().StrategySources;
        var source = sources["League Tables"];
        var failure = new HttpRequestException("configured fetch failure");
        var proxy = new ScraperProxyImpersonator(new Dictionary<Uri, IReadOnlyList<ScraperProxyImpersonatorResponse>>
        {
            [source] = [ScraperProxyImpersonatorResponse.FromException(failure)]
        });
        var fetcher = new CLTTLStrategy2026Fetcher(proxy, sources);

        var thrownException = await Assert.ThrowsAsync<StrategySourceCheckException>(() => fetcher.FetchLeagueTablesAsync());

        Assert.Equal("League Tables", thrownException.SourceName);
        Assert.Equal("fetch", thrownException.Stage);
        Assert.Same(failure, thrownException.InnerException);
        Assert.Equal([source], proxy.RequestedUrls);
    }
}

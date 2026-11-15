using TTLeaguePlayersApp.BackEnd.Strategy.TT365;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.Tests.Strategy.TT365;

public sealed class RankingPageFetcherTests
{
    [Fact]
    public async Task FetchRankingPageAsync_FetchesOnlyTheRequestedPageWithoutParsingIt()
    {
        var sources = Clttl2026TestConfig.Load().StrategySources;
        var expectedUri = new Uri(sources["Ranking"].OriginalString + "2");
        const string content = "not a ranking page";
        var proxy = new ScraperProxyImpersonator(new Dictionary<Uri, IReadOnlyList<ScraperProxyImpersonatorResponse>>
        {
            [expectedUri] = [ScraperProxyImpersonatorResponse.FromContent(content)]
        });
        var fetcher = new CLTTLStrategy2026Fetcher(proxy, sources);

        var result = await fetcher.FetchRankingPageAsync(2);

        Assert.Equal(content, result);
        Assert.Equal([expectedUri], proxy.RequestedUrls);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    public void FetchRankingPageAsync_RejectsNonpositivePageNumbers(int pageNumber)
    {
        var proxy = new ScraperProxyImpersonator(new Dictionary<Uri, IReadOnlyList<ScraperProxyImpersonatorResponse>>());
        var fetcher = new CLTTLStrategy2026Fetcher(proxy, Clttl2026TestConfig.Load().StrategySources);

        Assert.Throws<ArgumentOutOfRangeException>(() => { _ = fetcher.FetchRankingPageAsync(pageNumber); });
        Assert.Empty(proxy.RequestedUrls);
    }
}

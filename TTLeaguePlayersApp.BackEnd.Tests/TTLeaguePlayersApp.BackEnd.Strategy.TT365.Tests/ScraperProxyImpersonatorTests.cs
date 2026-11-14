using Xunit;

namespace TTLeaguePlayersApp.BackEnd.Tests.Strategy.TT365;

public class ScraperProxyImpersonatorTests
{
    private static readonly Uri RankingPage1Url = new("https://www.tabletennis365.com/CentralLondon/Ranking?p=1");
    private static readonly Uri RankingPage2Url = new("https://www.tabletennis365.com/CentralLondon/Ranking?p=2");

    [Fact]
    public async Task FetchAsync_ReturnsTheFixtureConfiguredForTheExactUrl()
    {
        var expectedHtml = ReadFixture("RankingPage1.html");
        var impersonator = CreateImpersonator((RankingPage1Url, Content(expectedHtml)));

        var actualHtml = await impersonator.FetchAsync(RankingPage1Url);

        Assert.Equal(expectedHtml, actualHtml);
        Assert.Equal([RankingPage1Url], impersonator.RequestedUrls);
    }

    [Fact]
    public async Task FetchAsync_RejectsUnknownUrlsAndAdditionalQueryParameters()
    {
        var impersonator = CreateImpersonator((RankingPage1Url, Content(ReadFixture("RankingPage1.html"))));
        var unexpectedUrl = new Uri(RankingPage1Url.OriginalString + "&unexpected=1");

        var exception = await Assert.ThrowsAsync<InvalidOperationException>(() => impersonator.FetchAsync(unexpectedUrl));

        Assert.Contains(unexpectedUrl.OriginalString, exception.Message, StringComparison.Ordinal);
        Assert.Equal([unexpectedUrl], impersonator.RequestedUrls);
    }

    [Fact]
    public async Task FetchAsync_UsesConfiguredResponseSequenceForRepeatedPassesAndPropagatesConfiguredExceptions()
    {
        var fetchFailure = new HttpRequestException("configured page fetch failure");
        var firstPage = ReadFixture("RankingPage1.html");
        var secondPage = ReadFixture("RankingPage2.html");
        var impersonator = new ScraperProxyImpersonator(new Dictionary<Uri, IReadOnlyList<ScraperProxyImpersonatorResponse>>
        {
            [RankingPage1Url] = [Content(firstPage), Content(secondPage)],
            [RankingPage2Url] = [Failure(fetchFailure)]
        });

        Assert.Equal(firstPage, await impersonator.FetchAsync(RankingPage1Url));
        Assert.Equal(secondPage, await impersonator.FetchAsync(RankingPage1Url));
        var thrownException = await Assert.ThrowsAsync<HttpRequestException>(() => impersonator.FetchAsync(RankingPage2Url));

        Assert.Same(fetchFailure, thrownException);
        Assert.Equal([RankingPage1Url, RankingPage1Url, RankingPage2Url], impersonator.RequestedUrls);
    }

    [Fact]
    public async Task SeparateInstancesKeepResponseSequencesAndRequestHistoryIndependent()
    {
        var firstInstance = CreateImpersonator((RankingPage1Url, Content("first"), Content("second")));
        var secondInstance = CreateImpersonator((RankingPage1Url, Content("independent")));

        Assert.Equal("first", await firstInstance.FetchAsync(RankingPage1Url));
        Assert.Equal("independent", await secondInstance.FetchAsync(RankingPage1Url));
        Assert.Equal("second", await firstInstance.FetchAsync(RankingPage1Url));

        Assert.Equal([RankingPage1Url, RankingPage1Url], firstInstance.RequestedUrls);
        Assert.Equal([RankingPage1Url], secondInstance.RequestedUrls);
    }

    private static ScraperProxyImpersonator CreateImpersonator((Uri Url, ScraperProxyImpersonatorResponse Response) route) =>
        new(new Dictionary<Uri, IReadOnlyList<ScraperProxyImpersonatorResponse>>
        {
            [route.Url] = [route.Response]
        });

    private static ScraperProxyImpersonator CreateImpersonator((Uri Url, ScraperProxyImpersonatorResponse First, ScraperProxyImpersonatorResponse Second) route) =>
        new(new Dictionary<Uri, IReadOnlyList<ScraperProxyImpersonatorResponse>>
        {
            [route.Url] = [route.First, route.Second]
        });

    private static ScraperProxyImpersonatorResponse Content(string content) => ScraperProxyImpersonatorResponse.FromContent(content);

    private static ScraperProxyImpersonatorResponse Failure(Exception exception) => ScraperProxyImpersonatorResponse.FromException(exception);

    private static string ReadFixture(string fixtureName) =>
        File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "Ranking", fixtureName));
}

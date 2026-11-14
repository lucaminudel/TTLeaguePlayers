using TTLeaguePlayersApp.BackEnd.Strategy.TT365;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.Tests.Strategy.TT365;

public class RankingPagesFetcherTests
{
    private static readonly Uri RankingUriPrefix = new("https://www.tabletennis365.com/CentralLondon/Ranking?p=");
    private static readonly Uri Page1Url = new("https://www.tabletennis365.com/CentralLondon/Ranking?p=1");
    private static readonly Uri Page2Url = new("https://www.tabletennis365.com/CentralLondon/Ranking?p=2");

    [Fact]
    public async Task FetchRankingPagesAsync_FollowsConsecutivePagesAndStopsAtDisabledNext()
    {
        var page1 = ReadFixture("RankingPage1.html");
        var page2 = ReadFixture("RankingPage2.html");
        var proxy = CreateProxy((Page1Url, page1), (Page2Url, page2));
        var fetcher = new CLTTLStrategy2026Fetcher(proxy, RankingUriPrefix);

        var pages = await fetcher.FetchRankingPagesAsync();

        Assert.Equal([page1, page2], pages);
        Assert.Equal([Page1Url, Page2Url], proxy.RequestedUrls);
    }

    [Fact]
    public async Task FetchRankingPagesAsync_AcceptsAValidSinglePageRanking()
    {
        var onlyPage = CreatePage(currentPage: 1, lastPage: 1, rangeStart: 1, rangeEnd: 4, totalPlayers: 4, nextDisabled: true);
        var proxy = CreateProxy((Page1Url, onlyPage));
        var fetcher = new CLTTLStrategy2026Fetcher(proxy, RankingUriPrefix);

        var pages = await fetcher.FetchRankingPagesAsync();

        Assert.Equal([onlyPage], pages);
        Assert.Equal([Page1Url], proxy.RequestedUrls);
    }

    [Fact]
    public void TryParseRankingPageMetadata_ExtractsDatesRangeAndPaginationSignals()
    {
        var parser = new CLTTLStrategy2026Parser();
        var page1 = CreatePage(1, 2, 1, 2, 4);
        var page2 = CreatePage(2, 2, 3, 4, 4, nextDisabled: true);

        Assert.True(parser.TryParseRankingPageMetadata(page1, out var firstPageMetadata));
        Assert.NotNull(firstPageMetadata);
        Assert.Equal(new DateOnly(2026, 11, 12), firstPageMetadata.LastUpdated);
        Assert.Equal(new DateOnly(2026, 10, 31), firstPageMetadata.PeriodEnding);
        Assert.Equal((1, 2, 4, 1, 2, false), (
            firstPageMetadata.RangeStart,
            firstPageMetadata.RangeEnd,
            firstPageMetadata.TotalPlayers,
            firstPageMetadata.CurrentPage,
            firstPageMetadata.NextPage,
            firstPageMetadata.IsNextDisabled));

        Assert.True(parser.TryParseRankingPageMetadata(page2, out var finalPageMetadata));
        Assert.NotNull(finalPageMetadata);
        Assert.Equal((3, 4, 4, 2, 3, true), (
            finalPageMetadata.RangeStart,
            finalPageMetadata.RangeEnd,
            finalPageMetadata.TotalPlayers,
            finalPageMetadata.CurrentPage,
            finalPageMetadata.NextPage,
            finalPageMetadata.IsNextDisabled));

        Assert.True(parser.TryParseRankingPageMetadata(ReadFixture("RankingPage1.html"), out var fixturePage1Metadata));
        Assert.True(parser.TryParseRankingPageMetadata(ReadFixture("RankingPage2.html"), out var fixturePage2Metadata));
        Assert.Equal((1, 4, 6, 1, 2, false), (
            fixturePage1Metadata!.RangeStart,
            fixturePage1Metadata.RangeEnd,
            fixturePage1Metadata.TotalPlayers,
            fixturePage1Metadata.CurrentPage,
            fixturePage1Metadata.NextPage,
            fixturePage1Metadata.IsNextDisabled));
        Assert.Equal((5, 6, 6, 2, 3, true), (
            fixturePage2Metadata!.RangeStart,
            fixturePage2Metadata.RangeEnd,
            fixturePage2Metadata.TotalPlayers,
            fixturePage2Metadata.CurrentPage,
            fixturePage2Metadata.NextPage,
            fixturePage2Metadata.IsNextDisabled));
    }

    [Theory]
    [InlineData("last-updated")]
    [InlineData("period-ending")]
    [InlineData("total")]
    public async Task FetchRankingPagesAsync_RestartsWhenPageSnapshotChanges(string changedValue)
    {
        var firstSnapshotPage1 = CreatePage(1, 2, 1, 2, 4, lastUpdated: "12 Nov 2026", periodEnding: "31 Oct 2026");
        var secondSnapshotPage1 = CreatePage(1, 2, 1, 2, 5, lastUpdated: "13 Nov 2026", periodEnding: "30 Nov 2026");
        var inconsistentPage2 = changedValue switch
        {
            "last-updated" => CreatePage(2, 2, 3, 4, 4, lastUpdated: "13 Nov 2026", periodEnding: "31 Oct 2026", nextDisabled: true),
            "period-ending" => CreatePage(2, 2, 3, 4, 4, lastUpdated: "12 Nov 2026", periodEnding: "30 Nov 2026", nextDisabled: true),
            "total" => CreatePage(2, 2, 3, 5, 5, lastUpdated: "12 Nov 2026", periodEnding: "31 Oct 2026", nextDisabled: true),
            _ => throw new ArgumentOutOfRangeException(nameof(changedValue))
        };
        var consistentPage2 = CreatePage(2, 2, 3, 5, 5, lastUpdated: "13 Nov 2026", periodEnding: "30 Nov 2026", nextDisabled: true);
        var proxy = CreateProxy(
            (Page1Url, firstSnapshotPage1, secondSnapshotPage1),
            (Page2Url, inconsistentPage2, consistentPage2));
        var fetcher = new CLTTLStrategy2026Fetcher(proxy, RankingUriPrefix);

        var acceptedPages = await fetcher.FetchRankingPagesAsync();

        Assert.Equal([secondSnapshotPage1, consistentPage2], acceptedPages);
        Assert.Equal([Page1Url, Page2Url, Page1Url, Page2Url], proxy.RequestedUrls);
    }

    [Theory]
    [InlineData(4, 4)]
    [InlineData(2, 4)]
    public async Task FetchRankingPagesAsync_RestartsAndThenFailsForGapsOrOverlaps(int secondPageRangeStart, int secondPageRangeEnd)
    {
        var firstPage = CreatePage(1, 2, 1, 2, 4);
        var inconsistentSecondPage = CreatePage(2, 2, secondPageRangeStart, secondPageRangeEnd, 4, nextDisabled: true);
        var proxy = CreateRetryingProxy((Page1Url, firstPage), (Page2Url, inconsistentSecondPage));
        var fetcher = new CLTTLStrategy2026Fetcher(proxy, RankingUriPrefix);

        var exception = await Assert.ThrowsAsync<InvalidOperationException>(() => fetcher.FetchRankingPagesAsync());

        Assert.Contains("inconsistent after restarting once", exception.Message, StringComparison.Ordinal);
        Assert.Equal([Page1Url, Page2Url, Page1Url, Page2Url], proxy.RequestedUrls);
    }

    [Fact]
    public async Task FetchRankingPagesAsync_RestartsWhenARepeatedPageBreaksTheRequestedPageSequence()
    {
        var firstPage = CreatePage(1, 2, 1, 2, 4);
        var repeatedPage = CreatePage(1, 2, 1, 2, 4);
        var proxy = CreateRetryingProxy((Page1Url, firstPage), (Page2Url, repeatedPage));
        var fetcher = new CLTTLStrategy2026Fetcher(proxy, RankingUriPrefix);

        await Assert.ThrowsAsync<InvalidOperationException>(() => fetcher.FetchRankingPagesAsync());

        Assert.Equal([Page1Url, Page2Url, Page1Url, Page2Url], proxy.RequestedUrls);
    }

    [Theory]
    [InlineData("Last updated:")]
    [InlineData("Showing 1–2 of 4 ranked players")]
    public async Task FetchRankingPagesAsync_RestartsWhenRequiredMetadataIsMissing(string requiredMetadata)
    {
        var malformedPage = CreatePage(1, 2, 1, 2, 4).Replace(requiredMetadata, "Missing metadata", StringComparison.Ordinal);
        var proxy = CreateRetryingProxy((Page1Url, malformedPage));
        var fetcher = new CLTTLStrategy2026Fetcher(proxy, RankingUriPrefix);

        var exception = await Assert.ThrowsAsync<InvalidOperationException>(() => fetcher.FetchRankingPagesAsync());

        Assert.Contains("inconsistent after restarting once", exception.Message, StringComparison.Ordinal);
        Assert.Equal([Page1Url, Page1Url], proxy.RequestedUrls);
    }

    [Fact]
    public async Task FetchRankingPagesAsync_RestartsWhenDisabledNextConflictsWithTheLastPageAndCoverage()
    {
        var pageWithConflictingSignals = CreatePage(1, 2, 1, 2, 4, nextDisabled: true);
        var proxy = CreateRetryingProxy((Page1Url, pageWithConflictingSignals));
        var fetcher = new CLTTLStrategy2026Fetcher(proxy, RankingUriPrefix);

        await Assert.ThrowsAsync<InvalidOperationException>(() => fetcher.FetchRankingPagesAsync());

        Assert.Equal([Page1Url, Page1Url], proxy.RequestedUrls);
    }

    [Fact]
    public async Task FetchRankingPagesAsync_PropagatesProxyFailureWithoutRestartingCoverage()
    {
        var fetchFailure = new HttpRequestException("configured network failure");
        var proxy = new ScraperProxyImpersonator(new Dictionary<Uri, IReadOnlyList<ScraperProxyImpersonatorResponse>>
        {
            [Page1Url] = [ScraperProxyImpersonatorResponse.FromException(fetchFailure)]
        });
        var fetcher = new CLTTLStrategy2026Fetcher(proxy, RankingUriPrefix);

        var thrownException = await Assert.ThrowsAsync<HttpRequestException>(() => fetcher.FetchRankingPagesAsync());

        Assert.Same(fetchFailure, thrownException);
        Assert.Equal([Page1Url], proxy.RequestedUrls);
    }

    private static ScraperProxyImpersonator CreateProxy(params (Uri Url, string Content)[] responses) =>
        new(responses.ToDictionary(
            response => response.Url,
            response => (IReadOnlyList<ScraperProxyImpersonatorResponse>)[ScraperProxyImpersonatorResponse.FromContent(response.Content)]));

    private static ScraperProxyImpersonator CreateRetryingProxy(params (Uri Url, string Content)[] responses) =>
        new(responses.ToDictionary(
            response => response.Url,
            response => (IReadOnlyList<ScraperProxyImpersonatorResponse>)[
                ScraperProxyImpersonatorResponse.FromContent(response.Content),
                ScraperProxyImpersonatorResponse.FromContent(response.Content)]));

    private static ScraperProxyImpersonator CreateProxy(
        (Uri Url, string FirstContent, string SecondContent) first,
        (Uri Url, string FirstContent, string SecondContent) second) =>
        new(new Dictionary<Uri, IReadOnlyList<ScraperProxyImpersonatorResponse>>
        {
            [first.Url] = [ScraperProxyImpersonatorResponse.FromContent(first.FirstContent), ScraperProxyImpersonatorResponse.FromContent(first.SecondContent)],
            [second.Url] = [ScraperProxyImpersonatorResponse.FromContent(second.FirstContent), ScraperProxyImpersonatorResponse.FromContent(second.SecondContent)]
        });

    private static string CreatePage(
        int currentPage,
        int lastPage,
        int rangeStart,
        int rangeEnd,
        int totalPlayers,
        string lastUpdated = "12 Nov 2026",
        string periodEnding = "31 Oct 2026",
        bool nextDisabled = false)
    {
        var pageLinks = string.Join("", Enumerable.Range(1, lastPage).Select(pageNumber =>
            $"<li class=\"page-item {(pageNumber == currentPage ? "active" : string.Empty)}\"><a href=\"?p={pageNumber}\">{pageNumber}</a></li>"));
        var disabledClass = nextDisabled ? " disabled" : string.Empty;

        return $"""
            <!doctype html>
            <html><body>
              <div>Last updated:: {lastUpdated} · Period ending:: {periodEnding}</div>
              <p>Showing {rangeStart}–{rangeEnd} of {totalPlayers} ranked players</p>
              <ul class="pagination">{pageLinks}<li class="page-item{disabledClass}"><a href="?p={currentPage + 1}">›</a></li></ul>
            </body></html>
            """;
    }

    private static string ReadFixture(string fixtureName) =>
        File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "Ranking", fixtureName));
}

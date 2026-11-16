using TTLeaguePlayersApp.BackEnd.Strategy.TT365;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.Tests.Strategy.TT365;

public class RankingPagesProcessorTests
{
    private static readonly IReadOnlyDictionary<string, Uri> StrategySources = Clttl2026TestConfig.Load().StrategySources;
    private static readonly Uri Page1Url = new(StrategySources["Ranking"].OriginalString + "1");
    private static readonly Uri Page2Url = new(StrategySources["Ranking"].OriginalString + "2");

    [Fact]
    public async Task GetAllRankingPlayers_ParsesEveryPlayerFromCapturedPages()
    {
        var urls = Enumerable.Range(1, 3).Select(i => new Uri(StrategySources["Ranking"].OriginalString + i)).ToArray();
        var proxy = CreateProxy(urls.Select((url, i) => (url, ReadFixture($"CapturedRankingPage{i + 1}.html"))).ToArray());
        var (players, anomalies) = await new CLTTLStrategy2026Processor(proxy, StrategySources).GetAllRankingPlayers();
        RankingPagesParserTests.AssertCapturedPlayers(players, anomalies);
        Assert.Equal(urls, proxy.RequestedUrls);
    }

    [Fact]
    public void TryParseRankingPageMetadata_ParsesEveryCapturedPage()
    {
        var parser = new CLTTLStrategy2026Parser();
        var starts = new[] { 1, 501, 1001 };
        var ends = new[] { 500, 1000, 1011 };
        for (var i = 1; i <= 3; i++)
        {
            var page = ParserPageImpersonator.Fetch("Ranking", ReadFixture($"CapturedRankingPage{i}.html"));
            Assert.True(parser.TryParseRankingPageMetadata(page, out var metadata));
            Assert.NotNull(metadata);
            Assert.Equal(new DateOnly(2026, 11, 12), metadata!.LastUpdated);
            Assert.Equal(new DateOnly(2026, 10, 31), metadata.PeriodEnding);
            Assert.Equal((starts[i - 1], ends[i - 1], 1011, i, i + 1, i == 3),
                (metadata.RangeStart, metadata.RangeEnd, metadata.TotalPlayers, metadata.CurrentPage, metadata.NextPage, metadata.IsNextDisabled));
        }
    }

    [Fact]
    public async Task GetAllRankingPlayers_FollowsConsecutivePagesAndStopsAtDisabledNext()
    {
        var page1 = ReadFixture("RankingPage1.html");
        var page2 = ReadFixture("RankingPage2.html");
        var proxy = CreateProxy((Page1Url, page1), (Page2Url, page2));
        var processor = new CLTTLStrategy2026Processor(proxy, StrategySources);

        var (players, anomalies) = await processor.GetAllRankingPlayers();

        Assert.Equal(2050, players["Casey O'Brien"].CurrentRanking);
        Assert.Equal(0, players["Riley & Morgan"].CurrentRanking);
        Assert.Equal(1250, players["Jordan Smith"].CurrentRanking);
        Assert.Contains(anomalies, anomaly => anomaly.Contains("Duplicate player", StringComparison.Ordinal));
        Assert.Equal([Page1Url, Page2Url], proxy.RequestedUrls);
    }

    [Fact]
    public async Task GetAllRankingPlayers_AcceptsAValidSinglePageRanking()
    {
        var onlyPage = CreatePage(currentPage: 1, lastPage: 1, rangeStart: 1, rangeEnd: 4, totalPlayers: 4, nextDisabled: true);
        var proxy = CreateProxy((Page1Url, onlyPage));
        var processor = new CLTTLStrategy2026Processor(proxy, StrategySources);

        var (players, anomalies) = await processor.GetAllRankingPlayers();

        Assert.Equal(1200, players["Player 1"].CurrentRanking);
        Assert.Empty(anomalies);
        Assert.Equal([Page1Url], proxy.RequestedUrls);
    }

    [Fact]
    public void TryParseRankingPageMetadata_ExtractsDatesRangeAndPaginationSignals()
    {
        var parser = new CLTTLStrategy2026Parser();
        var page1 = ParserPageImpersonator.Fetch("Ranking", CreatePage(1, 2, 1, 2, 4));
        var page2 = ParserPageImpersonator.Fetch("Ranking", CreatePage(2, 2, 3, 4, 4, nextDisabled: true));

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

        Assert.True(parser.TryParseRankingPageMetadata(ParserPageImpersonator.Fetch("Ranking", ReadFixture("RankingPage1.html")), out var fixturePage1Metadata));
        Assert.True(parser.TryParseRankingPageMetadata(ParserPageImpersonator.Fetch("Ranking", ReadFixture("RankingPage2.html")), out var fixturePage2Metadata));
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
    public async Task GetAllRankingPlayers_RestartsWhenPageSnapshotChanges(string changedValue)
    {
        var firstSnapshotPage1 = CreatePage(1, 2, 1, 2, 4, lastUpdated: "12 Nov 2026", periodEnding: "31 Oct 2026", playerName: "Old Snapshot");
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
        var processor = new CLTTLStrategy2026Processor(proxy, StrategySources);

        var (players, anomalies) = await processor.GetAllRankingPlayers();

        Assert.Equal(1200, players["Player 1"].CurrentRanking);
        Assert.Equal(1200, players["Player 2"].CurrentRanking);
        Assert.DoesNotContain("Old Snapshot", players.Keys);
        Assert.Empty(anomalies);
        Assert.Equal([Page1Url, Page2Url, Page1Url, Page2Url], proxy.RequestedUrls);
    }

    [Theory]
    [InlineData(4, 4)]
    [InlineData(2, 4)]
    public async Task GetAllRankingPlayers_RestartsAndThenFailsForGapsOrOverlaps(int secondPageRangeStart, int secondPageRangeEnd)
    {
        var firstPage = CreatePage(1, 2, 1, 2, 4);
        var inconsistentSecondPage = CreatePage(2, 2, secondPageRangeStart, secondPageRangeEnd, 4, nextDisabled: true);
        var proxy = CreateRetryingProxy((Page1Url, firstPage), (Page2Url, inconsistentSecondPage));
        var processor = new CLTTLStrategy2026Processor(proxy, StrategySources);

        var exception = await Assert.ThrowsAsync<InvalidOperationException>(() => processor.GetAllRankingPlayers());

        Assert.Contains("inconsistent after three attempts", exception.Message, StringComparison.Ordinal);
        Assert.Equal([Page1Url, Page2Url, Page1Url, Page2Url, Page1Url, Page2Url], proxy.RequestedUrls);
    }

    [Fact]
    public async Task GetAllRankingPlayers_RestartsWhenARepeatedPageBreaksTheRequestedPageSequence()
    {
        var firstPage = CreatePage(1, 2, 1, 2, 4);
        var repeatedPage = CreatePage(1, 2, 1, 2, 4);
        var proxy = CreateRetryingProxy((Page1Url, firstPage), (Page2Url, repeatedPage));
        var processor = new CLTTLStrategy2026Processor(proxy, StrategySources);

        await Assert.ThrowsAsync<InvalidOperationException>(() => processor.GetAllRankingPlayers());

        Assert.Equal([Page1Url, Page2Url, Page1Url, Page2Url, Page1Url, Page2Url], proxy.RequestedUrls);
    }

    [Theory]
    [InlineData("Last updated:")]
    [InlineData("Showing 1–2 of 4 ranked players")]
    public async Task GetAllRankingPlayers_RestartsWhenRequiredMetadataIsMissing(string requiredMetadata)
    {
        var malformedPage = CreatePage(1, 2, 1, 2, 4).Replace(requiredMetadata, "Missing metadata", StringComparison.Ordinal);
        var proxy = CreateRetryingProxy((Page1Url, malformedPage));
        var processor = new CLTTLStrategy2026Processor(proxy, StrategySources);

        var exception = await Assert.ThrowsAsync<InvalidOperationException>(() => processor.GetAllRankingPlayers());

        Assert.Contains("inconsistent after three attempts", exception.Message, StringComparison.Ordinal);
        Assert.Equal([Page1Url, Page1Url, Page1Url], proxy.RequestedUrls);
    }

    [Fact]
    public async Task GetAllRankingPlayers_RestartsWhenDisabledNextConflictsWithTheLastPageAndCoverage()
    {
        var pageWithConflictingSignals = CreatePage(1, 2, 1, 2, 4, nextDisabled: true);
        var proxy = CreateRetryingProxy((Page1Url, pageWithConflictingSignals));
        var processor = new CLTTLStrategy2026Processor(proxy, StrategySources);

        await Assert.ThrowsAsync<InvalidOperationException>(() => processor.GetAllRankingPlayers());

        Assert.Equal([Page1Url, Page1Url, Page1Url], proxy.RequestedUrls);
    }

    [Fact]
    public async Task GetAllRankingPlayers_PropagatesProxyFailureWithoutRestartingCoverage()
    {
        var fetchFailure = new HttpRequestException("configured network failure");
        var proxy = new ScraperProxyImpersonator(new Dictionary<Uri, IReadOnlyList<ScraperProxyImpersonatorResponse>>
        {
            [Page1Url] = [ScraperProxyImpersonatorResponse.FromException(fetchFailure)]
        });
        var processor = new CLTTLStrategy2026Processor(proxy, StrategySources);

        var thrownException = await Assert.ThrowsAsync<HttpRequestException>(() => processor.GetAllRankingPlayers());

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
        bool nextDisabled = false,
        string? playerName = null)
    {
        var pageLinks = string.Join("", Enumerable.Range(1, lastPage).Select(pageNumber =>
            ReadFixture("PaginationLink.html")
                .Replace("{{ACTIVE}}", pageNumber == currentPage ? "active" : string.Empty, StringComparison.Ordinal)
                .Replace("{{PAGE}}", pageNumber.ToString(), StringComparison.Ordinal)));

        return ReadFixture("RankingScenario.html")
            .Replace("{{LAST_UPDATED}}", lastUpdated, StringComparison.Ordinal)
            .Replace("{{PERIOD_ENDING}}", periodEnding, StringComparison.Ordinal)
            .Replace("{{CURRENT_PAGE}}", currentPage.ToString(), StringComparison.Ordinal)
            .Replace("{{PLAYER_NAME}}", playerName ?? $"Player {currentPage}", StringComparison.Ordinal)
            .Replace("{{RANGE_START}}", rangeStart.ToString(), StringComparison.Ordinal)
            .Replace("{{RANGE_END}}", rangeEnd.ToString(), StringComparison.Ordinal)
            .Replace("{{TOTAL}}", totalPlayers.ToString(), StringComparison.Ordinal)
            .Replace("{{PAGE_LINKS}}", pageLinks, StringComparison.Ordinal)
            .Replace("{{DISABLED}}", nextDisabled ? " disabled" : string.Empty, StringComparison.Ordinal)
            .Replace("{{NEXT_PAGE}}", (currentPage + 1).ToString(), StringComparison.Ordinal);
    }

    private static string ReadFixture(string fixtureName) =>
        File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "Ranking", fixtureName));
}

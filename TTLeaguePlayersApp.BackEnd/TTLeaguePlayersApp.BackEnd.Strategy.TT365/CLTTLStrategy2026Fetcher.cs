using System.Globalization;
using TTLeaguePlayersApp.BackEnd.Strategy.ScraperProxy;

namespace TTLeaguePlayersApp.BackEnd.Strategy.TT365;

public sealed class CLTTLStrategy2026Fetcher
{
    private const int MaximumCoveragePasses = 2;

    private readonly IScraperProxy _scraperProxy;
    private readonly Uri _rankingPageUriPrefix;
    private readonly CLTTLStrategy2026Parser _parser;

    public CLTTLStrategy2026Fetcher(IScraperProxy scraperProxy, Uri rankingPageUriPrefix)
    {
        ArgumentNullException.ThrowIfNull(scraperProxy);
        ArgumentNullException.ThrowIfNull(rankingPageUriPrefix);
        if (!rankingPageUriPrefix.IsAbsoluteUri)
            throw new ArgumentException("The ranking page URI prefix must be absolute.", nameof(rankingPageUriPrefix));
        if (!rankingPageUriPrefix.OriginalString.EndsWith("p=", StringComparison.OrdinalIgnoreCase))
            throw new ArgumentException("The ranking page URI prefix must end with the page query parameter 'p='.", nameof(rankingPageUriPrefix));

        _scraperProxy = scraperProxy;
        _rankingPageUriPrefix = rankingPageUriPrefix;
        _parser = new CLTTLStrategy2026Parser();
    }

    public async Task<IReadOnlyList<string>> FetchRankingPagesAsync()
    {
        for (var pass = 1; pass <= MaximumCoveragePasses; pass++)
        {
            var completePass = await TryFetchCompletePassAsync();
            if (completePass is not null)
                return completePass;
        }

        throw new InvalidOperationException("Ranking page coverage remained inconsistent after restarting once from page 1.");
    }

    private async Task<IReadOnlyList<string>?> TryFetchCompletePassAsync()
    {
        var fetchedPages = new List<string>();
        RankingPageMetadata? firstPageMetadata = null;
        var requestedPage = 1;
        var expectedRangeStart = 1;

        while (true)
        {
            var pageHtml = await _scraperProxy.FetchAsync(BuildPageUri(requestedPage));
            fetchedPages.Add(pageHtml);

            if (!_parser.TryParseRankingPageMetadata(pageHtml, out var pageMetadata) || pageMetadata is null)
                return null;
            if (pageMetadata.CurrentPage != requestedPage || pageMetadata.RangeStart != expectedRangeStart)
                return null;

            if (firstPageMetadata is null)
            {
                firstPageMetadata = pageMetadata;
            }
            else if (!HasSameRankingSnapshot(firstPageMetadata, pageMetadata))
            {
                return null;
            }

            expectedRangeStart = pageMetadata.RangeEnd + 1;

            if (pageMetadata.IsNextDisabled)
                return pageMetadata.RangeEnd == pageMetadata.TotalPlayers ? fetchedPages : null;

            if (pageMetadata.RangeEnd >= pageMetadata.TotalPlayers)
                return null;

            requestedPage = pageMetadata.NextPage;
        }
    }

    private Uri BuildPageUri(int pageNumber) =>
        new(_rankingPageUriPrefix.OriginalString + pageNumber.ToString(CultureInfo.InvariantCulture));

    private static bool HasSameRankingSnapshot(RankingPageMetadata firstPage, RankingPageMetadata currentPage) =>
        firstPage.LastUpdated == currentPage.LastUpdated
        && firstPage.PeriodEnding == currentPage.PeriodEnding
        && firstPage.TotalPlayers == currentPage.TotalPlayers
        && firstPage.LastPage == currentPage.LastPage;
}

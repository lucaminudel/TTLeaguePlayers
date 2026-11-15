using System.Collections.Generic;
using System.Globalization;
using TTLeaguePlayersApp.BackEnd.Strategy.ScraperProxy;

namespace TTLeaguePlayersApp.BackEnd.Strategy.TT365;

public sealed class CLTTLStrategy2026Processor
{
    private const int MaximumCoveragePasses = 3;

    private readonly CLTTLStrategy2026Fetcher _fetcher;
    private readonly CLTTLStrategy2026Parser _parser;

    public CLTTLStrategy2026Processor( IScraperProxy scraperProxy, IReadOnlyDictionary<string, Uri> strategySources)
    {
        ArgumentNullException.ThrowIfNull(scraperProxy);
        ArgumentNullException.ThrowIfNull(strategySources);

        _fetcher = new CLTTLStrategy2026Fetcher(scraperProxy, strategySources);
        _parser = new CLTTLStrategy2026Parser();
    }

    public async Task<(OrderedDictionary<string, Division> AllDivisions, IReadOnlyList<string> Anomalies)> GetAllDivisionsWithTeamsAndPlayers()
    {
        var html = await _fetcher.FetchDivisionsAndTeamsAsync();
        var (allDivisions, allTeams) = _parser.ParseDivisionsAndTeams(html);
        var anomalies = new List<string>();

        foreach (var team in allTeams.Values)
        {
            if (team.Players.Count > 0)
                continue;

            var json = await _fetcher.FetchTeamPlayersAsync(team.TeamId.ToString(CultureInfo.InvariantCulture));
            anomalies.AddRange(_parser.ParseTeamPlayers(json, team, allTeams));
        }

        return (allDivisions, anomalies);
    }

    public async Task<OrderedDictionary<string, DivisionTable>> GetAllDivisionTables()
    {
        var html = await _fetcher.FetchLeagueTablesAsync();
        return _parser.ParseDivisionTables(html);
    }

    public async Task<(IReadOnlyDictionary<string, Player> AllPlayers, IReadOnlyList<string> Anomalies)> GetAllRankingPlayers()
    {
        var rankingPages = await FetchRankingPagesAsync();
        
        return _parser.ParseRankingPlayers(rankingPages);
    }
    
    private async Task<IReadOnlyList<string>> FetchRankingPagesAsync()
    {
        for (var pass = 1; pass <= MaximumCoveragePasses; pass++)
        {
            var completePass = await TryFetchCompletePassAsync();
            if (completePass is not null)
                return completePass;
        }

        throw new InvalidOperationException("Ranking page coverage remained inconsistent after three attempts starting from page 1.");
    }

    private async Task<IReadOnlyList<string>?> TryFetchCompletePassAsync()
    {
        var fetchedPages = new List<string>();
        RankingPageMetadata? firstPageMetadata = null;
        var requestedPage = 1;
        var expectedRangeStart = 1;

        while (true)
        {
            var pageHtml = await _fetcher.FetchRankingPageAsync(requestedPage);
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
    
    private static bool HasSameRankingSnapshot(RankingPageMetadata firstPage, RankingPageMetadata currentPage) =>
        firstPage.LastUpdated == currentPage.LastUpdated
        && firstPage.PeriodEnding == currentPage.PeriodEnding
        && firstPage.TotalPlayers == currentPage.TotalPlayers
        && firstPage.LastPage == currentPage.LastPage;
}

using System.Collections.Generic;
using System.Globalization;
using TTLeaguePlayersApp.BackEnd.Strategy.ScraperProxy;
using TTLeaguePlayersApp.BackEnd.TTLeaguePlayersApp.BackEnd.Strategy.Lambdas;

namespace TTLeaguePlayersApp.BackEnd.Strategy.TT365;

public sealed class CLTTLStrategy2026Processor : IStrategyProcessor
{
    private const int MaximumCoveragePasses = 3;

    private readonly CLTTLStrategy2026Fetcher _fetcher;
    private readonly CLTTLStrategy2026Parser _parser;

    public CLTTLStrategy2026Processor(IScraperProxy scraperProxy, IReadOnlyDictionary<string, Uri> strategySources)
    {
        ArgumentNullException.ThrowIfNull(scraperProxy);
        ArgumentNullException.ThrowIfNull(strategySources);

        _fetcher = new CLTTLStrategy2026Fetcher(scraperProxy, strategySources);
        _parser = new CLTTLStrategy2026Parser();
    }

    public async Task<(OrderedDictionary<string, Division> AllDivisionsTeamsAndPlayers, IReadOnlyList<string> Anomalies)> GetAllDivisionsWithTeamsAndPlayers()
    {
        var eligibilityPageHtml = await _fetcher.FetchDivisionsAndTeamsAsync();
        var (allDivisions, allTeams) = _parser.ParseDivisionsAndTeams(eligibilityPageHtml);
        var anomalies = new List<string>();
        var teamsByName = allTeams.ToDictionary(entry => entry.Key, entry => entry.Value.Team, StringComparer.OrdinalIgnoreCase);

        foreach (var (team, id) in allTeams.Values)
        {
            if (team.Players.Count > 0)
                continue;

            var json = await _fetcher.FetchTeamPlayersAsync(id.ToString(CultureInfo.InvariantCulture));
            anomalies.AddRange(_parser.ParseTeamPlayers(json, team, teamsByName));
        }

        return (allDivisions, anomalies);
    }

    public async Task<OrderedDictionary<string, DivisionTable>> GetAllTables()
    {
        var html = await _fetcher.FetchLeagueTablesAsync();
        return _parser.ParseDivisionTables(html);
    }

    public async Task<OrderedDictionary<string, List<Fixture>>> GetAllFixtures()
    {
        var html = await _fetcher.FetchFixturesAsync();
        return _parser.ParseDivisionFixtures(html);
    }

    public async Task<(IReadOnlyDictionary<string, Player> AllRankedPlayers, IReadOnlyList<string> Anomalies)> GetAllRankingPlayers()
    {
        var rankingPages = await FetchRankingPagesAsync();

        return _parser.ParseRankingPlayers(rankingPages);
    }

    //
    // Private methods
    //

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

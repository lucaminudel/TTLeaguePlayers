using System.Globalization;
using TTLeaguePlayersApp.BackEnd.Strategy.ScraperProxy;

namespace TTLeaguePlayersApp.BackEnd.Strategy.TT365;

public sealed class CLTTLStrategy2026Fetcher
{
    private const string RankingSourceName = "Ranking";
    private const string DivisionsTeamsListSourceName = "Divisions Teams List";
    private const string DivisionsTeamsPlayersListSourceName = "Divisions Teams Players List";
    private const string LeagueTablesSourceName = "League Tables";

    private readonly IScraperProxy _scraperProxy;
    private readonly Uri _rankingPageUriPrefix;
    private readonly Uri _divisionsTeamsListUri;
    private readonly Uri _divisionsTeamsPlayersListUriPrefix;
    private readonly Uri _leagueTablesUri;

    public CLTTLStrategy2026Fetcher(IScraperProxy scraperProxy, IReadOnlyDictionary<string, Uri> strategySources)
    {
        ArgumentNullException.ThrowIfNull(scraperProxy);
        ArgumentNullException.ThrowIfNull(strategySources);

        _rankingPageUriPrefix = GetRequiredSource(strategySources, RankingSourceName, "p=");
        _divisionsTeamsListUri = GetRequiredSource(strategySources, DivisionsTeamsListSourceName);
        _divisionsTeamsPlayersListUriPrefix = GetRequiredSource(strategySources, DivisionsTeamsPlayersListSourceName, "teamId=");
        _leagueTablesUri = GetRequiredSource(strategySources, LeagueTablesSourceName);

        _scraperProxy = scraperProxy;
    }
    
    public Task<string> FetchRankingPageAsync(int pageNumber)
    {
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(pageNumber);
        return _scraperProxy.FetchAsync(new Uri(
            _rankingPageUriPrefix.OriginalString + pageNumber.ToString(CultureInfo.InvariantCulture)));
    }

    public Task<string> FetchDivisionsAndTeamsAsync() => _scraperProxy.FetchAsync(_divisionsTeamsListUri);

    public Task<string> FetchLeagueTablesAsync() => _scraperProxy.FetchAsync(_leagueTablesUri);

    public Task<string> FetchTeamPlayersAsync(string teamId)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(teamId);
        return _scraperProxy.FetchAsync(new Uri(
            _divisionsTeamsPlayersListUriPrefix.OriginalString + Uri.EscapeDataString(teamId)));
    }

    private static Uri GetRequiredSource(
        IReadOnlyDictionary<string, Uri> strategySources,
        string sourceName,
        string? requiredSuffix = null)
    {
        if (!strategySources.TryGetValue(sourceName, out var sourceUri) || sourceUri is null)
            throw new ArgumentException($"The strategy source '{sourceName}' is required.", nameof(strategySources));
        if (!sourceUri.IsAbsoluteUri)
            throw new ArgumentException($"The strategy source '{sourceName}' must be absolute.", nameof(strategySources));
        if (requiredSuffix is not null
            && !sourceUri.OriginalString.EndsWith(requiredSuffix, StringComparison.OrdinalIgnoreCase))
            throw new ArgumentException(
                $"The strategy source '{sourceName}' must end with '{requiredSuffix}'.",
                nameof(strategySources));

        return sourceUri;
    }
}

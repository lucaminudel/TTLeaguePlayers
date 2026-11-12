using TTLeaguePlayersApp.BackEnd.Configuration.DataStore;

namespace TTLeaguePlayersApp.BackEnd.Strategy.Lambdas;

internal static class StrategyRequestValidation
{
    public static ActiveSeasonStrategyConfig GetConfiguredSeason(
        IReadOnlyList<ActiveSeasonStrategyConfig> activeSeasons,
        string? league,
        string? season)
    {
        return activeSeasons.FirstOrDefault(config =>
                   string.Equals(config.League, league, StringComparison.OrdinalIgnoreCase) &&
                   string.Equals(config.Season, season, StringComparison.OrdinalIgnoreCase) &&
                   !string.IsNullOrWhiteSpace(config.CustomStrategyProcessor))
               ?? throw new KeyNotFoundException($"No strategy is configured for league '{league}' and season '{season}'.");
    }

}

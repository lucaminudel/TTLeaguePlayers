using TTLeaguePlayersApp.BackEnd.Configuration.DataStore;

namespace TTLeaguePlayersApp.BackEnd.Tests.Strategy.TT365;

internal static class Clttl2026TestConfig
{
    public static ActiveSeasonStrategyConfig Load()
    {
        var json = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "dev.env.json"));
        return new Loader(json).GetEnvironmentVariables().ActiveSeasonsDataSource.Single(
            season => season.League == "CLTTL" && season.Season == "2026-2027");
    }
}

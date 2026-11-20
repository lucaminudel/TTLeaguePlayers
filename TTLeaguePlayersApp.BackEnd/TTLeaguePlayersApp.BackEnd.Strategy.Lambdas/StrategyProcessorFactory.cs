using TTLeaguePlayersApp.BackEnd.Configuration.DataStore;
using TTLeaguePlayersApp.BackEnd.Strategy.ScraperProxy;
using TTLeaguePlayersApp.BackEnd.Strategy.Lambdas;

namespace TTLeaguePlayersApp.BackEnd.Strategy.Lambdas;

public static class StrategyProcessorFactory
{
    public static IStrategyProcessor Create(ActiveSeasonStrategyConfig season, IScraperProxy scraperProxy)
    {
        ArgumentNullException.ThrowIfNull(season);
        ArgumentNullException.ThrowIfNull(scraperProxy);

        var typeName = $"TTLeaguePlayersApp.BackEnd.Strategy.{season.CustomStrategyProcessor}";
        var processorType = typeof(StrategyProcessorFactory).Assembly.GetType(typeName);
        if (processorType is null || processorType.IsAbstract || !typeof(IStrategyProcessor).IsAssignableFrom(processorType))
            throw new InvalidOperationException($"Configured strategy processor '{typeName}' is not a concrete IStrategyProcessor.");

        var constructor = processorType.GetConstructor([typeof(IScraperProxy), typeof(IReadOnlyDictionary<string, Uri>)]);
        if (constructor is null)
            throw new InvalidOperationException($"Configured strategy processor '{typeName}' has no supported constructor.");

        return (IStrategyProcessor)constructor.Invoke([scraperProxy, season.StrategySources]);
    }
}

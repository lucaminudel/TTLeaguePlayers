using Amazon.Lambda.Core;
using TTLeaguePlayersApp.BackEnd.Configuration.DataStore;
using TTLeaguePlayersApp.BackEnd.TTLeaguePlayersApp.BackEnd.Strategy.Lambdas;

namespace TTLeaguePlayersApp.BackEnd.Strategy.Lambdas;

public sealed class TeamComparisonsLambda
{
    private readonly ILoggerObserver _observer;
    private readonly IReadOnlyList<ActiveSeasonStrategyConfig> _activeSeasons;
    private readonly Func<ActiveSeasonStrategyConfig, IStrategyProcessor> _processorFactory;

    public TeamComparisonsLambda(ILoggerObserver observer, IReadOnlyList<ActiveSeasonStrategyConfig> activeSeasons, Func<ActiveSeasonStrategyConfig, IStrategyProcessor> processorFactory)
    {
        _observer = observer;
        _activeSeasons = activeSeasons;
        _processorFactory = processorFactory;
    }

    public async Task HandleAsync(TeamComparisonsRequest request, Dictionary<string, string> userClaims, ILambdaContext context)
    {
        ArgumentNullException.ThrowIfNull(request);

        var season = StrategyRequestValidation.GetConfiguredSeason(_activeSeasons, request.League, request.Season);    
        var processor = _processorFactory(season);

        var (divisions, rosterAnomalies) = await processor.GetAllDivisionsWithTeamsAndPlayers();
        var (rankings, rankingAnomalies) = await processor.GetAllRankingPlayers();
        var (tables, fixtures, fixtureAnomalies) = await processor.GetAllTablesAndFixtures(divisions);

        StrategyDataCalculation.CalculateStrategyData(divisions, rankings, tables, fixtures);


        var parameters = new Dictionary<string, string>
        {
            ["League"] = request.League!,
            ["Season"] = request.Season!,
            ["Division"] = request.TeamDivision!
        };

        var anomalies = rosterAnomalies.Concat(rankingAnomalies).Concat(fixtureAnomalies).ToArray();
        if (anomalies.Length > 0)
            _observer.OnRuntimeIrregularEvent(
                "GET TEAM COMPARISONS COMPLETED WITH ANOMALIES", 
                new() { ["Class"] = nameof(TeamComparisonsLambda), 
                ["Method"] = nameof(HandleAsync) }, 
                context, 
                parameters.With("Detail", string.Join("\n", anomalies)),
                userClaims);
        else
            _observer.OnRuntimeRegularEvent(
                "GET TEAM COMPARISONS COMPLETED",
                new() { ["Class"] = nameof(TeamComparisonsLambda), ["Method"] = nameof(HandleAsync) },
                context,
                parameters,
                userClaims);
    }
}

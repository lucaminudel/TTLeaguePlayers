using Amazon.Lambda.Core;
using TTLeaguePlayersApp.BackEnd.Configuration.DataStore;

namespace TTLeaguePlayersApp.BackEnd.Strategy.Lambdas;

public sealed class TeamComparisonsLambda
{
    private readonly ILoggerObserver _observer;
    private readonly IReadOnlyList<ActiveSeasonStrategyConfig> _activeSeasons;

    public TeamComparisonsLambda(ILoggerObserver observer, IReadOnlyList<ActiveSeasonStrategyConfig> activeSeasons)
    {
        _observer = observer;
        _activeSeasons = activeSeasons;
    }

    public Task HandleAsync(TeamComparisonsRequest request, ILambdaContext context)
    {
        ArgumentNullException.ThrowIfNull(request);
        StrategyRequestValidation.GetConfiguredSeason(_activeSeasons, request.League, request.Season);

        var parameters = new Dictionary<string, string>
        {
            ["League"] = request.League!,
            ["Season"] = request.Season!,
            ["Division"] = request.TeamDivision!
        };
        _observer.OnRuntimeRegularEvent(
            "TEAM COMPARISONS PENDING",
            new() { ["Class"] = nameof(TeamComparisonsLambda), ["Method"] = nameof(HandleAsync) },
            context,
            parameters);

        return Task.CompletedTask;
    }
}

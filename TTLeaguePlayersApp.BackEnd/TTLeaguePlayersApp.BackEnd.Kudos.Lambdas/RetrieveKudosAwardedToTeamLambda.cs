using Amazon.Lambda.Core;
using TTLeaguePlayersApp.BackEnd.Kudos.DataStore;

namespace TTLeaguePlayersApp.BackEnd.Kudos.Lambdas;

public class RetrieveKudosAwardedToTeamLambda
{
    private readonly ILoggerObserver _observer;
    private readonly IKudosDataTable _kudosDataTable;

    public RetrieveKudosAwardedToTeamLambda(ILoggerObserver observer, IKudosDataTable kudosDataTable)
    {
        _observer = observer;
        _kudosDataTable = kudosDataTable;
    }

    public async Task<List<KudosSummary>> HandleAsync(RetrieveKudosAwardedToTeamRequest request, ILambdaContext context)
    {
        List<KudosSummary> kudosList;
        try
        {
            kudosList = await _kudosDataTable.RetrieveKudosAwardedToTeamAsync(
                request.League,
                request.Season,
                request.TeamDivision,
                request.TeamName
            );
        }
        catch (Exception ex)
        {
            _observer.OnRuntimeError(ex, context, new() { 
                    ["TeamName"] = request.TeamName,
                    ["League"] = request.League
                });

            throw; // Rethrows to be handled by API Gateway
        }

        _observer.OnRuntimeRegularEvent("RETRIEVE KUDOS AWARDED TO TEAM COMPLETED",
            source: new() { ["Class"] = nameof(RetrieveKudosAwardedToTeamLambda), ["Method"] = nameof(HandleAsync) },
            context,
            parameters: new() { 
                ["TeamName"] = request.TeamName,
                ["Count"] = kudosList.Count.ToString()
            });

        return kudosList;
    }
}

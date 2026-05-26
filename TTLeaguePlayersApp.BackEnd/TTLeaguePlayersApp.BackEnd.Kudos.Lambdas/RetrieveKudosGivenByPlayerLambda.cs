using System.Text.Json;
using Amazon.Lambda.Core;
using TTLeaguePlayersApp.BackEnd.Kudos.DataStore;
using TTLeaguePlayersApp.BackEnd.Cognito;
using TTLeaguePlayersApp.BackEnd.Invites.Lambdas;

namespace TTLeaguePlayersApp.BackEnd.Kudos.Lambdas;

public class RetrieveKudosGivenByPlayerLambda
{
    private readonly ILoggerObserver _observer;
    private readonly IKudosDataTable _kudosDataTable;

    public RetrieveKudosGivenByPlayerLambda(ILoggerObserver observer, IKudosDataTable kudosDataTable)
    {
        _observer = observer;
        _kudosDataTable = kudosDataTable;
    }

    public async Task<List<DataStore.Kudos>> HandleAsync(RetrieveKudosGivenByPlayerRequest request, Dictionary<string, string> userClaims, ILambdaContext context)
    {
        try
        {
            ActiveSessionSecurityCheck.Validate(
                request.League,
                request.Season,
                request.TeamDivision,
                request.TeamName,
                null,
                request.GiverPersonSub,
                userClaims);
        }
        catch (SecurityValidationException ex)
        {
            // Log optional checks to be esamined later
            _observer.OnSecurityError(ex, context, null, userClaims);
        }

        List<DataStore.Kudos> kudosList;
        try
        {
            kudosList = await _kudosDataTable.RetrieveKudosGivenByPlayerAsync(
                request.League,
                request.Season,
                request.GiverPersonSub,
                request.TeamDivision,
                request.TeamName
            );
        }
        catch (Exception ex)
        {
            _observer.OnRuntimeError(ex, context, new() { 
                    ["GiverPersonSub"] = request.GiverPersonSub,
                    ["League"] = request.League
                }, userClaims);

            throw;
        }

        _observer.OnRuntimeRegularEvent("GET PLAYER AWARDED KUDOS COMPLETED",
            source: new() { ["Class"] = nameof(RetrieveKudosGivenByPlayerLambda), ["Method"] = nameof(HandleAsync) },
            context,
            parameters: new() { 
                ["GiverPersonSub"] = request.GiverPersonSub,
                ["Count"] = kudosList.Count.ToString()
            });

        return kudosList;
    }
}

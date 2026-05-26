using System.Text.Json;
using Amazon.Lambda.Core;
using TTLeaguePlayersApp.BackEnd.Cognito;
using TTLeaguePlayersApp.BackEnd.Kudos.DataStore;

namespace TTLeaguePlayersApp.BackEnd.Kudos.Lambdas;

public class DeleteKudosLambda
{
    private readonly ILoggerObserver _observer;
    private readonly IKudosDataTable _kudosDataTable;

    public DeleteKudosLambda(ILoggerObserver observer, IKudosDataTable kudosDataTable)
    {
        _observer = observer;
        _kudosDataTable = kudosDataTable;
    }

    public async Task HandleAsync(DeleteKudosRequest request, Dictionary<string, string> userClaims, ILambdaContext context)
    {
        try {
            ActiveSessionSecurityCheck.Validate(
                request.League,
                request.Season,
                request.Division,
                null,
                null,
                request.GiverPersonSub,
                userClaims);            
        }
        catch (SecurityValidationException ex)
        {
            // Log optional checks to be esamined later
            _observer.OnSecurityError(ex, context, null, userClaims);
        }

        await _kudosDataTable.DeleteKudosAsync(
            request.League, 
            request.Season, 
            request.Division, 
            request.ReceivingTeam, 
            request.HomeTeam, 
            request.AwayTeam, 
            request.GiverPersonSub);

        _observer.OnRuntimeRegularEvent("DELETE KUDOS COMPLETED",
            source: new() { ["Class"] = nameof(DeleteKudosLambda), ["Method"] = nameof(HandleAsync) },
            context, 
            parameters: new() { 
                ["GiverPersonSub"] = request.GiverPersonSub,
                ["ReceivingTeam"] = request.ReceivingTeam 
            });
    }

}

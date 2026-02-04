using System.Text.Json;
using Amazon.Lambda.Core;
using TTLeaguePlayersApp.BackEnd.Invites.Lambdas; 
using TTLeaguePlayersApp.BackEnd.Cognito;
using TTLeaguePlayersApp.BackEnd.Kudos.DataStore;
using TTLeaguePlayersApp.BackEnd;

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
            ValidateRequestSecurity(request, userClaims);
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

    private void ValidateRequestSecurity(DeleteKudosRequest request, Dictionary<string, string> userClaims)
    {
        var errors = new List<string>();

        // Check User Id Sub from the token
        if (!userClaims.TryGetValue("sub", out var tokenSub))
        {
            errors.Add($"{nameof(userClaims)} does not contain User Id Sub.");
        }
        else if (tokenSub != request.GiverPersonSub) 
        {
            errors.Add($"{nameof(request.GiverPersonSub)}: '{request.GiverPersonSub}' does not match token's User Id Sub: '{tokenSub}'.");
        }
        
        if (errors.Count > 0)
        {
            throw new SecurityValidationException(errors);
        }
    }
}

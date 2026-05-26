using Amazon.Lambda.Core;
using TTLeaguePlayersApp.BackEnd.Cognito;
using TTLeaguePlayersApp.BackEnd.Kudos.DataStore;

namespace TTLeaguePlayersApp.BackEnd.Kudos.Lambdas;

public class CreateKudosLambda
{
    private readonly ILoggerObserver _observer;
    private readonly IKudosDataTable _kudosDataTable;
    private readonly CognitoUsers _cognitoUsers;

    public CreateKudosLambda(ILoggerObserver observer, IKudosDataTable kudosDataTable, CognitoUsers cognitoUsers)
    {
        _observer = observer;
        _kudosDataTable = kudosDataTable;
        _cognitoUsers = cognitoUsers;
    }

    public async Task<DataStore.Kudos> HandleAsync(CreateKudosRequest request, Dictionary<string, string> userClaims, ILambdaContext context)
    {
        try {
            ActiveSessionSecurityCheck.Validate(
                request.League,
                request.Season,
                request.Division,
                request.GiverTeam,
                request.GiverPersonName,
                request.GiverPersonSub,
                userClaims);
        }
        catch (SecurityValidationException ex)
        {
            // Log optional checks to be esamined later
            _observer.OnSecurityError(ex, context, null, userClaims);
        }

        DataStore.Kudos kudos;
        try {
            // After this step there is everything needed to succesfully update the Cognito user latest kudos date, after the table update succeeds.
            var activeSeasons = CognitoUsers.ExtractActiveSeasonsWithTargetSeason(userClaims, request.League, request.Season, request.Division, request.GiverTeam);

            kudos = new DataStore.Kudos
            {
                League = request.League,
                Season = request.Season,
                Division = request.Division,
                ReceivingTeam = request.ReceivingTeam,
                HomeTeam = request.HomeTeam,
                AwayTeam = request.AwayTeam,
                MatchDateTime = request.MatchDateTime,
                GiverTeam = request.GiverTeam,
                GiverPersonName = request.GiverPersonName,
                GiverPersonSub = request.GiverPersonSub,
                KudosValue = request.KudosValue
            };

            await _kudosDataTable.SaveKudosAsync(kudos);

            await _cognitoUsers.AddLatestKudosDateToActiveSeason(
                request.GiverPersonSub, 
                userClaims, 
                request.League, 
                request.Season, 
                request.Division, 
                request.GiverTeam, 
                activeSeasons, 
                request.MatchDateTime
            );
        }
        catch(Exception ex)
        {
            _observer.OnRuntimeError(ex, context, new() { 
                    ["GiverPersonSub"] = request.GiverPersonSub,
                    ["ReceivingTeam"] = request.ReceivingTeam 
                }, userClaims);

            throw;
        }

        _observer.OnRuntimeRegularEvent("GIVE KUDOS COMPLETED",
            source: new() { ["Class"] = nameof(CreateKudosLambda), ["Method"] = nameof(HandleAsync) },
            context, 
            parameters: new() { 
                ["GiverPersonSub"] = kudos.GiverPersonSub,
                ["ReceivingTeam"] = kudos.ReceivingTeam 
            });

        return await Task.FromResult(kudos);
    }
}
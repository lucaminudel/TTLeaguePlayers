using System.Text.Json;
using Amazon.Lambda.Core;
using TTLeaguePlayersApp.BackEnd.Invites.Lambdas; 
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
            ValidateRequestSecurity(request, userClaims);
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

        _observer.OnRuntimeRegularEvent("CREATE KUDOS COMPLETED",
            source: new() { ["Class"] = nameof(CreateKudosLambda), ["Method"] = nameof(HandleAsync) },
            context, 
            parameters: new() { 
                ["GiverPersonSub"] = kudos.GiverPersonSub,
                ["ReceivingTeam"] = kudos.ReceivingTeam 
            });

        return await Task.FromResult(kudos);
    }



    private void ValidateRequestSecurity(CreateKudosRequest request, Dictionary<string, string> userClaims)
    {
        var errors = new List<string>();

        if (userClaims.TryGetValue("custom:active_seasons", out var activeSeasonsJson) && !string.IsNullOrEmpty(activeSeasonsJson))
        {
            try 
            {
                var activeSeasons = JsonSerializer.Deserialize<List<ActiveSeason>>(activeSeasonsJson);
                if (activeSeasons != null)
                {
                    bool matchFound = activeSeasons.Any(s => 
                        s.League == request.League &&
                        s.Season == request.Season &&
                        s.TeamDivision == request.Division &&
                        s.TeamName == request.GiverTeam &&
                        s.PersonName == request.GiverPersonName
                    );

                    if (!matchFound)
                    {
                        errors.Add($"The Kodos giver details ({nameof(request.League)}, {nameof(request.Season)}, " 
                            + $"{nameof(request.Division)}, {nameof(request.GiverTeam)}, {nameof(request.GiverPersonName)})" + 
                            $" were not found in the user's {nameof(activeSeasonsJson)}.");
                    }
                }
                else
                {
                        errors.Add($"{nameof(userClaims)} has no active seasons (failed to deserialize).");
                }
            }
            catch(JsonException ex)
            {
                errors.Add($"{nameof(activeSeasonsJson)} is malformed: {ex.Message}.");
            }
        } else {       
            errors.Add($"{nameof(userClaims)} has no active seasons.");
        }

        // 2. Check User Id Sub from the token
        if (!userClaims.TryGetValue("sub", out var tokenSub))
        {
            // Fallback: sometimes "sub" is not in dict if not mapped, check "username" or similar if needed?
            // Usually "sub" is standard. If missing, we can't validate identity.
            errors.Add($"{nameof(userClaims)}  does not contain User Id Sub.");
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

using System.Text.Json;
using Amazon.Lambda.Core;
using TTLeaguePlayersApp.BackEnd.Invites.Lambdas; 
using TTLeaguePlayersApp.BackEnd.Cognito;

namespace TTLeaguePlayersApp.BackEnd.Kudos.Lambdas;

public class CreateKudosLambda
{
    private readonly ILoggerObserver _observer;
    
    // Placeholder for data store
    // private readonly IKudosDataTable _kudosDataTable; 

    public CreateKudosLambda(ILoggerObserver observer)
    {
        _observer = observer;
    }

    public async Task<Kudos> HandleAsync(CreateKudosRequest request, Dictionary<string, string> userClaims, ILambdaContext context)
    {
        ValidateRequest(request);

        try {
            ValidateRequestSecurity(request, userClaims);
        }
        catch (SecurityValidationException ex)
        {
            // Log optional checks to be esamined later
            _observer.OnSecurityError(ex, context, null, userClaims);
        }

        // Placeholder: Actual interaction with DynamoDB would happen here
        // await _kudosDataTable.SaveKudosAsync(kudos);

        var kudos = new Kudos
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

        _observer.OnRuntimeRegularEvent("CREATE KUDOS COMPLETED",
            source: new() { ["Class"] = nameof(CreateKudosLambda), ["Method"] = nameof(HandleAsync) },
            context, 
            parameters: new() { 
                ["GiverPersonSub"] = kudos.GiverPersonSub,
                ["ReceivingTeam"] = kudos.ReceivingTeam 
            });

        return await Task.FromResult(kudos);
    }

    private void ValidateRequest(CreateKudosRequest request)
    {
        var errors = new List<string>();

        if (string.IsNullOrWhiteSpace(request.ReceivingTeam)) errors.Add($"{nameof(request.ReceivingTeam)} is required");
        if (string.IsNullOrWhiteSpace(request.HomeTeam)) errors.Add($"{nameof(request.HomeTeam)} is required");
        if (string.IsNullOrWhiteSpace(request.AwayTeam)) errors.Add($"{nameof(request.AwayTeam)} is required");
        if (string.IsNullOrWhiteSpace(request.GiverTeam)) errors.Add($"{nameof(request.GiverTeam)} is required");

        if (request.ReceivingTeam != request.HomeTeam && request.ReceivingTeam != request.AwayTeam)
        {
            errors.Add($"{nameof(request.ReceivingTeam)} must be either the {nameof(request.HomeTeam)} or the {nameof(request.AwayTeam)}.");
        }

        if (request.GiverTeam != request.HomeTeam && request.GiverTeam != request.AwayTeam)
        {
            errors.Add($"{nameof(request.GiverTeam)} must be either the {nameof(request.HomeTeam)} or the {nameof(request.AwayTeam)}.");
        }

        if (request.GiverTeam == request.ReceivingTeam)
        {
            errors.Add($"{nameof(request.GiverTeam)} cannot be the same as the {nameof(request.ReceivingTeam)}.");
        }

        if (request.KudosValue != -1 && request.KudosValue != 0 && request.KudosValue != 1)
        {
            errors.Add($"{nameof(request.KudosValue)} must be -1, 0, or 1.");
        }

        if (string.IsNullOrWhiteSpace(request.League)) errors.Add($"{nameof(request.League)} is required");
        if (string.IsNullOrWhiteSpace(request.Season)) errors.Add($"{nameof(request.Season)} is required");
        if (string.IsNullOrWhiteSpace(request.Division)) errors.Add($"{nameof(request.Division)} is required");
        if (string.IsNullOrWhiteSpace(request.GiverPersonName)) errors.Add($"{nameof(request.GiverPersonName)} is required");   
        if (string.IsNullOrWhiteSpace(request.GiverPersonSub)) errors.Add($"{nameof(request.GiverPersonSub)} is required");
        
        if (errors.Count > 0)
        {
            throw new ValidationException(errors);
        }
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
            errors.Add($"{request.GiverPersonSub} does not match token's User Id Sub.");
        }

        
        if (errors.Count > 0)
        {
            throw new SecurityValidationException(errors);
        }
    }

}

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
            ValidateRequestSecurity(request, userClaims);
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

        _observer.OnRuntimeRegularEvent("RETRIEVE KUDOS GIVEN BY PLAYER COMPLETED",
            source: new() { ["Class"] = nameof(RetrieveKudosGivenByPlayerLambda), ["Method"] = nameof(HandleAsync) },
            context,
            parameters: new() { 
                ["GiverPersonSub"] = request.GiverPersonSub,
                ["Count"] = kudosList.Count.ToString()
            });

        return kudosList;
    }

    private void ValidateRequestSecurity(RetrieveKudosGivenByPlayerRequest request, Dictionary<string, string> userClaims)
    {
        var errors = new List<string>();

        // 1. Check User Id Sub from the token
        if (!userClaims.TryGetValue("sub", out var tokenSub))
        {
            errors.Add($"{nameof(userClaims)} does not contain User Id Sub.");
        }
        else if (tokenSub != request.GiverPersonSub)
        {
            errors.Add($"{nameof(request.GiverPersonSub)}: '{request.GiverPersonSub}' does not match token's User Id Sub: '{tokenSub}'.");
        }

        // 2. Check Active Seasons
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
                        s.TeamDivision == request.TeamDivision &&
                        s.TeamName == request.TeamName
                        // Note: PersonName is not in the request, so we skip it or we could assume the token matches the person if we had name
                    );

                    if (!matchFound)
                    {
                        errors.Add($"The Kudos giver details ({nameof(request.League)}, {nameof(request.Season)}, "
                            + $"{nameof(request.TeamDivision)}, {nameof(request.TeamName)})"
                            + $" were not found in the user's {nameof(activeSeasonsJson)}.");
                    }
                }
                else
                {
                    errors.Add($"{nameof(userClaims)} has no active seasons (failed to deserialize).");
                }
            }
            catch (JsonException ex)
            {
                errors.Add($"{nameof(activeSeasonsJson)} is malformed: {ex.Message}.");
            }
        }
        else
        {
            errors.Add($"{nameof(userClaims)} has no active seasons.");
        }

        if (errors.Count > 0)
        {
            throw new SecurityValidationException(errors);
        }
    }
}

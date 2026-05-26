using System.Text.Json;
using TTLeaguePlayersApp.BackEnd.Cognito;

namespace TTLeaguePlayersApp.BackEnd.Kudos.Lambdas;

internal static class ActiveSessionSecurityCheck
{
    internal static void Validate(string league, string season, string division, string? giverTeam, string? giverPersonName, string giverPersonSub, Dictionary<string, string> userClaims)
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
                        s.League == league &&
                        s.Season == season &&
                        s.TeamDivision == division &&
                        (giverTeam == null || s.TeamName == giverTeam) && 
                        (giverPersonName == null || s.PersonName == giverPersonName) 
                    );

                    if (!matchFound)
                    {
                        errors.Add($"The Kodos giver details ({nameof(league)}, {nameof(season)}, " 
                            + $"{nameof(division)}, {nameof(giverTeam)}, {nameof(giverPersonName)})" + 
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
        else if (tokenSub != giverPersonSub) 
        {
            errors.Add($"{nameof(giverPersonSub)}: '{giverPersonSub}' does not match token's User Id Sub: '{tokenSub}'.");
        }

        
        if (errors.Count > 0)
        {
            throw new SecurityValidationException(errors);
        }
    }
}
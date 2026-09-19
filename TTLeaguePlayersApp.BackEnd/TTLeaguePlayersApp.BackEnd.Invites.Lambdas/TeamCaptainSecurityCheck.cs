using System.Text.Json;
using TTLeaguePlayersApp.BackEnd.Cognito;

namespace TTLeaguePlayersApp.BackEnd.Invites.Lambdas;

internal static class TeamCaptainSecurityCheck
{
    internal static void Validate(string league, string season, string teamDivision, string teamName, Dictionary<string, string> userClaims)
    {
        var errors = new List<string>();

        if (!userClaims.TryGetValue("custom:active_seasons", out var activeSeasonsJson) || string.IsNullOrEmpty(activeSeasonsJson))
        {
            errors.Add($"{nameof(userClaims)} has no active_seasons claim.");
            throw new SecurityValidationException(errors);
        }

        List<ActiveSeason>? activeSeasons;
        try
        {
            activeSeasons = JsonSerializer.Deserialize<List<ActiveSeason>>(activeSeasonsJson);
        }
        catch (JsonException ex)
        {
            errors.Add($"custom:active_seasons claim is malformed: {ex.Message}.");
            throw new SecurityValidationException(errors);
        }

        var isCaptain = activeSeasons?.Any(s =>
            string.Equals(s.League, league, StringComparison.OrdinalIgnoreCase) &&
            string.Equals(s.Season, season, StringComparison.OrdinalIgnoreCase) &&
            string.Equals(s.TeamDivision, teamDivision, StringComparison.OrdinalIgnoreCase) &&
            string.Equals(s.TeamName, teamName, StringComparison.OrdinalIgnoreCase) &&
            string.Equals(s.Role, nameof(DataStore.Role.CAPTAIN), StringComparison.OrdinalIgnoreCase)) ?? false;

        if (!isCaptain)
        {
            errors.Add($"User is not the captain of team '{teamName}' ({teamDivision}) for league '{league}' season '{season}'.");
            throw new SecurityValidationException(errors);
        }
    }
}

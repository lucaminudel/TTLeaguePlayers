using System.Text.Json;
using TTLeaguePlayersApp.BackEnd.Cognito;

namespace TTLeaguePlayersApp.BackEnd.ClubsAndTournaments.Lambdas;

internal static class ClubManagerSecurityCheck
{
    internal static void Validate(string location, string clubName, Dictionary<string, string> userClaims)
    {
        var errors = new List<string>();

        if (!userClaims.TryGetValue("custom:managed_clubs", out var managedClubsJson) || string.IsNullOrEmpty(managedClubsJson))
        {
            errors.Add($"{nameof(userClaims)} has no managed_clubs claim.");
            throw new SecurityValidationException(errors);
        }

        List<ManagedClub>? managedClubs;
        try
        {
            managedClubs = JsonSerializer.Deserialize<List<ManagedClub>>(managedClubsJson);
        }
        catch (JsonException ex)
        {
            errors.Add($"custom:managed_clubs claim is malformed: {ex.Message}.");
            throw new SecurityValidationException(errors);
        }

        var isManager = managedClubs?.Any(c =>
            string.Equals(c.ClubLocation, location, StringComparison.OrdinalIgnoreCase) &&
            string.Equals(c.ClubName, clubName, StringComparison.OrdinalIgnoreCase)) ?? false;

        if (!isManager)
        {
            errors.Add($"User is not a manager for club '{clubName}' in '{location}'.");
            throw new SecurityValidationException(errors);
        }
    }
}

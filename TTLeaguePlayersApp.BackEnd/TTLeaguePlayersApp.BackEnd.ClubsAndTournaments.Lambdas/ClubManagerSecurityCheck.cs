using System.Text.Json;
using TTLeaguePlayersApp.BackEnd.Cognito;

namespace TTLeaguePlayersApp.BackEnd.ClubsAndTournaments.Lambdas;

internal static class ClubManagerSecurityCheck
{
    // Club-scoped check: the caller manages this club in this location, in ANY league or season.
    // This is what the promotion features (upsert/delete club, upsert/delete tournament) use, and it
    // must keep behaving exactly as it did — a club's homepage or tournament list is not season data.
    internal static void Validate(string location, string clubName, Dictionary<string, string> userClaims)
    {
        ValidateCore(location, clubName, userClaims, league: null, season: null);
    }

    // Season-scoped check: the caller manages this club in this location FOR THIS league and season.
    // Used by the team-registrations endpoint, whose answer is specific to one season's invites, so
    // being a manager of the same club in a different season must not grant access to this one.
    internal static void Validate(string location, string clubName, string league, string season, Dictionary<string, string> userClaims)
    {
        ValidateCore(location, clubName, userClaims, league, season);
    }

    // league and season are null for the club-scoped overload, and those clauses then contribute
    // nothing to the predicate. Everything else is common to both.
    private static void ValidateCore(string location, string clubName, Dictionary<string, string> userClaims, string? league, string? season)
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
            string.Equals(c.ClubName, clubName, StringComparison.OrdinalIgnoreCase) &&
            (league is null || string.Equals(c.League, league, StringComparison.OrdinalIgnoreCase)) &&
            (season is null || string.Equals(c.Season, season, StringComparison.OrdinalIgnoreCase))) ?? false;

        if (!isManager)
        {
            var scope = league is null && season is null
                ? $"club '{clubName}' in '{location}'"
                : $"club '{clubName}' in '{location}' for league '{league}' season '{season}'";
            errors.Add($"User is not a manager for {scope}.");
            throw new SecurityValidationException(errors);
        }
    }
}

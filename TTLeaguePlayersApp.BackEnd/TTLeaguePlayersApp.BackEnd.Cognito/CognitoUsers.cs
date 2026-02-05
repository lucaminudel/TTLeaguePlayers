using System.Text;
using System.Text.Json;
using Amazon.CognitoIdentityProvider;
using Amazon.CognitoIdentityProvider.Model;

namespace TTLeaguePlayersApp.BackEnd.Cognito;

public class CognitoUsers
{
    private readonly string _cognitoUserPoolId;
    private readonly IAmazonCognitoIdentityProvider _cognitoClient;

    public CognitoUsers(IAmazonCognitoIdentityProvider cognitoClient, string cognitoUserPoolId)
    {
        _cognitoClient = cognitoClient;
        _cognitoUserPoolId = cognitoUserPoolId;
    }

    public async Task<UserType> RetrieveCognitoUserByEmailId(string inviteeEmailId)
    {
        var listUsersRequest = new ListUsersRequest
        {
            UserPoolId = _cognitoUserPoolId,
            Filter = $"email = \"{inviteeEmailId}\"",
            Limit = 1
        };

        var listUsersResponse = await _cognitoClient.ListUsersAsync(listUsersRequest);
        var user = listUsersResponse.Users.FirstOrDefault();

        if (user == null)
        {
            throw new UserNotFoundException($"The provided email is not a registered user. Email: {inviteeEmailId}");
        }

        return user;
    }

    public async Task UpdateUserAttribute(string username, List<ActiveSeason> activeSeasons)
    {
        var updateAttributesRequest = new AdminUpdateUserAttributesRequest
        {
            UserPoolId = _cognitoUserPoolId,
            Username = username,
            UserAttributes = new() { new() { Name = "custom:active_seasons", Value = JsonSerializer.Serialize(activeSeasons) } }
        };

        await _cognitoClient.AdminUpdateUserAttributesAsync(updateAttributesRequest);
    }

    public static List<ActiveSeason>  ExtractActiveSeasonsWithTargetSeason(Dictionary<string, string> userClaims, 
        string league, string season, string division, string teamName)
    {
        if (!userClaims.TryGetValue("custom:active_seasons", out var activeSeasonsJson) || string.IsNullOrEmpty(activeSeasonsJson))
        {
            throw new InvalidOperationException($"User claims do not have the required claim custom:active_seasons to update latest kudos date.");
        }

        List<ActiveSeason>? activeSeasons;
        try 
        {
            activeSeasons = JsonSerializer.Deserialize<List<ActiveSeason>>(activeSeasonsJson);
        }
        catch (JsonException ex)
        {
            throw new InvalidOperationException($"Failed to deserialize custom:active_seasons claim.", ex);
        }            

        if (activeSeasons == null)
        {
            throw new InvalidOperationException($"Empty custom:active_seasons claim.");
        }

        var targetSeason = activeSeasons.FirstOrDefault(s => 
            s.League == league &&
            s.Season == season &&
            s.TeamDivision == division &&
            s.TeamName == teamName 
        );

        if (targetSeason == null)
        {
            throw new InvalidOperationException($"Missing seanson in custom:active_seasons claim for users.");
        }

        return activeSeasons;
    }

    public async Task AddLatestKudosDateToActiveSeason(string userSub, Dictionary<string, string> userClaims, 
        string league, string season, string division, string teamName,
        List<ActiveSeason>  activeSeasons,
        long matchDateTime)
    {
        var targetSeason = activeSeasons.FirstOrDefault(s => 
            s.League == league &&
            s.Season == season &&
            s.TeamDivision == division &&
            s.TeamName == teamName 
        );

        if (targetSeason == null)
        {
            throw new InvalidOperationException($"Missing seanson in custom:active_seasons claim for user with sub {userSub}.");
        }

        targetSeason.LatestKudos.Add(matchDateTime);
        // Keep only the two latest dates (remove the oldest date)
        targetSeason.LatestKudos = targetSeason.LatestKudos
            .OrderByDescending(x => x)
            .Take(2)
            .OrderBy(x => x)
            .ToList();

        string username = userSub;
        if (userClaims.TryGetValue("cognito:username", out var cognitoUsername) && !string.IsNullOrWhiteSpace(cognitoUsername))
        {
            username = cognitoUsername;
        }

        await UpdateUserAttribute(username, activeSeasons);
    }

    public static List<ActiveSeason> AddActiveSeason(UserType user, 
         string league, string season, string inviteeTeam, string inviteeDivision, string inviteeName, string inviteeRole)
    {
        var activeSeasonsAttr = user.Attributes.FirstOrDefault(a => a.Name == "custom:active_seasons");
        var activeSeasons = new List<ActiveSeason>();
        if (activeSeasonsAttr != null && !string.IsNullOrWhiteSpace(activeSeasonsAttr.Value))
        {
            try
            {
                activeSeasons = JsonSerializer.Deserialize<List<ActiveSeason>>(activeSeasonsAttr.Value) ?? new List<ActiveSeason>();
            }
            catch (JsonException ex)
            {
                throw new InvalidOperationException("The user's active seasons data is not in a valid format.", ex);
            }
        }

        var newActiveSeason = new ActiveSeason
        {
            League = league,
            Season = season,
            TeamName = inviteeTeam,
            TeamDivision = inviteeDivision,
            PersonName = inviteeName,
            Role = inviteeRole
        };

        var alreadyPresent = activeSeasons.Any(x =>
            x.League == newActiveSeason.League &&
            x.Season == newActiveSeason.Season &&
            x.TeamName == newActiveSeason.TeamName &&
            x.TeamDivision == newActiveSeason.TeamDivision &&
            x.PersonName == newActiveSeason.PersonName &&
            x.Role == newActiveSeason.Role);

        if (!alreadyPresent)
        {
            activeSeasons.Add(newActiveSeason);
        }

        return activeSeasons;
    }

    public static Dictionary<string, string> ExtractUserClaims(IDictionary<string, string>? authClaims, IDictionary<string, string> headers)
    {
        Dictionary<string, string> userClaims = new();
        
        // 1. Try to get claims from the Authorizer (populated by API Gateway in the Cloud)
        if (authClaims != null)
        {
            foreach (var kvp in authClaims) userClaims[kvp.Key] = kvp.Value;
        }
        /*
            foreach (var key in request.RequestContext.Authorizer.Claims.Keys)
            {
                var val = request.RequestContext.Authorizer.Claims[key];
                userClaims[key] = val?.ToString() ?? string.Empty;
            }        }
        */

        // 2. Fallback for local C# Acceptance testing (test, dev environment) where Authorizer claims are not populated
        if (userClaims.Count == 0)
        {
            if (headers != null && (headers.TryGetValue("Authorization", out var authHeader) || headers.TryGetValue("authorization", out authHeader)))
            {
                var token = authHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)
                    ? authHeader.Substring(7)
                    : authHeader;

                var parts = token.Split('.');
                if (parts.Length == 3)
                {
                    var payload = parts[1];
                    // Add padding if needed for Base64 decoding
                    payload = payload.PadRight(payload.Length + (4 - payload.Length % 4) % 4, '=');
                    var json = Encoding.UTF8.GetString(Convert.FromBase64String(payload));
                    using var doc = JsonDocument.Parse(json);
                    foreach (var prop in doc.RootElement.EnumerateObject())
                    {
                        userClaims[prop.Name] = prop.Value.ToString() ?? string.Empty;
                    }
                }
            }
        }

        return userClaims;
    }

    public static (string userName, string userEmail) GetAuthenticatedUserFromCognitoAuthorizerClaims(IDictionary<string, string>? authClaims)
    {
        var userName = string.Empty;
        var userEmail = string.Empty;
        if (authClaims != null)
        {

            if (authClaims.TryGetValue("email", out var email) && !string.IsNullOrWhiteSpace(email))
            {
                userEmail = email;
            }

            if (authClaims.TryGetValue("preferred_username", out var preferred) && !string.IsNullOrWhiteSpace(preferred))
                userName = preferred;
            else if (!string.IsNullOrWhiteSpace(email))
                userName = email;
            else if (authClaims.TryGetValue("cognito:username", out var cognitoUser) && !string.IsNullOrWhiteSpace(cognitoUser))
                userName = cognitoUser;
            else if (authClaims.TryGetValue("name", out var name) && !string.IsNullOrWhiteSpace(name))
                userName = name;
        }

        return (userName, userEmail);
    }

}

using System.Text.Json;
using Amazon.Lambda.Core;
using Amazon.CognitoIdentityProvider;
using Amazon.CognitoIdentityProvider.Model;

namespace TTLeaguePlayersApp.BackEnd.Cognito;

public class CognitoUsers
{
    private readonly ILoggerObserver _observer;
    private readonly string _cognitoUserPoolId;
    private readonly IAmazonCognitoIdentityProvider _cognitoClient;

    public CognitoUsers(ILoggerObserver observer, IAmazonCognitoIdentityProvider cognitoClient, string cognitoUserPoolId)
    {
        _observer = observer;
        _cognitoClient = cognitoClient;
        _cognitoUserPoolId = cognitoUserPoolId;
    }

    public async Task<UserType> RetrieveCognitoUserByEmailId(string inviteeEmailId, string nanoId, ILambdaContext context)
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
            _observer.OnRuntimeRegularEvent("ACCEPT INVITE USER NOT FOUND",
               source: new() { ["Class"] = nameof(CognitoUsers), ["Method"] = nameof(RetrieveCognitoUserByEmailId) },
               context, parameters: new() { [nameof(nanoId)] = nanoId, ["AlreadyAccepted"] = true.ToString() });

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

}

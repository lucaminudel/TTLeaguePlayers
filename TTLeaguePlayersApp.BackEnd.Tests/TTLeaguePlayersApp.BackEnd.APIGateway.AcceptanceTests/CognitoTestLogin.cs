using Amazon.CognitoIdentityProvider;
using Amazon.CognitoIdentityProvider.Model;

namespace TTLeaguePlayersApp.BackEnd.APIGateway.AcceptanceTests;

// Shared by every acceptance-test class that needs an authenticated call, in the style of
// RunningAgainst: a standalone static helper for a cross-cutting concern that every test class
// needs and none owns. It was four verbatim private copies before this.
//
// Acceptance tests hit the real HTTP API, which sits behind the Cognito authorizer, so any test
// expecting something other than a 401 has to present an ID token first.
//
// ADMIN_NO_SRP_AUTH is used because these are server-side tests with admin credentials; it is not
// the flow the app itself uses.
public static class CognitoTestLogin
{
    public static async Task<string> GetIdTokenAsync(
        IAmazonCognitoIdentityProvider cognitoClient,
        string userPoolId,
        string clientId,
        string email,
        string password)
    {
        var authRequest = new AdminInitiateAuthRequest
        {
            UserPoolId = userPoolId,
            ClientId = clientId,
            AuthFlow = AuthFlowType.ADMIN_NO_SRP_AUTH,
            AuthParameters = new Dictionary<string, string>
            {
                { "USERNAME", email },
                { "PASSWORD", password }
            }
        };

        var response = await cognitoClient.AdminInitiateAuthAsync(authRequest);
        return response.AuthenticationResult.IdToken;
    }
}

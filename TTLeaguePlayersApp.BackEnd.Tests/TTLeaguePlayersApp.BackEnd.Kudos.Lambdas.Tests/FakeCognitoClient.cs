using Amazon;
using Amazon.CognitoIdentityProvider;
using Amazon.CognitoIdentityProvider.Model;

namespace TTLeaguePlayersApp.BackEnd.Kudos.Lambdas.Tests;

internal sealed class FakeCognitoClient : AmazonCognitoIdentityProviderClient
{
    public int AdminUpdateUserAttributesCalls { get; private set; }
    public AdminUpdateUserAttributesRequest? LastAdminUpdateUserAttributesRequest { get; private set; }
    public bool ThrowOnAdminUpdateUserAttributes { get; set; }

    public FakeCognitoClient()
        : base(new Amazon.Runtime.AnonymousAWSCredentials(), new AmazonCognitoIdentityProviderConfig { RegionEndpoint = RegionEndpoint.USEast1 })
    {
    }

    public override Task<AdminUpdateUserAttributesResponse> AdminUpdateUserAttributesAsync(AdminUpdateUserAttributesRequest request, System.Threading.CancellationToken cancellationToken = default)
    {
        AdminUpdateUserAttributesCalls++;
        LastAdminUpdateUserAttributesRequest = request;

        if (ThrowOnAdminUpdateUserAttributes)
        {
            throw new System.Exception("Simulated Cognito update failure");
        }

        return Task.FromResult(new AdminUpdateUserAttributesResponse());
    }
}


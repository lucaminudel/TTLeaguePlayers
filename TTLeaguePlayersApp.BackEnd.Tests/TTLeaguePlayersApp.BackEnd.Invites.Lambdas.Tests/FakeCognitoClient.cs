using Amazon;
using Amazon.CognitoIdentityProvider;
using Amazon.CognitoIdentityProvider.Model;

namespace TTLeaguePlayersApp.BackEnd.Invites.Lambdas.Tests;

sealed class FakeCognitoClient : AmazonCognitoIdentityProviderClient
{
    public int ListUsersCalls { get; private set; }
    public int AdminUpdateUserAttributesCalls { get; private set; }

    public AdminUpdateUserAttributesRequest? LastAdminUpdateUserAttributesRequest { get; private set; }

    public List<AdminUpdateUserAttributesRequest> AdminUpdateUserAttributesRequests { get; } = new();

    public ListUsersResponse ListUsersResult { get; set; } = new() { Users = new() };
    public Exception? ThrowOnAdminUpdate { get; set; }

    private string? _currentActiveSeasonsJson;
    private string? _currentManagedClubsJson;

    public FakeCognitoClient()
        : base(new Amazon.Runtime.AnonymousAWSCredentials(), new AmazonCognitoIdentityProviderConfig { RegionEndpoint = RegionEndpoint.USEast1 })
    {
    }

    public override Task<ListUsersResponse> ListUsersAsync(ListUsersRequest request, CancellationToken cancellationToken = default)
    {
        ListUsersCalls++;

        if (ListUsersResult.Users.Count > 0)
        {
            var user = ListUsersResult.Users[0];
            user.Attributes ??= new List<AttributeType>();

            if (_currentActiveSeasonsJson != null) {
                user.Attributes.RemoveAll(a => a.Name == "custom:active_seasons");
                user.Attributes.Add(new AttributeType { Name = "custom:active_seasons", Value = _currentActiveSeasonsJson });
            }

            if (_currentManagedClubsJson != null)
            {
                user.Attributes.RemoveAll(a => a.Name == "custom:managed_clubs");
                user.Attributes.Add(new AttributeType { Name = "custom:managed_clubs", Value = _currentManagedClubsJson  });
            }
        }


        return Task.FromResult(ListUsersResult);
    }

    public override Task<AdminUpdateUserAttributesResponse> AdminUpdateUserAttributesAsync(AdminUpdateUserAttributesRequest request, CancellationToken cancellationToken = default)
    {
        AdminUpdateUserAttributesCalls++;
        LastAdminUpdateUserAttributesRequest = request;
        AdminUpdateUserAttributesRequests.Add(request);

        if (ThrowOnAdminUpdate != null)
        {
            return Task.FromException<AdminUpdateUserAttributesResponse>(ThrowOnAdminUpdate);
        }

        var activeSeasonsAttr = request.UserAttributes?.FirstOrDefault(a => a.Name == "custom:active_seasons");
        if (activeSeasonsAttr?.Value != null)
        {
            _currentActiveSeasonsJson = activeSeasonsAttr.Value;
        }

        var managedClubsAttr = request.UserAttributes?.FirstOrDefault(a => a.Name == "custom:managed_clubs");
        if (managedClubsAttr?.Value != null)
        {
            _currentManagedClubsJson = managedClubsAttr.Value;
        }

        return Task.FromResult(new AdminUpdateUserAttributesResponse());
    }
}

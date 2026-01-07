using Amazon;
using Amazon.CognitoIdentityProvider;
using Amazon.CognitoIdentityProvider.Model;
using Amazon.Lambda.TestUtilities;
using FluentAssertions;
using System.Text.Json;
using TTLeaguePlayersApp.BackEnd.Invites.DataStore;
using TTLeaguePlayersApp.BackEnd.Invites.Lambdas;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.Invites.Lambdas.Tests;

public class AccepteInviteLambdaTests
{
    private readonly TestLambdaContext _context = new();

    [Fact]
    public async Task WhenInviteNotYetAccepted_UpdatesUserActiveSeasons_And_SetsInviteAcceptedDate()
    {
        var nanoId = "11223344";
        var acceptedAt = 444;
        var invite = CreateInvite(nanoId, acceptedAt: null, inviteeEmailId: "user@example.com");

        var dataTable = new FakeInvitesDataTable();
        dataTable.Seed(invite);

        var cognito = new FakeCognitoClient
        {
            ListUsersResult = new ListUsersResponse
            {
                Users = new()
                {
                    new UserType
                    {
                        Username = "user-1",
                        Attributes = new() { new AttributeType { Name = "email", Value = "user@example.com" } }
                    }
                }
            }
        };

        var lambda = new AccepteInviteLambda(
            observer: new LoggerObserver(),
            invitesDataTable: dataTable,
            cognitoClient: cognito,
            cognitoUserPoolId: "pool");

        var result = await lambda.HandleAsync(nanoId, acceptedAt, _context);

        result.AcceptedAt.Should().Be(acceptedAt);
        dataTable.Invites[nanoId].AcceptedAt.Should().Be(acceptedAt);
        dataTable.MarkInviteAcceptedCalls.Should().Be(1);

        cognito.ListUsersCalls.Should().Be(1);
        cognito.AdminUpdateUserAttributesCalls.Should().Be(1);

        cognito.LastAdminUpdateUserAttributesRequest.Should().NotBeNull();
        var request = cognito.LastAdminUpdateUserAttributesRequest!;
        request.UserPoolId.Should().Be("pool");
        request.Username.Should().Be("user-1");
        request.UserAttributes.Should().ContainSingle(a => a.Name == "custom:active_seasons");

        var seasonsJson = request.UserAttributes.Single(a => a.Name == "custom:active_seasons").Value;
        seasonsJson.Should().NotBeNullOrWhiteSpace();

        using var jsonDoc = JsonDocument.Parse(seasonsJson);
        jsonDoc.RootElement.ValueKind.Should().Be(JsonValueKind.Array);

        var match = jsonDoc.RootElement.EnumerateArray().FirstOrDefault(x =>
            x.TryGetProperty("league", out var league) && league.GetString() == invite.League &&
            x.TryGetProperty("season", out var season) && season.GetString() == invite.Season);

        match.ValueKind.Should().NotBe(JsonValueKind.Undefined);
    }

    [Fact]
    public async Task WhenInviteSuccefullyAccepted_UserActiveSeasonsUpdateIsWellFormed()
    {
        var nanoId = "44332211";
        var acceptedAt = 555;
        var invite = CreateInvite(nanoId, acceptedAt: null, inviteeEmailId: "user@example.com");

        var dataTable = new FakeInvitesDataTable();
        dataTable.Seed(invite);

        var cognito = new FakeCognitoClient
        {
            ListUsersResult = new ListUsersResponse
            {
                Users = new()
                {
                    new UserType
                    {
                        Username = "user-1",
                        Attributes = new() { new AttributeType { Name = "email", Value = "user@example.com" } }
                    }
                }
            }
        };

        var lambda = new AccepteInviteLambda(
            observer: new LoggerObserver(),
            invitesDataTable: dataTable,
            cognitoClient: cognito,
            cognitoUserPoolId: "pool");

        await lambda.HandleAsync(nanoId, acceptedAt, _context);

        cognito.LastAdminUpdateUserAttributesRequest.Should().NotBeNull();
        var request = cognito.LastAdminUpdateUserAttributesRequest!;
        request.UserAttributes.Should().ContainSingle(a => a.Name == "custom:active_seasons");

        var seasonsJson = request.UserAttributes.Single(a => a.Name == "custom:active_seasons").Value;
        seasonsJson.Should().NotBeNullOrWhiteSpace();

        using var jsonDoc = JsonDocument.Parse(seasonsJson);
        var seasons = jsonDoc.RootElement;
        seasons.ValueKind.Should().Be(JsonValueKind.Array);

        var match = seasons.EnumerateArray().FirstOrDefault(x =>
            x.TryGetProperty("league", out var league) && league.GetString() == invite.League &&
            x.TryGetProperty("season", out var season) && season.GetString() == invite.Season);

        match.ValueKind.Should().NotBe(JsonValueKind.Undefined);

        match.GetProperty("league").GetString().Should().Be(invite.League);
        match.GetProperty("season").GetString().Should().Be(invite.Season);
        match.GetProperty("team_name").GetString().Should().Be(invite.InviteeTeam);
        match.GetProperty("team_division").GetString().Should().Be(invite.TeamDivision);
        match.GetProperty("person_name").GetString().Should().Be(invite.InviteeName);
        match.GetProperty("role").GetString().Should().Be(invite.InviteeRole.ToString());
    }

    [Fact]
    public async Task WhenInviteAcceptedAtUpdateFailsThenRetrySucceeds_UserActiveSeasonsDoesNotContainDuplicates()
    {
        var nanoId = "55667788";
        var acceptedAt = 777;
        var invite = CreateInvite(nanoId, acceptedAt: null, inviteeEmailId: "user@example.com");

        var dataTable = new FakeInvitesDataTable { ThrowOnceOnMarkInviteAccepted = new Exception("transient dynamodb failure") };
        dataTable.Seed(invite);

        var cognito = new FakeCognitoClient
        {
            ListUsersResult = new ListUsersResponse
            {
                Users = new()
                {
                    new UserType
                    {
                        Username = "user-1",
                        Attributes = new() { new AttributeType { Name = "email", Value = "user@example.com" } }
                    }
                }
            }
        };

        var lambda = new AccepteInviteLambda(
            observer: new LoggerObserver(),
            invitesDataTable: dataTable,
            cognitoClient: cognito,
            cognitoUserPoolId: "pool");

        var firstAttempt = () => lambda.HandleAsync(nanoId, acceptedAt, _context);
        await firstAttempt.Should().ThrowAsync<Exception>();

        var result = await lambda.HandleAsync(nanoId, acceptedAt, _context);
        result.AcceptedAt.Should().Be(acceptedAt);

        cognito.AdminUpdateUserAttributesRequests.Should().NotBeNull();
        cognito.AdminUpdateUserAttributesRequests.Count.Should().BeGreaterThanOrEqualTo(2);

        var lastRequest = cognito.AdminUpdateUserAttributesRequests.Last();
        var seasonsJson = lastRequest.UserAttributes.Single(a => a.Name == "custom:active_seasons").Value;

        using var jsonDoc = JsonDocument.Parse(seasonsJson);
        var seasons = jsonDoc.RootElement;
        seasons.ValueKind.Should().Be(JsonValueKind.Array);

        var duplicates = seasons.EnumerateArray().Count(x =>
            x.TryGetProperty("league", out var league) && league.GetString() == invite.League &&
            x.TryGetProperty("season", out var season) && season.GetString() == invite.Season &&
            x.TryGetProperty("team_name", out var team) && team.GetString() == invite.InviteeTeam &&
            x.TryGetProperty("team_division", out var division) && division.GetString() == invite.TeamDivision &&
            x.TryGetProperty("person_name", out var person) && person.GetString() == invite.InviteeName &&
            x.TryGetProperty("role", out var role) && role.GetString() == invite.InviteeRole.ToString());

        duplicates.Should().Be(1);
    }

    [Fact]
    public async Task WhenInviteAlreadyAccepted_DoesNotUpdateUserActiveSeasonsOrInviteAcceptedDate()
    {
        var nanoId = "12345678";
        var invite = CreateInvite(nanoId, acceptedAt: 111);

        var dataTable = new FakeInvitesDataTable();
        dataTable.Seed(invite);

        var cognito = new FakeCognitoClient();

        var lambda = new AccepteInviteLambda(
            observer: new LoggerObserver(),
            invitesDataTable: dataTable,
            cognitoClient: cognito,
            cognitoUserPoolId: "pool");

        var result = await lambda.HandleAsync(nanoId, acceptedAt: 222, _context);

        result.NanoId.Should().Be(nanoId);
        result.AcceptedAt.Should().Be(111);

        cognito.ListUsersCalls.Should().Be(0);
        cognito.AdminUpdateUserAttributesCalls.Should().Be(0);
        dataTable.MarkInviteAcceptedCalls.Should().Be(0);
    }

    [Fact]
    public async Task WhenUserActiveSeasonsUpdateFails_InviteAcceptedDateIsNotSet()
    {
        var nanoId = "87654321";
        var invite = CreateInvite(nanoId, acceptedAt: null, inviteeEmailId: "user@example.com");

        var dataTable = new FakeInvitesDataTable();
        dataTable.Seed(invite);

        var cognito = new FakeCognitoClient
        {
            ListUsersResult = new ListUsersResponse
            {
                Users = new()
                {
                    new UserType
                    {
                        Username = "user-1",
                        Attributes = new() { new AttributeType { Name = "email", Value = "user@example.com" } }
                    }
                }
            },
            ThrowOnAdminUpdate = new InternalErrorException("boom")
        };

        var lambda = new AccepteInviteLambda(
            observer: new LoggerObserver(),
            invitesDataTable: dataTable,
            cognitoClient: cognito,
            cognitoUserPoolId: "pool");

        var act = () => lambda.HandleAsync(nanoId, acceptedAt: 333, _context);

        await act.Should().ThrowAsync<InternalErrorException>();

        dataTable.MarkInviteAcceptedCalls.Should().Be(0);
        dataTable.Invites[nanoId].AcceptedAt.Should().BeNull();
    }

    private static Invite CreateInvite(string nanoId, long? acceptedAt, string inviteeEmailId = "test@example.com")
        => new()
        {
            NanoId = nanoId,
            InviteeName = "Test User",
            InviteeEmailId = inviteeEmailId,
            InviteeRole = Role.PLAYER,
            InviteeTeam = "Test Team",
            TeamDivision = "Test Division",
            League = "Test League",
            Season = "2025-2026",
            InvitedBy = "Test Inviter",
            CreatedAt = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
            AcceptedAt = acceptedAt
        };

    private sealed class FakeInvitesDataTable : IInvitesDataTable
    {
        public Dictionary<string, Invite> Invites { get; } = new();

        public int MarkInviteAcceptedCalls { get; private set; }

        public Exception? ThrowOnceOnMarkInviteAccepted { get; set; }

        public void Seed(Invite invite) => Invites[invite.NanoId] = invite;

        public Task<Invite> RetrieveInvite(string nanoId)
        {
            if (!Invites.TryGetValue(nanoId, out var invite))
            {
                throw new KeyNotFoundException();
            }

            return Task.FromResult(invite);
        }

        public Task MarkInviteAccepted(string nanoId, long acceptedAt)
        {
            MarkInviteAcceptedCalls++;

            if (ThrowOnceOnMarkInviteAccepted != null)
            {
                var ex = ThrowOnceOnMarkInviteAccepted;
                ThrowOnceOnMarkInviteAccepted = null;
                throw ex;
            }

            if (!Invites.TryGetValue(nanoId, out var invite))
            {
                throw new KeyNotFoundException();
            }

            invite.AcceptedAt = acceptedAt;
            return Task.CompletedTask;
        }

        public Task CreateNewInvite(Invite invite)
        {
            Invites[invite.NanoId] = invite;
            return Task.CompletedTask;
        }

        public Task DeleteInvite(string nanoId)
        {
            Invites.Remove(nanoId);
            return Task.CompletedTask;
        }

        public void Dispose() { }
    }

    private sealed class FakeCognitoClient : AmazonCognitoIdentityProviderClient
    {
        public int ListUsersCalls { get; private set; }
        public int AdminUpdateUserAttributesCalls { get; private set; }

        public AdminUpdateUserAttributesRequest? LastAdminUpdateUserAttributesRequest { get; private set; }

        public List<AdminUpdateUserAttributesRequest> AdminUpdateUserAttributesRequests { get; } = new();

        public ListUsersResponse ListUsersResult { get; set; } = new() { Users = new() };
        public Exception? ThrowOnAdminUpdate { get; set; }

        private string? _currentActiveSeasonsJson;

        public FakeCognitoClient()
            : base(new Amazon.Runtime.AnonymousAWSCredentials(), new AmazonCognitoIdentityProviderConfig { RegionEndpoint = RegionEndpoint.USEast1 })
        {
        }

        public override Task<ListUsersResponse> ListUsersAsync(ListUsersRequest request, CancellationToken cancellationToken = default)
        {
            ListUsersCalls++;

            if (ListUsersResult.Users.Count > 0 && _currentActiveSeasonsJson != null)
            {
                var user = ListUsersResult.Users[0];
                user.Attributes ??= new List<AttributeType>();
                user.Attributes.RemoveAll(a => a.Name == "custom:active_seasons");
                user.Attributes.Add(new AttributeType { Name = "custom:active_seasons", Value = _currentActiveSeasonsJson });
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

            return Task.FromResult(new AdminUpdateUserAttributesResponse());
        }
    }
}

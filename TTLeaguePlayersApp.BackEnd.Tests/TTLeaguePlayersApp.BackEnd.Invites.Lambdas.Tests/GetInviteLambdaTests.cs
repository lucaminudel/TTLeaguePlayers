using Amazon.CognitoIdentityProvider.Model;
using Amazon.Lambda.TestUtilities;
using FluentAssertions;
using TTLeaguePlayersApp.BackEnd.Cognito;
using TTLeaguePlayersApp.BackEnd.Invites.DataStore;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.Invites.Lambdas.Tests;

public class GetInviteLambdaTests
{
    private readonly TestLambdaContext _context = new();
    private readonly FakeCognitoClient _cognitoClient;
    private readonly FakeInvitesDataTable _dataTable;

    public GetInviteLambdaTests()
    {
        _cognitoClient = new FakeCognitoClient();
        _dataTable = new FakeInvitesDataTable();
    }

    [Fact]
    public async Task WhenInviteeIsRegisteredInCognito_ReturnsInviteeAlreadyRegisteredTrue()
    {
        // Arrange
        var nanoId = "11223344";
        var invite = CreatePlayerInvite(nanoId, inviteeEmailId: "registered@example.com");
        _dataTable.Seed(invite);

        _cognitoClient.ListUsersResult = new ListUsersResponse
        {
            Users = new()
            {
                new UserType
                {
                    Username = "user-1",
                    Attributes = new() { new AttributeType { Name = "email", Value = "registered@example.com" } }
                }
            }
        };

        var lambda = CreateLambda();

        // Act
        var result = await lambda.HandleAsync(nanoId, _context);

        // Assert
        result.InviteeAlreadyRegistered.Should().BeTrue();
        _cognitoClient.ListUsersCalls.Should().Be(1);
    }

    [Fact]
    public async Task WhenInviteeIsNotRegisteredInCognito_ReturnsInviteeAlreadyRegisteredFalse()
    {
        // Arrange
        var nanoId = "22334455";
        var invite = CreatePlayerInvite(nanoId, inviteeEmailId: "unregistered@example.com");
        _dataTable.Seed(invite);

        _cognitoClient.ListUsersResult = new ListUsersResponse
        {
            Users = new() // Empty — no matching user
        };

        var lambda = CreateLambda();

        // Act
        var result = await lambda.HandleAsync(nanoId, _context);

        // Assert
        result.InviteeAlreadyRegistered.Should().BeFalse();
        _cognitoClient.ListUsersCalls.Should().Be(1);
    }

    [Fact]
    public async Task WhenNanoIdIsInvalid_Throws_ValidationException()
    {
        var lambda = CreateLambda();

        var act = () => lambda.HandleAsync("short", _context);

        await act.Should().ThrowAsync<ValidationException>();
    }

    [Fact]
    public async Task WhenInviteNotFound_ThrowsKeyNotFoundException()
    {
        // Arrange — no invite seeded
        var lambda = CreateLambda();

        // Act
        var act = () => lambda.HandleAsync("99887766", _context);

        // Assert
        await act.Should().ThrowAsync<KeyNotFoundException>()
            .WithMessage("Invite not found");
    }

    [Fact]
    public async Task WhenInviteExists_ReturnsAllInviteFields()
    {
        // Arrange
        var nanoId = "33445566";
        var invite = CreatePlayerInvite(nanoId, inviteeEmailId: "someone@example.com");
        _dataTable.Seed(invite);

        _cognitoClient.ListUsersResult = new ListUsersResponse { Users = new() };

        var lambda = CreateLambda();

        // Act
        var result = await lambda.HandleAsync(nanoId, _context);

        // Assert
        result.NanoId.Should().Be(nanoId);
        result.InviteeName.Should().Be(invite.InviteeName);
        result.InviteeEmailId.Should().Be(invite.InviteeEmailId);
        result.League.Should().Be(invite.League);
        result.Season.Should().Be(invite.Season);
        result.InviteeAlreadyRegistered.Should().NotBeNull();
    }

    [Fact]
    public async Task WhenClubManagerInviteeIsRegistered_ReturnsInviteeAlreadyRegisteredTrue()
    {
        // Arrange
        var nanoId = "44556677";
        var invite = CreateClubManagerInvite(nanoId, inviteeEmailId: "manager@example.com");
        _dataTable.Seed(invite);

        _cognitoClient.ListUsersResult = new ListUsersResponse
        {
            Users = new()
            {
                new UserType
                {
                    Username = "manager-user",
                    Attributes = new() { new AttributeType { Name = "email", Value = "manager@example.com" } }
                }
            }
        };

        var lambda = CreateLambda();

        // Act
        var result = await lambda.HandleAsync(nanoId, _context);

        // Assert
        result.InviteeAlreadyRegistered.Should().BeTrue();
    }

    private GetInviteLambda CreateLambda() =>
        new(
            observer: new LoggerObserver(),
            invitesDataTable: _dataTable,
            cognitoUsers: new CognitoUsers(
                cognitoClient: _cognitoClient,
                cognitoUserPoolId: "pool"));

    private static CaptainOrPlayerInvite CreatePlayerInvite(string nanoId, string inviteeEmailId = "test@example.com")
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
            AcceptedAt = null
        };

    private static ClubManagerInvite CreateClubManagerInvite(string nanoId, string inviteeEmailId = "test@example.com")
        => new()
        {
            NanoId = nanoId,
            InviteeName = "Test Manager",
            InviteeEmailId = inviteeEmailId,
            InviteeRole = Role.CLUB_MANAGER,
            InviteeClub = "Test Club",
            ClubLocation = "London",
            League = "Test League",
            Season = "2025-2026",
            InvitedBy = "Test Inviter",
            CreatedAt = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
            AcceptedAt = null
        };
}

using Amazon.Lambda.TestUtilities;
using FluentAssertions;
using TTLeaguePlayersApp.BackEnd.Invites.DataStore;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.Invites.Lambdas.Tests;

public class CreateInviteLambdaTests
{
    private readonly TestLambdaContext _context = new();
    private readonly FakeInvitesDataTable _dataTable = new();
    private readonly CreateInviteLambda _lambda;

    public CreateInviteLambdaTests()
    {
        _lambda = new CreateInviteLambda(
            observer: new LoggerObserver(),
            invitesDataTable: _dataTable,
            new Uri("http://example.com/invite"),
            sendInviteImail: false, inviteEmailAddress: "any@email_address.com");
    }

    [Fact]
    public async Task WhenCreatePlayerInviteRequestIsValid_CreatesInviteInDataTable()
    {
        var request = new CreateInviteRequest
        {
            InvitedBy = "Pino Gino",
            InviteeEmailId = "test@email.com",
            InviteeName = "Test User",
            InviteeRole = Role.PLAYER,
            League = "Test League",
            Season = "2024",
            InviteeTeam = "Test Team",
            TeamDivision = "Division 1"
        };

        var result = await _lambda.HandleAsync(request, _context);

        result.Should().BeOfType<CaptainOrPlayerInvite>();
        result.InviteeRole.Should().Be(Role.PLAYER);
        _dataTable.Invites.Should().ContainKey(result.NanoId);
    }

    [Fact]
    public async Task WhenCreateClubManagerInviteRequestIsValid_CreatesInviteInDataTable()
    {
        var request = new CreateInviteRequest
        {
            InvitedBy = "Pino Gino",
            InviteeEmailId = "manager@email.com",
            InviteeName = "Test Manager",
            InviteeRole = Role.CLUB_MANAGER,
            League = "Test League",
            Season = "2024",
            InviteeClub = "Test Club",
            ClubLocation = "London"
        };

        var result = await _lambda.HandleAsync(request, _context);

        result.Should().BeOfType<ClubManagerInvite>();
        result.InviteeRole.Should().Be(Role.CLUB_MANAGER);
        _dataTable.Invites.Should().ContainKey(result.NanoId);
    }

    [Fact]
    public async Task WhenInviteeRoleIsInvalid_Throws_ValidationException()
    {
        var request = new CreateInviteRequest
        {
            InvitedBy = "Pino Gino",
            InviteeEmailId = "test@email.com",
            InviteeName = "Test User",
            InviteeRole = (Role)99,
            League = "Test League",
            Season = "2024"
        };

        var act = () => _lambda.HandleAsync(request, _context);

        var exception = await act.Should().ThrowAsync<ValidationException>();
        exception.Which.Errors.Should().Contain(e => e.Contains("invitee_role is not a valid role"));
    }

    [Fact]
    public async Task WhenCaptainInviteRequestHasClubLocation_Throws_ValidationException()
    {
        var request = new CreateInviteRequest
        {
            InvitedBy = "Pino Gino",
            InviteeEmailId = "test@email.com",
            InviteeName = "Test User",
            InviteeRole = Role.CAPTAIN,
            League = "Test League",
            Season = "2024",
            InviteeTeam = "Test Team",
            TeamDivision = "Division 1",
            ClubLocation = "London"
        };

        var act = () => _lambda.HandleAsync(request, _context);

        var exception = await act.Should().ThrowAsync<ValidationException>();
        exception.Which.Errors.Should().Contain(e => e.Contains("club_location is unexpected for CAPTAIN and PLAYER invites"));
    }

    [Fact]
    public async Task WhenDataStoreFails_ExceptionIsRethrown()
    {
        _dataTable.ThrowOnceOnCreateNewInvite = new Exception("datastore failure");
        var request = new CreateInviteRequest
        {
            InvitedBy = "Pino Gino",
            InviteeEmailId = "test@email.com",
            InviteeName = "Test User",
            InviteeRole = Role.PLAYER,
            League = "Test League",
            Season = "2024",
            InviteeTeam = "Test Team",
            TeamDivision = "Division 1"
        };

        var act = () => _lambda.HandleAsync(request, _context);

        await act.Should().ThrowAsync<Exception>().WithMessage("datastore failure");
    }

    [Fact]
    public async Task WhenCreateCaptainInviteRequestIsMalformed_Throws_ValidationException()
    {
        var captainWithClubInviteRequest = new CreateInviteRequest
        {
            InvitedBy = "Pino Gino",
            InviteeEmailId = "test@email.com",

            InviteeName = "Test User",
            InviteeRole = Role.CAPTAIN,

            League = "Test League",
            Season = "2024",

            InviteeTeam = "Test Team",
            TeamDivision = "Division 1999",
            InviteeClub = "Test Club"
        };

        Func<Task> act = async () => await _lambda.HandleAsync(captainWithClubInviteRequest, _context);

        // Assert
       var exception = await act.Should().ThrowAsync<ValidationException>();
        exception.Which.Errors.Should().HaveCount(1);
        exception.Which.Errors.Should().Contain(e => e.Contains("invitee_club is unexpected for CAPTAIN and PLAYER invites"));
    }

    [Fact]
    public async Task WhenCreateClubManagerInviteRequestIsMalformed_Throws_ValidationException()
    {
        var clubManagerWithTeamInviteRequest = new CreateInviteRequest
        {
            InvitedBy = "Pino Gino",
            InviteeEmailId = "test@email.com",

            InviteeName = "Test User",
            InviteeRole = Role.CLUB_MANAGER,

            League = "Test League",
            Season = "2024",

            InviteeTeam = "Test Team",
            InviteeClub = "Test Club"
        };

        var clubManagerWithTeamDivisionInviteRequest = new CreateInviteRequest
        {
            InvitedBy = "Pino Gino",
            InviteeEmailId = "test@email.com",

            InviteeName = "Test User",
            InviteeRole = Role.CLUB_MANAGER,

            League = "Test League",
            Season = "2024",

            TeamDivision = "Division 1999",
            InviteeClub = "Test Club"
        };


        // Act
        Func<Task> actWIthTeamInvite = async () => await _lambda.HandleAsync(clubManagerWithTeamInviteRequest, _context);
        Func<Task> actWithTeamDivision = async () => await _lambda.HandleAsync(clubManagerWithTeamDivisionInviteRequest, _context);

        // Assert
       var exception = await actWIthTeamInvite.Should().ThrowAsync<ValidationException>();
        exception.Which.Errors.Should().HaveCount(1);
        exception.Which.Errors.Should().Contain(e => e.Contains("invitee_team is unexpected for CLUB_MANAGER invites"));

        // Assert
       exception = await actWithTeamDivision.Should().ThrowAsync<ValidationException>();
        exception.Which.Errors.Should().HaveCount(1);
        exception.Which.Errors.Should().Contain(e => e.Contains("team_division is unexpected for CLUB_MANAGER invites"));
    }

}

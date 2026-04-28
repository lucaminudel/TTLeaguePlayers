using Amazon.Lambda.TestUtilities;
using FluentAssertions;
using TTLeaguePlayersApp.BackEnd.Invites.DataStore;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.Invites.Lambdas.Tests;

public class CreateInviteLambdaTests
{
    private readonly TestLambdaContext _context = new();

    [Fact]
    public async Task WhenCreateCaptainInviteRequestIsMalformed_Throws_ValidationException()
    {

        var dataTable = new FakeInvitesDataTable();
        var lambda = new CreateInviteLambda(
            observer: new LoggerObserver(),
            invitesDataTable: dataTable, 
            new Uri("http://example.com/invite"), 
            sendInviteImail: true, inviteEmailAddress: "any@email_address.com");

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

        Func<Task> act = async () => await lambda.HandleAsync(captainWithClubInviteRequest,  _context);

        // Assert
       var exception = await act.Should().ThrowAsync<ValidationException>();
        exception.Which.Errors.Should().HaveCount(1);
        exception.Which.Errors.Should().Contain(e => e.Contains("invitee_club is unexpected for CAPTAIN and PLAYER invites"));

    }

    [Fact]
    public async Task WhenCreateClubManagerInviteRequestIsMalformed_Throws_ValidationException()
    {

        var dataTable = new FakeInvitesDataTable();
        var lambda = new CreateInviteLambda(
            observer: new LoggerObserver(),
            invitesDataTable: dataTable, 
            new Uri("http://example.com/invite"), 
            sendInviteImail: true, inviteEmailAddress: "any@email_address.com");

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
        Func<Task> actWIthTeamInvite = async () => await lambda.HandleAsync(clubManagerWithTeamInviteRequest,  _context);
        Func<Task> actWithTeamDivision = async () => await lambda.HandleAsync(clubManagerWithTeamDivisionInviteRequest,  _context);

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

using Amazon.Lambda.TestUtilities;
using FluentAssertions;
using System.Collections.Generic;
using System.Threading.Tasks;
using TTLeaguePlayersApp.BackEnd.Cognito;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.ClubsAndTournaments.Lambdas.Tests;

public class DeleteTournamentLambdaTests
{
    private readonly TestLambdaContext _context = new();

    [Fact]
    public async Task WhenUserIsNotManager_LogSecurityValidationExceptionAndContinue()
    {
        // Arrange
        var dataTable = new FakeClubsAndTournamentsDataTable();
        var observer = new SpyLoggerObserver();
        var lambda = new DeleteTournamentLambda(observer, dataTable);

        var claims = new Dictionary<string, string>();

        // Act
        var act = async () => await lambda.HandleAsync("Test Location", "Test Club", "Test Tournament", claims, _context);

        // Assert
        await act.Should().NotThrowAsync<SecurityValidationException>();
        observer.SecurityErrors.Should().ContainSingle().Which.Should().BeOfType<SecurityValidationException>();
        dataTable.DeletedTournaments.Should().HaveCount(1);
    }

    [Fact]
    public async Task WhenClaimsAreMalformed_LogsSecurityValidationExceptionAndContinues()
    {
        var dataTable = new FakeClubsAndTournamentsDataTable();
        var observer = new SpyLoggerObserver();
        var lambda = new DeleteTournamentLambda(observer, dataTable);

        var claims = new Dictionary<string, string>
        {
            { "custom:managed_clubs", "INVALID_JSON" }
        };

        var act = async () => await lambda.HandleAsync("Test Location", "Test Club", "Test Tournament", claims, _context);

        // Assert
        await act.Should().NotThrowAsync<SecurityValidationException>();
        observer.SecurityErrors.Should().ContainSingle().Which.Should().BeOfType<SecurityValidationException>();
        dataTable.DeletedTournaments.Should().HaveCount(1);
    }

    [Fact]
    public async Task WhenUserIsNotManagerForThisClub_LogsSecurityValidationExceptionAndContinues()
    {
        var dataTable = new FakeClubsAndTournamentsDataTable();
        var observer = new SpyLoggerObserver();
        var lambda = new DeleteTournamentLambda(observer, dataTable);

        var claims = new Dictionary<string, string>
        {
            { "custom:managed_clubs", "[{\"ClubLocation\":\"Other Location\",\"ClubName\":\"Other Club\"}]" }
        };

        var act = async () => await lambda.HandleAsync("Test Location", "Test Club", "Test Tournament", claims, _context);

        // Assert
        await act.Should().NotThrowAsync<SecurityValidationException>();
        observer.SecurityErrors.Should().ContainSingle().Which.Should().BeOfType<SecurityValidationException>();
        dataTable.DeletedTournaments.Should().HaveCount(1);
    }

    [Fact]
    public async Task WhenUserIsManager_DeletesTournament()
    {
        var dataTable = new FakeClubsAndTournamentsDataTable();
        var lambda = new DeleteTournamentLambda(new LoggerObserver(), dataTable);
        
        var claims = new Dictionary<string, string>
        {
            { "custom:managed_clubs", "[{\"ClubLocation\":\"Test Location\",\"ClubName\":\"Test Club\"}]" }
        };

        await lambda.HandleAsync("Test Location", "Test Club", "Test Tournament", claims, _context);

        dataTable.DeletedTournaments.Should().ContainSingle(t => t.location == "Test Location" && t.clubName == "Test Club" && t.tournamentName == "Test Tournament");
    }
}

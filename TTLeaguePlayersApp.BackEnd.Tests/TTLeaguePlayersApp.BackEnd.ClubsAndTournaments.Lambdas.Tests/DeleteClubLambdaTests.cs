using Amazon.Lambda.TestUtilities;
using FluentAssertions;
using Xunit;
using TTLeaguePlayersApp.BackEnd.Tests;

namespace TTLeaguePlayersApp.BackEnd.ClubsAndTournaments.Lambdas.Tests;

public partial class DeleteClubLambdaTests
{
    private readonly TestLambdaContext _context = new();

    [Fact]
    public async Task WhenUserIsNotManager_LogSecurityValidationExceptionAndContinue()
    {
        // Arrange
        var dataTable = new FakeClubsAndTournamentsDataTable();
        var observer = new SpyLoggerObserver();
        var lambda = new DeleteClubLambda(observer, dataTable);
        
        var claims = new Dictionary<string, string>();

        // Act
        var act = async () => await lambda.HandleAsync("Test Location", "Test Club", claims, _context);

        // Assert
        await act.Should().NotThrowAsync<SecurityValidationException>();
        observer.SecurityErrors.Should().ContainSingle().Which.Should().BeOfType<SecurityValidationException>();
        dataTable.DeletedClubs.Should().HaveCount(1);
    }

    [Fact]
    public async Task WhenClaimsAreMalformed_LogsSecurityValidationExceptionAndContinues()
    {
        var dataTable = new FakeClubsAndTournamentsDataTable();
        var observer = new SpyLoggerObserver();
        var lambda = new DeleteClubLambda(observer, dataTable);
        
        var claims = new Dictionary<string, string>
        {
            { "custom:managed_clubs", "INVALID_JSON" }
        };

        var act = async () => await lambda.HandleAsync("Test Location", "Test Club", claims, _context);

        await act.Should().NotThrowAsync<SecurityValidationException>();
        observer.SecurityErrors.Should().ContainSingle().Which.Should().BeOfType<SecurityValidationException>();
        dataTable.DeletedClubs.Should().HaveCount(1);
    }

    [Fact]
    public async Task WhenUserIsNotManagerForThisClub_LogsSecurityValidationExceptionAndContinues()
    {
        var dataTable = new FakeClubsAndTournamentsDataTable();
        var observer = new SpyLoggerObserver();
        var lambda = new DeleteClubLambda(observer, dataTable);
        
        var claims = new Dictionary<string, string>
        {
            { "custom:managed_clubs", "[{\"ClubLocation\":\"Other Location\",\"ClubName\":\"Other Club\"}]" }
        };

        var act = async () => await lambda.HandleAsync("Test Location", "Test Club", claims, _context);

        await act.Should().NotThrowAsync<SecurityValidationException>();
        observer.SecurityErrors.Should().ContainSingle().Which.Should().BeOfType<SecurityValidationException>();
        dataTable.DeletedClubs.Should().HaveCount(1);
    }

    [Fact]
    public async Task WhenUserIsManager_DeletesClub()
    {
        // Arrange
        var dataTable = new FakeClubsAndTournamentsDataTable();
        var lambda = new DeleteClubLambda(new LoggerObserver(), dataTable);
        
        var claims = new Dictionary<string, string>
        {
            { "custom:managed_clubs", "[{\"ClubLocation\":\"Test Location\",\"ClubName\":\"Test Club\"}]" }
        };

        // Act
        await lambda.HandleAsync("Test Location", "Test Club", claims, _context);

        // Assert
        dataTable.DeletedClubs.Should().ContainSingle(c => c.location == "Test Location" && c.clubName == "Test Club");
    }
}

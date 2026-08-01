using Amazon.Lambda.TestUtilities;
using FluentAssertions;
using TTLeaguePlayersApp.BackEnd.ClubsAndTournaments.DataStore;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.ClubsAndTournaments.Lambdas.Tests;

public class RetrieveTournamentsForClubLambdaTests
{
    private readonly TestLambdaContext _context = new();

    [Fact]
    public async Task WhenClubHasTournaments_ReturnsMappedResponses()
    {
        // Arrange
        var dataTable = new FakeClubsAndTournamentsDataTable();
        dataTable.TournamentsForClubToReturn.Add(new Tournament
        {
            Location       = "Expected Location",
            ClubName       = "Expected Club",
            TournamentName = "Full Tournament",
            TournamentInfo = new System.Uri("https://fullclub.com/tournament"),
            Instagram      = new System.Uri("https://instagram.com/fulltournament"),
            Facebook       = new System.Uri("https://facebook.com/fulltournament"),
            StartDate      = 1000,
            EndDate        = 2000,
        });

        var lambda = new RetrieveTournamentsForClubLambda(new LoggerObserver(), dataTable);

        // Act
        var results = await lambda.HandleAsync("Expected Location", "Expected Club", _context);

        // Assert
        results.Should().HaveCount(1);
        var tResponse = results[0];
        tResponse.TournamentName.Should().Be("Full Tournament");
        tResponse.TournamentInfo.Should().Be(new System.Uri("https://fullclub.com/tournament"));
        tResponse.Instagram.Should().Be(new System.Uri("https://instagram.com/fulltournament"));
        tResponse.Facebook.Should().Be(new System.Uri("https://facebook.com/fulltournament"));
        tResponse.StartDate.Should().Be(1000);
        tResponse.EndDate.Should().Be(2000);
    }

    [Fact]
    public async Task WhenClubHasNoTournaments_ReturnsEmptyList()
    {
        // Arrange
        var dataTable = new FakeClubsAndTournamentsDataTable();
        var lambda = new RetrieveTournamentsForClubLambda(new LoggerObserver(), dataTable);

        // Act
        var results = await lambda.HandleAsync("Unknown Location", "Unknown Club", _context);

        // Assert
        results.Should().BeEmpty();
    }

    [Fact]
    public async Task PassesLocationAndClubNameToDataStore()
    {
        // Arrange
        var dataTable = new FakeClubsAndTournamentsDataTable();
        var lambda = new RetrieveTournamentsForClubLambda(new LoggerObserver(), dataTable);

        // Act
        await lambda.HandleAsync("Manchester", "Flick M", _context);

        // Assert
        dataTable.LastRetrieveTournamentsForClubArgs.Should().Be(("Manchester", "Flick M"));
    }

    [Fact]
    public async Task WhenOptionalSocialFieldsAreNull_ResponseKeepsThemNull()
    {
        // Arrange
        var dataTable = new FakeClubsAndTournamentsDataTable();
        dataTable.TournamentsForClubToReturn.Add(new Tournament
        {
            Location       = "London",
            ClubName       = "Minimal Club",
            TournamentName = "Minimal Tournament",
            TournamentInfo = new System.Uri("https://minimalclub.com/tournament"),
            StartDate      = 1000,
            EndDate         = 2000,
        });

        var lambda = new RetrieveTournamentsForClubLambda(new LoggerObserver(), dataTable);

        // Act
        var results = await lambda.HandleAsync("London", "Minimal Club", _context);

        // Assert
        results.Should().HaveCount(1);
        results[0].Instagram.Should().BeNull();
        results[0].Facebook.Should().BeNull();
    }

    [Fact]
    public async Task WhenDataStoreFails_ExceptionIsRethrown()
    {
        // Arrange
        var dataTable = new FakeClubsAndTournamentsDataTable
        {
            ThrowOnRetrieveTournamentsForClub = true
        };
        var lambda = new RetrieveTournamentsForClubLambda(new LoggerObserver(), dataTable);

        // Act
        var act = async () => await lambda.HandleAsync("Expected Location", "Expected Club", _context);

        // Assert
        await act.Should().ThrowAsync<System.Exception>()
            .WithMessage("Simulated data store failure for tournaments for club retrieval");
        dataTable.LastRetrieveTournamentsForClubArgs.Should().Be(("Expected Location", "Expected Club"));
    }
}

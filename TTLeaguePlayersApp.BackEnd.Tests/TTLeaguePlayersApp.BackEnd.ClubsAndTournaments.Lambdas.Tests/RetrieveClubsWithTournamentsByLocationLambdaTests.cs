using Amazon.Lambda.TestUtilities;
using FluentAssertions;
using TTLeaguePlayersApp.BackEnd.ClubsAndTournaments.DataStore;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.ClubsAndTournaments.Lambdas.Tests;

public class RetrieveClubsWithTournamentsByLocationLambdaTests
{
    private readonly TestLambdaContext _context = new();

    [Fact]
    public async Task WhenRetrieveByLocation_ReturnsMappedResults()
    {
        // Arrange
        var dataTable = new FakeClubsAndTournamentsDataTable();
        
        dataTable.ClubsWithTournamentsToReturn.Add((
            new Club 
            { 
                ClubName = "Full Club", 
                Location = "Expected Location", 
                Homepage = new System.Uri("https://fullclub.com"),
                Instagram = new System.Uri("https://instagram.com/fullclub"),
                Facebook = new System.Uri("https://facebook.com/fullclub"),
                Youtube = new System.Uri("https://youtube.com/fullclub")
            },
            new List<Tournament> 
            { 
                new Tournament 
                { 
                    TournamentName = "Full Tournament", 
                    Location = "Expected Location", 
                    ClubName = "Full Club", 
                    TournamentInfo = new System.Uri("https://fullclub.com/tournament"),
                    Instagram = new System.Uri("https://instagram.com/fulltournament"),
                    Facebook = new System.Uri("https://facebook.com/fulltournament"),
                    StartDate = 1000,
                    EndDate = 2000
                } 
            }
        ));

        var lambda = new RetrieveClubsWithTournamentsByLocationLambda(new LoggerObserver(), dataTable);

        // Act
        var results = await lambda.HandleAsync("Expected Location", _context);

        // Assert
        dataTable.LastRetrieveLocation.Should().Be("Expected Location");

        results.Should().NotBeNull();
        results.Should().HaveCount(1);
        
        var clubResult = results[0];
        clubResult.ClubName.Should().Be("Full Club");
        clubResult.Location.Should().Be("Expected Location");
        clubResult.Homepage.Should().Be(new System.Uri("https://fullclub.com"));
        clubResult.Instagram.Should().Be(new System.Uri("https://instagram.com/fullclub"));
        clubResult.Facebook.Should().Be(new System.Uri("https://facebook.com/fullclub"));
        clubResult.Youtube.Should().Be(new System.Uri("https://youtube.com/fullclub"));

        clubResult.Tournaments.Should().HaveCount(1);
        var tResponse = clubResult.Tournaments[0];
        tResponse.TournamentName.Should().Be("Full Tournament");
        tResponse.TournamentInfo.Should().Be(new System.Uri("https://fullclub.com/tournament"));
        tResponse.Instagram.Should().Be(new System.Uri("https://instagram.com/fulltournament"));
        tResponse.Facebook.Should().Be(new System.Uri("https://facebook.com/fulltournament"));
        tResponse.StartDate.Should().Be(1000);
        tResponse.EndDate.Should().Be(2000);
    }

    [Fact]
    public async Task WhenNoClubsFoundForLocation_ReturnsEmptyList()
    {
        // Arrange
        var dataTable = new FakeClubsAndTournamentsDataTable();
        var lambda = new RetrieveClubsWithTournamentsByLocationLambda(new LoggerObserver(), dataTable);

        // Act
        var results = await lambda.HandleAsync("Unknown Location", _context);

        // Assert
        dataTable.LastRetrieveLocation.Should().Be("Unknown Location");
        results.Should().BeEmpty();
    }

    [Fact]
    public async Task WhenDataStoreFails_ExceptionIsRethrown()
    {
        // Arrange
        var dataTable = new FakeClubsAndTournamentsDataTable
        {
            ThrowOnRetrieveClubsWithTournamentsByLocation = true
        };
        var lambda = new RetrieveClubsWithTournamentsByLocationLambda(new LoggerObserver(), dataTable);

        // Act
        var act = async () => await lambda.HandleAsync("Expected Location", _context);

        // Assert
        await act.Should().ThrowAsync<System.Exception>()
            .WithMessage("Simulated data store failure for clubs with tournaments by location retrieval");
        dataTable.LastRetrieveLocation.Should().Be("Expected Location");
    }
}

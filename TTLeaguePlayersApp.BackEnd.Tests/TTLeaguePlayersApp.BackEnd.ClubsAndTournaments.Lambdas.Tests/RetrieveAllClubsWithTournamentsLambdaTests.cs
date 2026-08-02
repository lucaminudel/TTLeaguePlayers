using Amazon.Lambda.TestUtilities;
using FluentAssertions;
using TTLeaguePlayersApp.BackEnd.ClubsAndTournaments.DataStore;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.ClubsAndTournaments.Lambdas.Tests;

public class RetrieveAllClubsWithTournamentsLambdaTests
{
    private readonly TestLambdaContext _context = new();

    [Fact]
    public async Task WhenRetrieveAllClubs_ReturnsMappedResults()
    {
        // Arrange
        var dataTable = new FakeClubsAndTournamentsDataTable();
        
        dataTable.ClubsWithTournamentsToReturn.Add((
            new ClubListing
            {
                ClubName = "Full Club",
                Location = "Full Location",
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
                    Location = "Full Location", 
                    ClubName = "Full Club", 
                    TournamentInfo = new System.Uri("https://fullclub.com/tournament"),
                    Instagram = new System.Uri("https://instagram.com/fulltournament"),
                    Facebook = new System.Uri("https://facebook.com/fulltournament"),
                    StartDate = 1000,
                    EndDate = 2000
                } 
            }
        ));

        var lambda = new RetrieveAllClubsWithTournamentsLambda(new LoggerObserver(), dataTable);

        // Act
        var results = await lambda.HandleAsync(_context);

        // Assert
        results.Should().NotBeNull();
        results.Should().HaveCount(1);
        
        var clubResult = results[0];
        clubResult.ClubName.Should().Be("Full Club");
        clubResult.Location.Should().Be("Full Location");
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
    public async Task WhenClubHasNoPromotionProfile_ReturnsClubWithoutHomepageAndItsTournaments()
    {
        // Arrange — a club that has tournaments but never submitted its club profile
        var dataTable = new FakeClubsAndTournamentsDataTable();

        dataTable.ClubsWithTournamentsToReturn.Add((
            new ClubListing
            {
                ClubName = "Unpromoted Club",
                Location = "Some Location"
            },
            new List<Tournament>
            {
                new Tournament
                {
                    TournamentName = "Orphan Tournament",
                    Location = "Some Location",
                    ClubName = "Unpromoted Club",
                    TournamentInfo = new System.Uri("https://info.example.com/flyer.pdf"),
                    StartDate = 1000,
                    EndDate = 2000
                }
            }
        ));

        var lambda = new RetrieveAllClubsWithTournamentsLambda(new LoggerObserver(), dataTable);

        // Act
        var results = await lambda.HandleAsync(_context);

        // Assert
        var clubResult = results.Should().ContainSingle().Subject;
        clubResult.ClubName.Should().Be("Unpromoted Club");
        clubResult.Location.Should().Be("Some Location");
        clubResult.Homepage.Should().BeNull();
        clubResult.Instagram.Should().BeNull();
        clubResult.Facebook.Should().BeNull();
        clubResult.Youtube.Should().BeNull();

        clubResult.Tournaments.Should().ContainSingle(t => t.TournamentName == "Orphan Tournament");
    }

    [Fact]
    public async Task WhenNoClubsWithActiveTournaments_ReturnsEmptyList()
    {
        // Arrange
        var dataTable = new FakeClubsAndTournamentsDataTable();
        var lambda = new RetrieveAllClubsWithTournamentsLambda(new LoggerObserver(), dataTable);

        // Act
        var results = await lambda.HandleAsync(_context);

        // Assert
        results.Should().BeEmpty();
    }

    [Fact]
    public async Task WhenDataStoreFails_ExceptionIsRethrown()
    {
        // Arrange
        var dataTable = new FakeClubsAndTournamentsDataTable
        {
            ThrowOnRetrieveAllClubsWithTournaments = true
        };
        var lambda = new RetrieveAllClubsWithTournamentsLambda(new LoggerObserver(), dataTable);

        // Act
        var act = async () => await lambda.HandleAsync(_context);

        // Assert
        await act.Should().ThrowAsync<System.Exception>()
            .WithMessage("Simulated data store failure for clubs with tournaments retrieval");
    }
}

using Amazon.Lambda.TestUtilities;
using FluentAssertions;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.ClubsAndTournaments.Lambdas.Tests;

public class RetrieveTournamentLambdaTests
{
    private readonly TestLambdaContext _context = new();

    [Fact]
    public async Task WhenRetrieveTournament_ReturnsTournament()
    {
        var dataTable = new FakeClubsAndTournamentsDataTable();
        dataTable.TournamentToReturn = new DataStore.Tournament 
        { 
            TournamentName = "Test Tournament",
            Location = "Test Location",
            ClubName = "Test Club",
            TournamentInfo = new System.Uri("https://testclub.com/tournament"),
            Instagram = new System.Uri("https://instagram.com/testtournament"),
            Facebook = new System.Uri("https://facebook.com/testtournament"),
            StartDate = 1000,
            EndDate = 2000
        };

        var lambda = new RetrieveTournamentLambda(new LoggerObserver(), dataTable);

        var result = await lambda.HandleAsync("Test Location", "Test Club", "Test Tournament", _context);

        result.Should().NotBeNull();
        result.Location.Should().Be("Test Location");
        result.ClubName.Should().Be("Test Club");
        result.TournamentName.Should().Be("Test Tournament");
        result.TournamentInfo.Should().Be(new System.Uri("https://testclub.com/tournament"));
        result.Instagram.Should().Be(new System.Uri("https://instagram.com/testtournament"));
        result.Facebook.Should().Be(new System.Uri("https://facebook.com/testtournament"));
        result.StartDate.Should().Be(1000);
        result.EndDate.Should().Be(2000);
    }

    [Fact]
    public async Task WhenTournamentNotFound_ThrowsKeyNotFoundException()
    {
        var dataTable = new FakeClubsAndTournamentsDataTable { ThrowOnRetrieveTournament = true };
        var lambda = new RetrieveTournamentLambda(new LoggerObserver(), dataTable);

        var act = async () => await lambda.HandleAsync("Test Location", "Test Club", "Test Tournament", _context);

        await act.Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task WhenDataStoreFails_ExceptionIsRethrown()
    {
        var dataTable = new FakeClubsAndTournamentsDataTable { ThrowRuntimeErrorOnRetrieveTournament = true };
        var lambda = new RetrieveTournamentLambda(new LoggerObserver(), dataTable);

        var act = async () => await lambda.HandleAsync("Test Location", "Test Club", "Test Tournament", _context);

        await act.Should().ThrowAsync<System.Exception>()
            .WithMessage("Simulated data store failure for tournament retrieval");
    }
}

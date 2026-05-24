using Amazon.Lambda.TestUtilities;
using FluentAssertions;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.ClubsAndTournaments.Lambdas.Tests;

public partial class RetrieveTournamentLambdaTests
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
            TournamentInfo = new System.Uri("https://testclub.com/tournament")
        };

        var lambda = new RetrieveTournamentLambda(new LoggerObserver(), dataTable);

        var result = await lambda.HandleAsync("Test Location", "Test Club", "Test Tournament", _context);

        result.Should().NotBeNull();
        result.TournamentName.Should().Be("Test Tournament");
    }

    [Fact]
    public async Task WhenTournamentNotFound_ThrowsKeyNotFoundException()
    {
        var dataTable = new FakeClubsAndTournamentsDataTable { ThrowOnRetrieveTournament = true };
        var lambda = new RetrieveTournamentLambda(new LoggerObserver(), dataTable);

        var act = async () => await lambda.HandleAsync("Test Location", "Test Club", "Test Tournament", _context);

        await act.Should().ThrowAsync<KeyNotFoundException>();
    }
}

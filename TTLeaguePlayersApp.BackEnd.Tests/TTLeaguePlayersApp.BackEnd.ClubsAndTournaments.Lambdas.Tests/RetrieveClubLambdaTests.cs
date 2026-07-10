using Amazon.Lambda.TestUtilities;
using FluentAssertions;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.ClubsAndTournaments.Lambdas.Tests;

public class RetrieveClubLambdaTests
{
    private readonly TestLambdaContext _context = new();

    [Fact]
    public async Task WhenRetrieveClub_ReturnsClub()
    {
        var dataTable = new FakeClubsAndTournamentsDataTable();
        dataTable.ClubToReturn = new DataStore.Club
        {
            Location = "Test Location",
            ClubName = "Test Club",
            Homepage = new System.Uri("https://testclub.com"),
            Instagram = new System.Uri("https://www.instagram.com/testclub"),
            Facebook = new System.Uri("https://www.facebook.com/testclub"),
            Youtube = new System.Uri("https://www.youtube.com/@testclub"),
        };

        var lambda = new RetrieveClubLambda(new LoggerObserver(), dataTable);

        var result = await lambda.HandleAsync("Test Location", "Test Club", _context);

        result.Should().NotBeNull();
        result.Location.Should().Be("Test Location");
        result.ClubName.Should().Be("Test Club");
        result.Homepage.Should().Be(new System.Uri("https://testclub.com"));
        result.Instagram.Should().Be(new System.Uri("https://www.instagram.com/testclub"));
        result.Facebook.Should().Be(new System.Uri("https://www.facebook.com/testclub"));
        result.Youtube.Should().Be(new System.Uri("https://www.youtube.com/@testclub"));
    }

    [Fact]
    public async Task WhenClubNotFound_ThrowsKeyNotFoundException()
    {
        var dataTable = new FakeClubsAndTournamentsDataTable { ThrowOnRetrieveClub = true };
        var lambda = new RetrieveClubLambda(new LoggerObserver(), dataTable);

        var act = async () => await lambda.HandleAsync("Test Location", "Test Club", _context);

        await act.Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task WhenDataStoreFails_ExceptionIsRethrown()
    {
        var dataTable = new FakeClubsAndTournamentsDataTable { ThrowRuntimeErrorOnRetrieveClub = true };
        var lambda = new RetrieveClubLambda(new LoggerObserver(), dataTable);

        var act = async () => await lambda.HandleAsync("Test Location", "Test Club", _context);

        await act.Should().ThrowAsync<System.Exception>()
            .WithMessage("Simulated data store failure for club retrieval");
    }
}

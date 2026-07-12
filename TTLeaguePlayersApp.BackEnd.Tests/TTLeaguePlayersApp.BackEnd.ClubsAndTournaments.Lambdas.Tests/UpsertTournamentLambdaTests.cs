using Amazon.Lambda.TestUtilities;
using FluentAssertions;
using Xunit;
using TTLeaguePlayersApp.BackEnd.Tests;

namespace TTLeaguePlayersApp.BackEnd.ClubsAndTournaments.Lambdas.Tests;

public class UpsertTournamentLambdaTests
{
    private readonly TestLambdaContext _context = new();

    [Fact]
    public async Task WhenUserIsNotManager_LogSecurityValidationExceptionAndContinue()
    {
        var dataTable = new FakeClubsAndTournamentsDataTable();
        var observer = new SpyLoggerObserver();
        var lambda = new UpsertTournamentLambda(observer, dataTable);
        
        var request = new UpsertTournamentRequest { TournamentInfo = "https://example.com" };
        var claims = new Dictionary<string, string>();

        var result = await lambda.HandleAsync("Test Location", "Test Club", "Test Tournament", request, claims, _context);

        observer.SecurityErrors.Should().ContainSingle().Which.Should().BeOfType<SecurityValidationException>();
        dataTable.UpsertedTournaments.Should().HaveCount(1);
        result.Should().NotBeNull();
        result.TournamentName.Should().Be("Test Tournament");
    }

    [Fact]
    public async Task WhenClaimsAreMalformed_LogsSecurityValidationExceptionAndContinues()
    {
        var dataTable = new FakeClubsAndTournamentsDataTable();
        var observer = new SpyLoggerObserver();
        var lambda = new UpsertTournamentLambda(observer, dataTable);
        
        var request = new UpsertTournamentRequest { TournamentInfo = "https://example.com" };
        var claims = new Dictionary<string, string>
        {
            { "custom:managed_clubs", "INVALID_JSON" }
        };

        var result = await lambda.HandleAsync("Test Location", "Test Club", "Test Tournament", request, claims, _context);

        observer.SecurityErrors.Should().ContainSingle().Which.Should().BeOfType<SecurityValidationException>();
        dataTable.UpsertedTournaments.Should().HaveCount(1);
        result.Should().NotBeNull();
        result.TournamentName.Should().Be("Test Tournament");
    }

    [Fact]
    public async Task WhenUserIsNotManagerForThisClub_LogsSecurityValidationExceptionAndContinues()
    {
        var dataTable = new FakeClubsAndTournamentsDataTable();
        var observer = new SpyLoggerObserver();
        var lambda = new UpsertTournamentLambda(observer, dataTable);
        
        var request = new UpsertTournamentRequest { TournamentInfo = "https://example.com" };
        var claims = new Dictionary<string, string>
        {
            { "custom:managed_clubs", "[{\"ClubLocation\":\"Other Location\",\"ClubName\":\"Other Club\"}]" }
        };

        var result = await lambda.HandleAsync("Test Location", "Test Club", "Test Tournament", request, claims, _context);

        observer.SecurityErrors.Should().ContainSingle().Which.Should().BeOfType<SecurityValidationException>();
        dataTable.UpsertedTournaments.Should().HaveCount(1);
        result.Should().NotBeNull();
        result.TournamentName.Should().Be("Test Tournament");
    }

    [Theory]
    [InlineData("invalid_uri", null, null, "tournament_info must be a valid absolute URI")]
    [InlineData("https://example.com", "invalid_instagram", null, "instagram must be a valid absolute URI")]
    [InlineData("https://example.com", null, "invalid_facebook", "facebook must be a valid absolute URI")]
    public async Task WhenRequestIsInvalid_ThrowsValidationException(string info, string? instagram, string? facebook, string expectedErrorSubstring)
    {
        var dataTable = new FakeClubsAndTournamentsDataTable();
        var lambda = new UpsertTournamentLambda(new LoggerObserver(), dataTable);
        
        var request = new UpsertTournamentRequest { TournamentInfo = info, Instagram = instagram, Facebook = facebook };
        var claims = new Dictionary<string, string>
        {
            { "custom:managed_clubs", "[{\"ClubLocation\":\"Test Location\",\"ClubName\":\"Test Club\"}]" }
        };

        var act = async () => await lambda.HandleAsync("Test Location", "Test Club", "Test Tournament", request, claims, _context);

        var exception = await act.Should().ThrowAsync<ValidationException>();
        exception.Which.Errors.Should().Contain(e => e.Contains(expectedErrorSubstring));
        dataTable.UpsertedTournaments.Should().BeEmpty();
    }

    [Fact]
    public async Task WhenRequestIsValid_UpsertsTournament()
    {
        var dataTable = new FakeClubsAndTournamentsDataTable();
        var lambda = new UpsertTournamentLambda(new LoggerObserver(), dataTable);
        
        var request = new UpsertTournamentRequest { 
            TournamentInfo = "https://example.com", 
            Facebook = "https://facebook.com/tournament",
            StartDate = 1735689600,
            EndDate = 1735776000
        };
        var claims = new Dictionary<string, string>
        {
            { "custom:managed_clubs", "[{\"ClubLocation\":\"Test Location\",\"ClubName\":\"Test Club\"}]" }
        };

        var result = await lambda.HandleAsync("Test Location", "Test Club", "Test Tournament", request, claims, _context);

        result.Should().NotBeNull();
        result.Location.Should().Be("Test Location");
        result.ClubName.Should().Be("Test Club");
        result.TournamentName.Should().Be("Test Tournament");
        result.TournamentInfo.Should().NotBeNull();
        result.TournamentInfo.ToString().Should().Be("https://example.com/");
        result.Facebook.Should().NotBeNull();
        result.Facebook.ToString().Should().Be("https://facebook.com/tournament");
        result.StartDate.Should().Be(1735689600);
        result.EndDate.Should().Be(1735776000);
    }

    [Fact]
    public async Task WhenDataStoreFails_LogsRuntimeErrorAndThrows()
    {
        var dataTable = new FakeClubsAndTournamentsDataTable { ThrowOnUpsertTournament = true };
        var observer = new SpyLoggerObserver();
        var lambda = new UpsertTournamentLambda(observer, dataTable);
        
        var request = new UpsertTournamentRequest { TournamentInfo = "https://example.com" };
        var claims = new Dictionary<string, string>
        {
            { "custom:managed_clubs", "[{\"ClubLocation\":\"Test Location\",\"ClubName\":\"Test Club\"}]" }
        };

        var act = async () => await lambda.HandleAsync("Test Location", "Test Club", "Test Tournament", request, claims, _context);

        var exception = await act.Should().ThrowAsync<System.Exception>();
        exception.WithMessage("Simulated data store failure for tournament");

        observer.RuntimeErrors.Should().ContainSingle().Which.Should().BeSameAs(exception.Subject.First());
    }
}

using Amazon.Lambda.TestUtilities;
using FluentAssertions;
using Xunit;
using TTLeaguePlayersApp.BackEnd.Tests;


namespace TTLeaguePlayersApp.BackEnd.ClubsAndTournaments.Lambdas.Tests;

public class UpsertClubLambdaTests
{
    private readonly TestLambdaContext _context = new();

    [Fact]
    public async Task WhenUserIsNotManager_LogSecurityValidationExceptionAndContinue()
    {
        var dataTable = new FakeClubsAndTournamentsDataTable();
        var observer = new SpyLoggerObserver();
        var lambda = new UpsertClubLambda(observer, dataTable);
        
        var request = new UpsertClubRequest { Homepage = "https://example.com" };
        var claims = new Dictionary<string, string>();

        var result = await lambda.HandleAsync("Test Location", "Test Club", request, claims, _context);

        observer.SecurityErrors.Should().ContainSingle().Which.Should().BeOfType<SecurityValidationException>();
        dataTable.UpsertedClubs.Should().HaveCount(1);
        result.Should().NotBeNull();
        result.Location.Should().Be("Test Location");
        result.ClubName.Should().Be("Test Club");
    }

    [Fact]
    public async Task WhenClaimsAreMalformed_LogsSecurityValidationExceptionAndContinues()
    {
        var dataTable = new FakeClubsAndTournamentsDataTable();
        var observer = new SpyLoggerObserver();
        var lambda = new UpsertClubLambda(observer, dataTable);
        
        var request = new UpsertClubRequest { Homepage = "https://example.com" };
        var claims = new Dictionary<string, string>
        {
            { "custom:managed_clubs", "INVALID_JSON" }
        };

        var result = await lambda.HandleAsync("Test Location", "Test Club", request, claims, _context);

        observer.SecurityErrors.Should().ContainSingle().Which.Should().BeOfType<SecurityValidationException>();
        dataTable.UpsertedClubs.Should().HaveCount(1);
        result.Should().NotBeNull();
        result.Location.Should().Be("Test Location");
        result.ClubName.Should().Be("Test Club");
    }

    [Fact]
    public async Task WhenUserIsNotManagerForThisClub_LogsSecurityValidationExceptionAndContinues()
    {
        var dataTable = new FakeClubsAndTournamentsDataTable();
        var observer = new SpyLoggerObserver();
        var lambda = new UpsertClubLambda(observer, dataTable);
        
        var request = new UpsertClubRequest { Homepage = "https://example.com" };
        var claims = new Dictionary<string, string>
        {
            { "custom:managed_clubs", "[{\"ClubLocation\":\"Other Location\",\"ClubName\":\"Other Club\"}]" }
        };

        var result = await lambda.HandleAsync("Test Location", "Test Club", request, claims, _context);

        observer.SecurityErrors.Should().ContainSingle().Which.Should().BeOfType<SecurityValidationException>();
        dataTable.UpsertedClubs.Should().HaveCount(1);
        result.Should().NotBeNull();
        result.Location.Should().Be("Test Location");
        result.ClubName.Should().Be("Test Club");
    }

    [Theory]
    [InlineData("invalid_uri", null, null, null, "homepage must be a valid absolute URI")]
    [InlineData("https://example.com", "invalid_instagram", null, null, "instagram must be a valid absolute URI")]
    [InlineData("https://example.com", null, "invalid_facebook", null, "facebook must be a valid absolute URI")]
    [InlineData("https://example.com", null, null, "invalid_youtube", "youtube must be a valid absolute URI")]
    public async Task WhenRequestIsInvalid_ThrowsValidationException(string homepage, string? instagram, string? facebook, string? youtube, string expectedErrorSubstring)
    {
        var dataTable = new FakeClubsAndTournamentsDataTable();
        var lambda = new UpsertClubLambda(new LoggerObserver(), dataTable);
        
        var request = new UpsertClubRequest { Homepage = homepage, Instagram = instagram, Facebook = facebook, Youtube = youtube };
        var claims = new Dictionary<string, string>
        {
            { "custom:managed_clubs", "[{\"ClubLocation\":\"Test Location\",\"ClubName\":\"Test Club\"}]" }
        };

        var act = async () => await lambda.HandleAsync("Test Location", "Test Club", request, claims, _context);

        var exception = await act.Should().ThrowAsync<ValidationException>();
        exception.Which.Errors.Should().Contain(e => e.Contains(expectedErrorSubstring));
        dataTable.UpsertedClubs.Should().BeEmpty();
    }

    [Fact]
    public async Task WhenRequestIsValid_UpsertsClub()
    {
        var dataTable = new FakeClubsAndTournamentsDataTable();
        var lambda = new UpsertClubLambda(new LoggerObserver(), dataTable);
        
        var request = new UpsertClubRequest { Homepage = "https://example.com", Facebook = "https://facebook.com/club" };
        var claims = new Dictionary<string, string>
        {
            { "custom:managed_clubs", "[{\"ClubLocation\":\"Test Location\",\"ClubName\":\"Test Club\"}]" }
        };

        var result = await lambda.HandleAsync("Test Location", "Test Club", request, claims, _context);

        dataTable.UpsertedClubs.Should().ContainSingle(c => c.Location == "Test Location" && c.ClubName == "Test Club" && c.Homepage != null && c.Homepage.ToString() == "https://example.com/" && c.Facebook != null && c.Facebook.ToString() == "https://facebook.com/club");
        
        result.Should().NotBeNull();
        result.Location.Should().Be("Test Location");
        result.ClubName.Should().Be("Test Club");
        result.Homepage.ToString().Should().Be("https://example.com/");
        result.Facebook.ToString().Should().Be("https://facebook.com/club");
    }

    [Fact]
    public async Task WhenDataStoreFails_LogsRuntimeErrorAndThrows()
    {
        var dataTable = new FakeClubsAndTournamentsDataTable { ThrowOnUpsertClub = true };
        var observer = new SpyLoggerObserver();
        var lambda = new UpsertClubLambda(observer, dataTable);
        
        var request = new UpsertClubRequest { Homepage = "https://example.com" };
        var claims = new Dictionary<string, string>
        {
            { "custom:managed_clubs", "[{\"ClubLocation\":\"Test Location\",\"ClubName\":\"Test Club\"}]" }
        };

        var act = async () => await lambda.HandleAsync("Test Location", "Test Club", request, claims, _context);

        var exception = await act.Should().ThrowAsync<System.Exception>();
        exception.WithMessage("Simulated data store failure for club");

        observer.RuntimeErrors.Should().ContainSingle().Which.Should().BeSameAs(exception.Subject.First());
    }
}

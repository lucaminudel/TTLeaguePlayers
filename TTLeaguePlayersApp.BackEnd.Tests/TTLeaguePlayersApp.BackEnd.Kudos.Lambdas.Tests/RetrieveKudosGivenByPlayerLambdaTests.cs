using Amazon.Lambda.TestUtilities;
using FluentAssertions;
using TTLeaguePlayersApp.BackEnd.Tests;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.Kudos.Lambdas.Tests;

public class RetrieveKudosGivenByPlayerLambdaTests
{
    private readonly TestLambdaContext _context = new();

    [Fact]
    public async Task WhenUserSubDoesNotMatchGiverPersonSub_LogsSecurityValidationExceptionAndContinues()
    {
        // Arrange
        var request = new RetrieveKudosGivenByPlayerRequest
        {
            League = "CLTTL",
            Season = "2025-2026",
            TeamDivision = "Division 4",
            TeamName = "Morpeth 10",
            GiverPersonSub = "user-123"
        };

        var claims = new Dictionary<string, string>
        {
            { "sub", "different-user-456" },
            { "custom:active_seasons", "[]" }
        };

        var observer = new SpyLoggerObserver();
        var fakeDataTable = new FakeKudosDataTable();
        fakeDataTable.KudosToReturn = new List<DataStore.Kudos>();

        var lambda = new RetrieveKudosGivenByPlayerLambda(observer, fakeDataTable);

        // Act
        var act = async () => await lambda.HandleAsync(request, claims, _context);

        // Assert
        await act.Should().NotThrowAsync<SecurityValidationException>();
        observer.SecurityErrors.Should().ContainSingle().Which.Should().BeOfType<SecurityValidationException>();
        fakeDataTable.LastRetrieveKudosGivenByPlayerRequest.Should().NotBeNull();
        fakeDataTable.LastRetrieveKudosGivenByPlayerRequest!.GiverPersonSub.Should().Be(request.GiverPersonSub);
    }

    [Fact]
    public async Task WhenActiveSeasonsDoNotContainTeam_LogsSecurityValidationExceptionAndContinues()
    {
        // Arrange
        var request = new RetrieveKudosGivenByPlayerRequest
        {
            League = "CLTTL",
            Season = "2025-2026",
            TeamDivision = "Division 4",
            TeamName = "Morpeth 10",
            GiverPersonSub = "user-123"
        };

        var claims = new Dictionary<string, string>
        {
            { "sub", "user-123" },
            { "custom:active_seasons", "[{\"League\":\"OTHER\",\"Season\":\"2025-2026\",\"TeamDivision\":\"Division 4\",\"TeamName\":\"Other Team\",\"PersonName\":\"Luca Minudel\",\"Role\":\"PLAYER\",\"LatestKudos\":[]}]" }
        };

        var observer = new SpyLoggerObserver();
        var fakeDataTable = new FakeKudosDataTable();
        fakeDataTable.KudosToReturn = new List<DataStore.Kudos>();

        var lambda = new RetrieveKudosGivenByPlayerLambda(observer, fakeDataTable);

        // Act
        var act = async () => await lambda.HandleAsync(request, claims, _context);

        // Assert
        await act.Should().NotThrowAsync<SecurityValidationException>();
        observer.SecurityErrors.Should().ContainSingle().Which.Should().BeOfType<SecurityValidationException>();
        fakeDataTable.LastRetrieveKudosGivenByPlayerRequest.Should().NotBeNull();
        fakeDataTable.LastRetrieveKudosGivenByPlayerRequest!.TeamName.Should().Be(request.TeamName);
    }

    [Fact]
    public async Task WhenRetrieveKudosGivenByPlayerAsyncThrows_LogsRuntimeErrorAndRethrows()
    {
        // Arrange
        var request = new RetrieveKudosGivenByPlayerRequest
        {
            League = "CLTTL",
            Season = "2025-2026",
            TeamDivision = "Division 4",
            TeamName = "Morpeth 10",
            GiverPersonSub = "user-123"
        };

        var claims = new Dictionary<string, string>
        {
            { "sub", "user-123" },
            { "custom:active_seasons", "[{\"League\":\"CLTTL\",\"Season\":\"2025-2026\",\"TeamDivision\":\"Division 4\",\"TeamName\":\"Morpeth 10\",\"PersonName\":\"Luca Minudel\",\"Role\":\"PLAYER\",\"LatestKudos\":[]}]" }
        };

        var observer = new SpyLoggerObserver();
        var fakeDataTable = new FakeKudosDataTable { ThrowOnRetrieveKudosGivenByPlayer = true };

        var lambda = new RetrieveKudosGivenByPlayerLambda(observer, fakeDataTable);

        // Act
        var act = async () => await lambda.HandleAsync(request, claims, _context);

        // Assert
        await act.Should().ThrowAsync<System.Exception>()
            .WithMessage("Simulated data store failure for kudos retrieval");
        observer.RuntimeErrors.Should().ContainSingle().Which.Message.Should().Be("Simulated data store failure for kudos retrieval");
        fakeDataTable.LastRetrieveKudosGivenByPlayerRequest.Should().NotBeNull();
        fakeDataTable.LastRetrieveKudosGivenByPlayerRequest!.GiverPersonSub.Should().Be(request.GiverPersonSub);
    }
}

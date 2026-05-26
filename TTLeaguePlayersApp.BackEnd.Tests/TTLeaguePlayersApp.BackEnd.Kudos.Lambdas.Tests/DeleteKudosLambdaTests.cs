using Amazon.Lambda.TestUtilities;
using FluentAssertions;
using Xunit;
using TTLeaguePlayersApp.BackEnd.Tests;

namespace TTLeaguePlayersApp.BackEnd.Kudos.Lambdas.Tests;

public class DeleteKudosLambdaTests
{
    private readonly TestLambdaContext _context = new();

    [Fact]
    public async Task WhenUserSubDoesNotMatchGiverPersonSub_LogsSecurityValidationExceptionAndContinues()
    {
        // Arrange
        var deletedRequests = new FakeKudosDataTable();
        var observer = new SpyLoggerObserver();
        var lambda = new DeleteKudosLambda(observer, deletedRequests);

        var request = new DeleteKudosRequest
        {
            League = "CLTTL",
            Season = "2025-2026",
            Division = "Division 4",
            ReceivingTeam = "Morpeth 9",
            HomeTeam = "Morpeth 10",
            AwayTeam = "Morpeth 9",
            GiverPersonSub = "user-123"
        };

        var claims = new Dictionary<string, string>
        {
            { "sub", "different-user-456" }
        };

        // Act
        var act = async () => await lambda.HandleAsync(request, claims, _context);

        // Assert
        await act.Should().NotThrowAsync<SecurityValidationException>();
        observer.SecurityErrors.Should().ContainSingle().Which.Should().BeOfType<SecurityValidationException>();
        deletedRequests.DeletedKudos.Should().ContainSingle(d => d.GiverPersonSub == request.GiverPersonSub && d.League == request.League);
    }

    [Fact]
    public async Task WhenUserSubIsMissing_LogsSecurityValidationExceptionAndContinues()
    {
        // Arrange
        var deletedRequests = new FakeKudosDataTable();
        var observer = new SpyLoggerObserver();
        var lambda = new DeleteKudosLambda(observer, deletedRequests);

        var request = new DeleteKudosRequest
        {
            League = "CLTTL",
            Season = "2025-2026",
            Division = "Division 4",
            ReceivingTeam = "Morpeth 9",
            HomeTeam = "Morpeth 10",
            AwayTeam = "Morpeth 9",
            GiverPersonSub = "user-123"
        };

        var claims = new Dictionary<string, string>();

        // Act
        var act = async () => await lambda.HandleAsync(request, claims, _context);

        // Assert
        await act.Should().NotThrowAsync<SecurityValidationException>();
        observer.SecurityErrors.Should().ContainSingle().Which.Should().BeOfType<SecurityValidationException>();
        deletedRequests.DeletedKudos.Should().ContainSingle(d => d.GiverPersonSub == request.GiverPersonSub && d.League == request.League);
    }

    [Fact]
    public async Task WhenCustomActiveSeasonsClaimIsMissing_LogsSecurityValidationExceptionAndContinues()
    {
        // Arrange
        var deletedRequests = new FakeKudosDataTable();
        var observer = new SpyLoggerObserver();
        var lambda = new DeleteKudosLambda(observer, deletedRequests);

        var request = new DeleteKudosRequest
        {
            League = "CLTTL",
            Season = "2025-2026",
            Division = "Division 4",
            ReceivingTeam = "Morpeth 9",
            HomeTeam = "Morpeth 10",
            AwayTeam = "Morpeth 9",
            GiverPersonSub = "user-123"
        };

        var claims = new Dictionary<string, string>
        {
            { "sub", "user-123" }
        };

        // Act
        var act = async () => await lambda.HandleAsync(request, claims, _context);

        // Assert
        await act.Should().NotThrowAsync<SecurityValidationException>();
        observer.SecurityErrors.Should().ContainSingle().Which.Should().BeOfType<SecurityValidationException>();
        deletedRequests.DeletedKudos.Should().ContainSingle(d => d.GiverPersonSub == request.GiverPersonSub && d.League == request.League);
    }

    [Fact]
    public async Task WhenCustomActiveSeasonsClaimIsMalformed_LogsSecurityValidationExceptionAndContinues()
    {
        // Arrange
        var deletedRequests = new FakeKudosDataTable();
        var observer = new SpyLoggerObserver();
        var lambda = new DeleteKudosLambda(observer, deletedRequests);

        var request = new DeleteKudosRequest
        {
            League = "CLTTL",
            Season = "2025-2026",
            Division = "Division 4",
            ReceivingTeam = "Morpeth 9",
            HomeTeam = "Morpeth 10",
            AwayTeam = "Morpeth 9",
            GiverPersonSub = "user-123"
        };

        var claims = new Dictionary<string, string>
        {
            { "sub", "user-123" },
            { "custom:active_seasons", "INVALID_JSON" }
        };

        // Act
        var act = async () => await lambda.HandleAsync(request, claims, _context);

        // Assert
        await act.Should().NotThrowAsync<SecurityValidationException>();
        observer.SecurityErrors.Should().ContainSingle().Which.Should().BeOfType<SecurityValidationException>();
        deletedRequests.DeletedKudos.Should().ContainSingle(d => d.GiverPersonSub == request.GiverPersonSub && d.League == request.League);
    }
}

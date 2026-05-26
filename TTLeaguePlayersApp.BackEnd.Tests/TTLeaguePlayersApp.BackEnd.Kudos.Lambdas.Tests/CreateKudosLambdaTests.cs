using Amazon.Lambda.TestUtilities;
using FluentAssertions;
using System.Text.Json;
using TTLeaguePlayersApp.BackEnd.Cognito;
using TTLeaguePlayersApp.BackEnd.Tests;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.Kudos.Lambdas.Tests;

public class CreateKudosLambdaTests
{
    private readonly TestLambdaContext _context = new();

    [Fact]
    public async Task HandleAsync_UpdatesCognitoActiveSeasonsWithLatestKudoDate()
    {
        // Arrange
        var giverSub = "user-123";
        var league = "CLTTL";
        var season = "2025-2026";
        var division = "Division 4";
        var teamName = "Morpeth 10";
        var personName = "Luca Minudel";
        var matchDate = 1735689600L;

        var request = new CreateKudosRequest
        {
            League = league,
            Season = season,
            Division = division,
            ReceivingTeam = "Morpeth 9",
            HomeTeam = teamName,
            AwayTeam = "Morpeth 9",
            MatchDateTime = matchDate,
            GiverTeam = teamName,
            GiverPersonName = personName,
            GiverPersonSub = giverSub,
            KudosValue = 1
        };

        var initialActiveSeasons = new List<ActiveSeason>
        {
            new ActiveSeason
            {
                League = league,
                Season = season,
                TeamDivision = division,
                TeamName = teamName,
                PersonName = personName,
                Role = "PLAYER",
                LatestKudos = new List<long>()
            }
        };

        var userClaims = new Dictionary<string, string>
        {
            { "sub", giverSub },
            { "custom:active_seasons", JsonSerializer.Serialize(initialActiveSeasons) }
        };

        var fakeDataTable = new FakeKudosDataTable();
        var fakeCognito = new FakeCognitoClient();
        
        var cognitoUsers = new CognitoUsers(fakeCognito, "pool-id");
        var lambda = new CreateKudosLambda(new LoggerObserver(), fakeDataTable, cognitoUsers);

        // Act
        await lambda.HandleAsync(request, userClaims, _context);

        // Assert
        fakeDataTable.SavedKudos.Should().HaveCount(1);
        fakeDataTable.SavedKudos[0].MatchDateTime.Should().Be(matchDate);

        fakeCognito.AdminUpdateUserAttributesCalls.Should().Be(1);
        var updateRequest = fakeCognito.LastAdminUpdateUserAttributesRequest;
        updateRequest.Should().NotBeNull();
        
        var seasonsJson = updateRequest!.UserAttributes.First(a => a.Name == "custom:active_seasons").Value;
        var updatedSeasons = JsonSerializer.Deserialize<List<ActiveSeason>>(seasonsJson);
        
        updatedSeasons.Should().NotBeNull();
        var targetSeason = updatedSeasons!.First(s => s.League == league && s.Season == season);
        targetSeason.LatestKudos.Should().Contain(matchDate);
    }

    [Fact]
    public async Task HandleAsync_KeepsOnlyTwoLatestKudosDatesInCognito()
    {
        // Arrange
        var giverSub = "user-123";
        var league = "CLTTL";
        var season = "2025-2026";
        var division = "Division 4";
        var teamName = "Morpeth 10";
        var personName = "Luca Minudel";

        // Initial dates: some old, some more recent. But the logic always adds the new one.
        // If we already have 2, and we add 1, it should keep the 2 largest including the new one.
        var initialActiveSeasons = new List<ActiveSeason>
        {
            new ActiveSeason
            {
                League = league,
                Season = season,
                TeamDivision = division,
                TeamName = teamName,
                PersonName = personName,
                Role = "PLAYER",
                LatestKudos = new List<long> { 1000L, 3000L } // Already have two
            }
        };

        var userClaims = new Dictionary<string, string>
        {
            { "sub", giverSub },
            { "custom:active_seasons", JsonSerializer.Serialize(initialActiveSeasons) }
        };

        var request = new CreateKudosRequest
        {
            League = league,
            Season = season,
            Division = division,
            ReceivingTeam = "Morpeth 9",
            HomeTeam = teamName,
            AwayTeam = "Morpeth 9",
            MatchDateTime = 2000L, // New date between existing ones
            GiverTeam = teamName,
            GiverPersonName = personName,
            GiverPersonSub = giverSub,
            KudosValue = 1
        };

        var fakeDataTable = new FakeKudosDataTable();
        var fakeCognito = new FakeCognitoClient();
        
        var cognitoUsers = new CognitoUsers(fakeCognito, "pool-id");
        var lambda = new CreateKudosLambda(new LoggerObserver(), fakeDataTable, cognitoUsers);

        // Act
        await lambda.HandleAsync(request, userClaims, _context);

        // Assert
        var updateRequest = fakeCognito.LastAdminUpdateUserAttributesRequest;
        updateRequest.Should().NotBeNull();
        
        var seasonsJson = updateRequest!.UserAttributes.First(a => a.Name == "custom:active_seasons").Value;
        var updatedSeasons = JsonSerializer.Deserialize<List<ActiveSeason>>(seasonsJson);
        
        var targetSeason = updatedSeasons!.First(s => s.League == league && s.Season == season);
        
        // Should keep 2000 and 3000 (the two latest), and they should be sorted (1000 dropped)
        targetSeason.LatestKudos.Should().HaveCount(2);
        targetSeason.LatestKudos[0].Should().Be(2000L);
        targetSeason.LatestKudos[1].Should().Be(3000L);
    }

    [Fact]
    public async Task HandleAsync_WhenActiveSeasonsDoNotMatchGiverDetails_LogsSecurityValidationExceptionAndContinues()
    {
        // Arrange
        var giverSub = "user-123";
        var league = "CLTTL";
        var season = "2025-2026";
        var division = "Division 4";
        var teamName = "Morpeth 10";
        var requestPersonName = "Luca Minudel";
        var claimsPersonName = "Some Other Player";

        var initialActiveSeasons = new List<ActiveSeason>
        {
            new ActiveSeason
            {
                League = league,
                Season = season,
                TeamDivision = division,
                TeamName = teamName,
                PersonName = claimsPersonName,
                Role = "PLAYER",
                LatestKudos = new List<long>()
            }
        };

        var userClaims = new Dictionary<string, string>
        {
            { "sub", giverSub },
            { "custom:active_seasons", JsonSerializer.Serialize(initialActiveSeasons) }
        };

        var request = new CreateKudosRequest
        {
            League = league,
            Season = season,
            Division = division,
            ReceivingTeam = "Morpeth 9",
            HomeTeam = teamName,
            AwayTeam = "Morpeth 9",
            MatchDateTime = 2000L,
            GiverTeam = teamName,
            GiverPersonName = requestPersonName,
            GiverPersonSub = giverSub,
            KudosValue = 1
        };

        var observer = new SpyLoggerObserver();
        var fakeDataTable = new FakeKudosDataTable();
        var fakeCognito = new FakeCognitoClient();
        var cognitoUsers = new CognitoUsers(fakeCognito, "pool-id");
        var lambda = new CreateKudosLambda(observer, fakeDataTable, cognitoUsers);

        // Act
        var act = async () => await lambda.HandleAsync(request, userClaims, _context);

        // Assert
        await act.Should().NotThrowAsync<SecurityValidationException>();
        observer.SecurityErrors.Should().ContainSingle().Which.Should().BeOfType<SecurityValidationException>();
        fakeDataTable.SavedKudos.Should().HaveCount(1);
        fakeCognito.AdminUpdateUserAttributesCalls.Should().Be(1);
    }

    [Fact]
    public async Task HandleAsync_WhenUserSubDoesNotMatchGiverPersonSub_LogsSecurityValidationExceptionAndContinues()
    {
        // Arrange
        var giverSub = "user-123";
        var tokenSub = "different-user-456";
        var league = "CLTTL";
        var season = "2025-2026";
        var division = "Division 4";
        var teamName = "Morpeth 10";
        var personName = "Luca Minudel";

        var initialActiveSeasons = new List<ActiveSeason>
        {
            new ActiveSeason
            {
                League = league,
                Season = season,
                TeamDivision = division,
                TeamName = teamName,
                PersonName = personName,
                Role = "PLAYER",
                LatestKudos = new List<long>()
            }
        };

        var userClaims = new Dictionary<string, string>
        {
            { "sub", tokenSub },
            { "custom:active_seasons", JsonSerializer.Serialize(initialActiveSeasons) }
        };

        var request = new CreateKudosRequest
        {
            League = league,
            Season = season,
            Division = division,
            ReceivingTeam = "Morpeth 9",
            HomeTeam = teamName,
            AwayTeam = "Morpeth 9",
            MatchDateTime = 2000L,
            GiverTeam = teamName,
            GiverPersonName = personName,
            GiverPersonSub = giverSub,
            KudosValue = 1
        };

        var observer = new SpyLoggerObserver();
        var fakeDataTable = new FakeKudosDataTable();
        var fakeCognito = new FakeCognitoClient();
        var cognitoUsers = new CognitoUsers(fakeCognito, "pool-id");
        var lambda = new CreateKudosLambda(observer, fakeDataTable, cognitoUsers);

        // Act
        var act = async () => await lambda.HandleAsync(request, userClaims, _context);

        // Assert
        await act.Should().NotThrowAsync<SecurityValidationException>();
        observer.SecurityErrors.Should().ContainSingle().Which.Should().BeOfType<SecurityValidationException>();
        fakeDataTable.SavedKudos.Should().HaveCount(1);
        fakeCognito.AdminUpdateUserAttributesCalls.Should().Be(1);
    }

    [Fact]
    public async Task HandleAsync_WhenCustomActiveSeasonsClaimIsMissing_LogsSecurityValidationExceptionAndThenThrowInvalidOperationException()
    {
        // Arrange
        var giverSub = "user-123";
        var league = "CLTTL";
        var season = "2025-2026";
        var division = "Division 4";
        var teamName = "Morpeth 10";
        var personName = "Luca Minudel";

        var userClaims = new Dictionary<string, string>
        {
            { "sub", giverSub }
        };

        var request = new CreateKudosRequest
        {
            League = league,
            Season = season,
            Division = division,
            ReceivingTeam = "Morpeth 9",
            HomeTeam = teamName,
            AwayTeam = "Morpeth 9",
            MatchDateTime = 2000L,
            GiverTeam = teamName,
            GiverPersonName = personName,
            GiverPersonSub = giverSub,
            KudosValue = 1
        };

        var observer = new SpyLoggerObserver();
        var fakeDataTable = new FakeKudosDataTable();
        var fakeCognito = new FakeCognitoClient();
        var cognitoUsers = new CognitoUsers(fakeCognito, "pool-id");
        var lambda = new CreateKudosLambda(observer, fakeDataTable, cognitoUsers);

        // Act
        var act = async () => await lambda.HandleAsync(request, userClaims, _context);

        // Assert
        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*custom:active_seasons*");
        observer.SecurityErrors.Should().ContainSingle().Which.Should().BeOfType<SecurityValidationException>();
        observer.RuntimeErrors.Should().ContainSingle().Which.Should().BeOfType<InvalidOperationException>();
        fakeDataTable.SavedKudos.Should().HaveCount(0);
        fakeCognito.AdminUpdateUserAttributesCalls.Should().Be(0);
    }

    [Fact]
    public async Task HandleAsync_WhenCustomActiveSeasonsClaimIsMalformed_LogsSecurityValidationExceptionAndThenThrowInvalidOperationException()
    {
        // Arrange
        var giverSub = "user-123";
        var league = "CLTTL";
        var season = "2025-2026";
        var division = "Division 4";
        var teamName = "Morpeth 10";
        var personName = "Luca Minudel";

        var userClaims = new Dictionary<string, string>
        {
            { "sub", giverSub },
            { "custom:active_seasons", "INVALID_JSON" }
        };

        var request = new CreateKudosRequest
        {
            League = league,
            Season = season,
            Division = division,
            ReceivingTeam = "Morpeth 9",
            HomeTeam = teamName,
            AwayTeam = "Morpeth 9",
            MatchDateTime = 2000L,
            GiverTeam = teamName,
            GiverPersonName = personName,
            GiverPersonSub = giverSub,
            KudosValue = 1
        };

        var observer = new SpyLoggerObserver();
        var fakeDataTable = new FakeKudosDataTable();
        var fakeCognito = new FakeCognitoClient();
        var cognitoUsers = new CognitoUsers(fakeCognito, "pool-id");
        var lambda = new CreateKudosLambda(observer, fakeDataTable, cognitoUsers);

        // Act
        var act = async () => await lambda.HandleAsync(request, userClaims, _context);

        // Assert
        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*Failed to deserialize custom:active_seasons claim.*");
        observer.SecurityErrors.Should().ContainSingle().Which.Should().BeOfType<SecurityValidationException>();
        observer.RuntimeErrors.Should().ContainSingle().Which.Should().BeOfType<InvalidOperationException>();
        fakeDataTable.SavedKudos.Should().HaveCount(0);
        fakeCognito.AdminUpdateUserAttributesCalls.Should().Be(0);
    }

    [Fact]
    public async Task HandleAsync_WhenUserSubIsMissing_LogsSecurityValidationExceptionAndContinues()
    {
        // Arrange
        var giverSub = "user-123";
        var league = "CLTTL";
        var season = "2025-2026";
        var division = "Division 4";
        var teamName = "Morpeth 10";
        var personName = "Luca Minudel";

        var initialActiveSeasons = new List<ActiveSeason>
        {
            new ActiveSeason
            {
                League = league,
                Season = season,
                TeamDivision = division,
                TeamName = teamName,
                PersonName = personName,
                Role = "PLAYER",
                LatestKudos = new List<long>()
            }
        };

        var userClaims = new Dictionary<string, string>
        {
            { "custom:active_seasons", JsonSerializer.Serialize(initialActiveSeasons) }
        };

        var request = new CreateKudosRequest
        {
            League = league,
            Season = season,
            Division = division,
            ReceivingTeam = "Morpeth 9",
            HomeTeam = teamName,
            AwayTeam = "Morpeth 9",
            MatchDateTime = 2000L,
            GiverTeam = teamName,
            GiverPersonName = personName,
            GiverPersonSub = giverSub,
            KudosValue = 1
        };

        var observer = new SpyLoggerObserver();
        var fakeDataTable = new FakeKudosDataTable();
        var fakeCognito = new FakeCognitoClient();
        var cognitoUsers = new CognitoUsers(fakeCognito, "pool-id");
        var lambda = new CreateKudosLambda(observer, fakeDataTable, cognitoUsers);

        // Act
        var act = async () => await lambda.HandleAsync(request, userClaims, _context);

        // Assert
        await act.Should().NotThrowAsync<SecurityValidationException>();
        observer.SecurityErrors.Should().ContainSingle().Which.Should().BeOfType<SecurityValidationException>();
        observer.RuntimeErrors.Should().BeEmpty();
        fakeDataTable.SavedKudos.Should().HaveCount(1);
        fakeCognito.AdminUpdateUserAttributesCalls.Should().Be(1);
    }

    [Fact]
    public async Task HandleAsync_WhenSaveKudosFails_LogsRuntimeErrorAndThrows()
    {
        // Arrange
        var giverSub = "user-123";
        var league = "CLTTL";
        var season = "2025-2026";
        var division = "Division 4";
        var teamName = "Morpeth 10";
        var personName = "Luca Minudel";

        var initialActiveSeasons = new List<ActiveSeason>
        {
            new ActiveSeason
            {
                League = league,
                Season = season,
                TeamDivision = division,
                TeamName = teamName,
                PersonName = personName,
                Role = "PLAYER",
                LatestKudos = new List<long>()
            }
        };

        var userClaims = new Dictionary<string, string>
        {
            { "sub", giverSub },
            { "custom:active_seasons", JsonSerializer.Serialize(initialActiveSeasons) }
        };

        var request = new CreateKudosRequest
        {
            League = league,
            Season = season,
            Division = division,
            ReceivingTeam = "Morpeth 9",
            HomeTeam = teamName,
            AwayTeam = "Morpeth 9",
            MatchDateTime = 2000L,
            GiverTeam = teamName,
            GiverPersonName = personName,
            GiverPersonSub = giverSub,
            KudosValue = 1
        };

        var observer = new SpyLoggerObserver();
        var fakeDataTable = new FakeKudosDataTable { ThrowOnSaveKudos = true };
        var fakeCognito = new FakeCognitoClient();
        var cognitoUsers = new CognitoUsers(fakeCognito, "pool-id");
        var lambda = new CreateKudosLambda(observer, fakeDataTable, cognitoUsers);

        // Act
        var act = async () => await lambda.HandleAsync(request, userClaims, _context);

        // Assert
        var exception = await act.Should().ThrowAsync<System.Exception>();
        exception.WithMessage("Simulated data store failure for kudos save");
        observer.RuntimeErrors.Should().ContainSingle().Which.Message.Should().Be("Simulated data store failure for kudos save");
        fakeCognito.AdminUpdateUserAttributesCalls.Should().Be(0);
    }

    [Fact]
    public async Task HandleAsync_WhenCognitoUpdateFails_LogsRuntimeErrorAndThrows()
    {
        // Arrange
        var giverSub = "user-123";
        var league = "CLTTL";
        var season = "2025-2026";
        var division = "Division 4";
        var teamName = "Morpeth 10";
        var personName = "Luca Minudel";

        var initialActiveSeasons = new List<ActiveSeason>
        {
            new ActiveSeason
            {
                League = league,
                Season = season,
                TeamDivision = division,
                TeamName = teamName,
                PersonName = personName,
                Role = "PLAYER",
                LatestKudos = new List<long>()
            }
        };

        var userClaims = new Dictionary<string, string>
        {
            { "sub", giverSub },
            { "custom:active_seasons", JsonSerializer.Serialize(initialActiveSeasons) }
        };

        var request = new CreateKudosRequest
        {
            League = league,
            Season = season,
            Division = division,
            ReceivingTeam = "Morpeth 9",
            HomeTeam = teamName,
            AwayTeam = "Morpeth 9",
            MatchDateTime = 2000L,
            GiverTeam = teamName,
            GiverPersonName = personName,
            GiverPersonSub = giverSub,
            KudosValue = 1
        };

        var observer = new SpyLoggerObserver();
        var fakeDataTable = new FakeKudosDataTable();
        var fakeCognito = new FakeCognitoClient { ThrowOnAdminUpdateUserAttributes = true };
        var cognitoUsers = new CognitoUsers(fakeCognito, "pool-id");
        var lambda = new CreateKudosLambda(observer, fakeDataTable, cognitoUsers);

        // Act
        var act = async () => await lambda.HandleAsync(request, userClaims, _context);

        // Assert
        var exception = await act.Should().ThrowAsync<System.Exception>();
        exception.WithMessage("Simulated Cognito update failure");
        observer.RuntimeErrors.Should().ContainSingle().Which.Message.Should().Be("Simulated Cognito update failure");
        fakeDataTable.SavedKudos.Should().HaveCount(1);
        fakeCognito.AdminUpdateUserAttributesCalls.Should().Be(1);
    }
}

using FluentAssertions;
using Xunit;
using System.Collections.Concurrent;
using KudosEvent = TTLeaguePlayersApp.BackEnd.Kudos.DataStore.Kudos;

namespace TTLeaguePlayersApp.BackEnd.Kudos.DataStore.Tests;

public class KudosDataTableTest : IAsyncLifetime
{
    private readonly KudosDataTable _db;
    private readonly ConcurrentBag<(string PK, string SK)> _createdKeys = new();

    public KudosDataTableTest()
    {
        var config = new Configuration.DataStore.Loader().GetEnvironmentVariables();
        
        Amazon.RegionEndpoint? region = null;
        if (!string.IsNullOrEmpty(config.DynamoDB.AWSRegion))
        {
            region = Amazon.RegionEndpoint.GetBySystemName(config.DynamoDB.AWSRegion);
        }
        
        _db = new KudosDataTable(config.DynamoDB.ServiceLocalUrl, region, config.DynamoDB.TablesNameSuffix!);
    }

    public Task InitializeAsync() => Task.CompletedTask;

    [Fact]
    public async Task SaveKudosAsync_SavesItemSuccessfully()
    {
        // Arrange
        var kudos = CreateTestKudos();

        // Act
        await TrackedSave(kudos);

        // Assert
        var retrieved = await _db.RetrieveKudosAsync(
            kudos.League, kudos.Season, kudos.Division, kudos.ReceivingTeam, 
            kudos.HomeTeam, kudos.AwayTeam, kudos.GiverPersonSub);
        
        retrieved.Should().BeEquivalentTo(kudos);
    }

    [Fact]
    public async Task SaveKudosAsync_IsIdempotent()
    {
        // Arrange
        var kudos = CreateTestKudos();

        // Act
        await TrackedSave(kudos);
        await _db.SaveKudosAsync(kudos); // Second save

        // Assert
        var retrieved = await _db.RetrieveKudosAsync(
            kudos.League, kudos.Season, kudos.Division, kudos.ReceivingTeam, 
            kudos.HomeTeam, kudos.AwayTeam, kudos.GiverPersonSub);
        
        retrieved.Should().BeEquivalentTo(kudos);
    }

    [Fact]
    public async Task SaveKudosAsync_UpdatesSummarySuccessfully()
    {
        // Arrange
        var kudos1 = CreateTestKudos();
        kudos1.KudosValue = 1;

        var kudos2 = CreateTestKudos();
        kudos2.Season = kudos1.Season;
        kudos2.League = kudos1.League;
        kudos2.Division = kudos1.Division;
        kudos2.ReceivingTeam = kudos1.ReceivingTeam;
        kudos2.HomeTeam = kudos1.HomeTeam;
        kudos2.AwayTeam = kudos1.AwayTeam;
        kudos2.MatchDateTime = kudos1.MatchDateTime;
        kudos2.GiverTeam = kudos1.GiverTeam;
        // but a different GiverPerson Name and Sub
        kudos2.KudosValue = -1;

        var kudos3 = CreateTestKudos();
        kudos3.Season = kudos1.Season;
        kudos3.League = kudos1.League;
        kudos3.Division = kudos1.Division;
        kudos3.ReceivingTeam = kudos1.ReceivingTeam;
        kudos3.HomeTeam = kudos1.HomeTeam;
        kudos3.AwayTeam = kudos1.AwayTeam;
        kudos3.MatchDateTime = kudos1.MatchDateTime;
        kudos3.GiverTeam = kudos1.GiverTeam;
        // but a different GiverPerson Name and Sub
        kudos3.KudosValue = 0;

        var kudos4 = CreateTestKudos();
        kudos4.Season = kudos1.Season;
        kudos4.League = kudos1.League;
        kudos4.Division = kudos1.Division;
        kudos4.ReceivingTeam = kudos1.ReceivingTeam;
        kudos4.HomeTeam = kudos1.HomeTeam;
        kudos4.AwayTeam = kudos1.AwayTeam;
        kudos4.MatchDateTime = kudos1.MatchDateTime;
        kudos4.GiverTeam = kudos1.GiverTeam;
        // but a different GiverPerson Name and Sub
        kudos4.KudosValue = 1;

        // Act
        await TrackedSave(kudos1);
        await TrackedSave(kudos2);
        await TrackedSave(kudos3);
        await TrackedSave(kudos4);

        // Assert
        var summary = await _db.RetrieveSummaryAsync(
            kudos1.League, kudos1.Season, kudos1.Division, kudos1.ReceivingTeam, 
            kudos1.HomeTeam, kudos1.AwayTeam);
        
        summary.PositiveKudosCount.Should().Be(2);
        summary.NegativeKudosCount.Should().Be(1);
        summary.NeutralKudosCount.Should().Be(1);
    }

    [Fact]
    public async Task SaveKudosAsync_SummaryRemainsConsistentAfterIdempotentSave()
    {
        // Arrange
        var kudos = CreateTestKudos();
        kudos.KudosValue = 1;

        // Act
        await TrackedSave(kudos);
        await _db.SaveKudosAsync(kudos); // Idempotent call

        // Assert
        var summary = await _db.RetrieveSummaryAsync(
            kudos.League, kudos.Season, kudos.Division, kudos.ReceivingTeam, 
            kudos.HomeTeam, kudos.AwayTeam);
        
        summary.PositiveKudosCount.Should().Be(1); // Should NOT be 2
    }

    #region Delete Tests

    [Fact]
    public async Task DeleteKudosAsync_DeletesKudosAndUpdatesSummary()
    {
        // Arrange
        var kudos1 = CreateTestKudos();
        kudos1.KudosValue = 1;
        
        var kudos2 = CreateTestKudos();
        kudos2.Season = kudos1.Season;
        kudos2.League = kudos1.League;
        kudos2.Division = kudos1.Division;
        kudos2.ReceivingTeam = kudos1.ReceivingTeam;
        kudos2.HomeTeam = kudos1.HomeTeam;
        kudos2.AwayTeam = kudos1.AwayTeam;
        kudos2.MatchDateTime = kudos1.MatchDateTime;
        kudos2.GiverTeam = kudos1.GiverTeam;
        kudos2.KudosValue = 1;

        await TrackedSave(kudos1);
        await TrackedSave(kudos2);

        // Verify initial state
        var summaryBefore = await _db.RetrieveSummaryAsync(
            kudos1.League, kudos1.Season, kudos1.Division, kudos1.ReceivingTeam,
            kudos1.HomeTeam, kudos1.AwayTeam);
        summaryBefore.PositiveKudosCount.Should().Be(2);

        // Act
        await _db.DeleteKudosAsync(
            kudos1.League, kudos1.Season, kudos1.Division, kudos1.ReceivingTeam,
            kudos1.HomeTeam, kudos1.AwayTeam, kudos1.GiverPersonSub);

        // Assert - Kudos should be deleted
        var retrieveAct = async () => await _db.RetrieveKudosAsync(
            kudos1.League, kudos1.Season, kudos1.Division, kudos1.ReceivingTeam,
            kudos1.HomeTeam, kudos1.AwayTeam, kudos1.GiverPersonSub);
        await retrieveAct.Should().ThrowAsync<KeyNotFoundException>();

        // Assert - Summary should be updated
        var summaryAfter = await _db.RetrieveSummaryAsync(
            kudos1.League, kudos1.Season, kudos1.Division, kudos1.ReceivingTeam,
            kudos1.HomeTeam, kudos1.AwayTeam);
        summaryAfter.PositiveKudosCount.Should().Be(1);
    }

    [Fact]
    public async Task DeleteKudosAsync_DeletesSummaryWhenAllCountersReachZero()
    {
        // Arrange
        var kudos = CreateTestKudos();
        kudos.KudosValue = 1;
        await TrackedSave(kudos);

        // Verify summary exists
        var summaryBefore = await _db.RetrieveSummaryAsync(
            kudos.League, kudos.Season, kudos.Division, kudos.ReceivingTeam,
            kudos.HomeTeam, kudos.AwayTeam);
        summaryBefore.PositiveKudosCount.Should().Be(1);

        // Act - Delete the only kudos
        await _db.DeleteKudosAsync(
            kudos.League, kudos.Season, kudos.Division, kudos.ReceivingTeam,
            kudos.HomeTeam, kudos.AwayTeam, kudos.GiverPersonSub);

        // Assert - Summary should be deleted
        var retrieveSummaryAct = async () => await _db.RetrieveSummaryAsync(
            kudos.League, kudos.Season, kudos.Division, kudos.ReceivingTeam,
            kudos.HomeTeam, kudos.AwayTeam);
        await retrieveSummaryAct.Should().ThrowAsync<KeyNotFoundException>();
    }

    [Theory]
    [InlineData(1)]
    [InlineData(0)]
    [InlineData(-1)]
    public async Task DeleteKudosAsync_DecrementsCorrectCounterForEachKudosValue(int kudosValue)
    {
        // Arrange
        var kudos1 = CreateTestKudos();
        kudos1.KudosValue = kudosValue;
        
        var kudos2 = CreateTestKudos();
        kudos2.Season = kudos1.Season;
        kudos2.League = kudos1.League;
        kudos2.Division = kudos1.Division;
        kudos2.ReceivingTeam = kudos1.ReceivingTeam;
        kudos2.HomeTeam = kudos1.HomeTeam;
        kudos2.AwayTeam = kudos1.AwayTeam;
        kudos2.MatchDateTime = kudos1.MatchDateTime;
        kudos2.GiverTeam = kudos1.GiverTeam;
        kudos2.KudosValue = kudosValue;

        await TrackedSave(kudos1);
        await TrackedSave(kudos2);

        // Act
        await _db.DeleteKudosAsync(
            kudos1.League, kudos1.Season, kudos1.Division, kudos1.ReceivingTeam,
            kudos1.HomeTeam, kudos1.AwayTeam, kudos1.GiverPersonSub);

        // Assert
        var summary = await _db.RetrieveSummaryAsync(
            kudos1.League, kudos1.Season, kudos1.Division, kudos1.ReceivingTeam,
            kudos1.HomeTeam, kudos1.AwayTeam);

        switch (kudosValue)
        {
            case 1:
                summary.PositiveKudosCount.Should().Be(1);
                summary.NeutralKudosCount.Should().Be(0);
                summary.NegativeKudosCount.Should().Be(0);
                break;
            case 0:
                summary.PositiveKudosCount.Should().Be(0);
                summary.NeutralKudosCount.Should().Be(1);
                summary.NegativeKudosCount.Should().Be(0);
                break;
            case -1:
                summary.PositiveKudosCount.Should().Be(0);
                summary.NeutralKudosCount.Should().Be(0);
                summary.NegativeKudosCount.Should().Be(1);
                break;
        }
    }

    [Fact]
    public async Task DeleteKudosAsync_IsIdempotent()
    {
        // Arrange
        var kudos = CreateTestKudos();
        kudos.KudosValue = 1;
        await TrackedSave(kudos);

        // Act - Delete twice
        await _db.DeleteKudosAsync(
            kudos.League, kudos.Season, kudos.Division, kudos.ReceivingTeam,
            kudos.HomeTeam, kudos.AwayTeam, kudos.GiverPersonSub);
        
        // Second delete should not throw
        await _db.DeleteKudosAsync(
            kudos.League, kudos.Season, kudos.Division, kudos.ReceivingTeam,
            kudos.HomeTeam, kudos.AwayTeam, kudos.GiverPersonSub);

        // Assert - Should still be deleted
        var retrieveAct = async () => await _db.RetrieveKudosAsync(
            kudos.League, kudos.Season, kudos.Division, kudos.ReceivingTeam,
            kudos.HomeTeam, kudos.AwayTeam, kudos.GiverPersonSub);
        await retrieveAct.Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task DeleteKudosAsync_ThrowsValidationException_WhenParametersAreMissing()
    {
        // Act
        var act = async () => await _db.DeleteKudosAsync("", "", "", "", "", "", "");

        // Assert
        var exception = await act.Should().ThrowAsync<Invites.Lambdas.ValidationException>();
        exception.Which.Errors.Should().HaveCount(7);
        exception.Which.Errors.Should().Contain(e => e.Contains("league is required"));
        exception.Which.Errors.Should().Contain(e => e.Contains("season is required"));
        exception.Which.Errors.Should().Contain(e => e.Contains("division is required"));
        exception.Which.Errors.Should().Contain(e => e.Contains("receivingTeam is required"));
        exception.Which.Errors.Should().Contain(e => e.Contains("homeTeam is required"));
        exception.Which.Errors.Should().Contain(e => e.Contains("awayTeam is required"));
        exception.Which.Errors.Should().Contain(e => e.Contains("giverPersonSub is required"));
    }

    [Fact]
    public async Task DeleteKudosAsync_ThrowsValidationException_WhenReceivingTeamNotInMatch()
    {
        // Act - ReceivingTeam is "TeamC" which is neither HomeTeam nor AwayTeam
        var act = async () => await _db.DeleteKudosAsync(
            "CLTTL", "2025", "Division1", "TeamC", "TeamA", "TeamB", "sub123");

        // Assert
        var exception = await act.Should().ThrowAsync<Invites.Lambdas.ValidationException>();
        exception.Which.Errors.Should().Contain(e => e.Contains("receivingTeam must be either the homeTeam or the awayTeam"));
    }


    [Fact]
    public async Task DeleteKudosAsync_DeletesOnlySpecifiedKudos()
    {
        // Arrange - Create multiple kudos for the same match
        var kudos1 = CreateTestKudos();
        kudos1.KudosValue = 1;
        
        var kudos2 = CreateTestKudos();
        kudos2.Season = kudos1.Season;
        kudos2.League = kudos1.League;
        kudos2.Division = kudos1.Division;
        kudos2.ReceivingTeam = kudos1.ReceivingTeam;
        kudos2.HomeTeam = kudos1.HomeTeam;
        kudos2.AwayTeam = kudos1.AwayTeam;
        kudos2.MatchDateTime = kudos1.MatchDateTime;
        kudos2.GiverTeam = kudos1.GiverTeam;
        kudos2.KudosValue = 1;

        await TrackedSave(kudos1);
        await TrackedSave(kudos2);

        // Act - Delete only kudos1
        await _db.DeleteKudosAsync(
            kudos1.League, kudos1.Season, kudos1.Division, kudos1.ReceivingTeam,
            kudos1.HomeTeam, kudos1.AwayTeam, kudos1.GiverPersonSub);

        // Assert - kudos1 should be deleted
        var retrieveKudos1Act = async () => await _db.RetrieveKudosAsync(
            kudos1.League, kudos1.Season, kudos1.Division, kudos1.ReceivingTeam,
            kudos1.HomeTeam, kudos1.AwayTeam, kudos1.GiverPersonSub);
        await retrieveKudos1Act.Should().ThrowAsync<KeyNotFoundException>();

        // Assert - kudos2 should still exist
        var retrievedKudos2 = await _db.RetrieveKudosAsync(
            kudos2.League, kudos2.Season, kudos2.Division, kudos2.ReceivingTeam,
            kudos2.HomeTeam, kudos2.AwayTeam, kudos2.GiverPersonSub);
        retrievedKudos2.Should().NotBeNull();
        retrievedKudos2.GiverPersonSub.Should().Be(kudos2.GiverPersonSub);
    }

    #endregion

    #region Validation Tests

    [Fact]
    public async Task SaveKudosAsync_ThrowsValidationException_WhenRequiredFieldsAreMissing()
    {
        // Arrange
        var kudos = CreateTestKudos();
        
        // Set all required string fields to empty/null to test all validations at once
        kudos.League = "";
        kudos.Season = "";
        kudos.Division = "";
        kudos.ReceivingTeam = "";
        kudos.HomeTeam = "";
        kudos.AwayTeam = "";
        kudos.GiverTeam = "";
        kudos.GiverPersonName = "";
        kudos.GiverPersonSub = "";

        // Act
        var act = async () => await _db.SaveKudosAsync(kudos);

        // Assert
        var exception = await act.Should().ThrowAsync<Invites.Lambdas.ValidationException>();
        // Note: We get 10 errors because empty strings also trigger "GiverTeam cannot be the same as the ReceivingTeam"
        exception.Which.Errors.Should().HaveCount(10);
        exception.Which.Errors.Should().Contain(e => e.Contains("League is required"));
        exception.Which.Errors.Should().Contain(e => e.Contains("Season is required"));
        exception.Which.Errors.Should().Contain(e => e.Contains("Division is required"));
        exception.Which.Errors.Should().Contain(e => e.Contains("ReceivingTeam is required"));
        exception.Which.Errors.Should().Contain(e => e.Contains("HomeTeam is required"));
        exception.Which.Errors.Should().Contain(e => e.Contains("AwayTeam is required"));
        exception.Which.Errors.Should().Contain(e => e.Contains("GiverTeam is required"));
        exception.Which.Errors.Should().Contain(e => e.Contains("GiverPersonName is required"));
        exception.Which.Errors.Should().Contain(e => e.Contains("GiverPersonSub is required"));
    }

    [Fact]
    public async Task SaveKudosAsync_ThrowsValidationException_WhenTeamBusinessRulesAreViolated()
    {
        // Arrange
        var kudos = CreateTestKudos();
        
        // Set up violations for all three team business rules:
        // 1. ReceivingTeam not in match (not HomeTeam or AwayTeam)
        // 2. GiverTeam not in match (not HomeTeam or AwayTeam)
        // 3. GiverTeam same as ReceivingTeam
        kudos.HomeTeam = "TeamA";
        kudos.AwayTeam = "TeamB";
        kudos.ReceivingTeam = "TeamC"; // Not in match (violates rule 1)
        kudos.GiverTeam = "TeamC";     // Not in match (violates rule 2) AND same as receiver (violates rule 3)

        // Act
        var act = async () => await _db.SaveKudosAsync(kudos);

        // Assert
        var exception = await act.Should().ThrowAsync<Invites.Lambdas.ValidationException>();
        exception.Which.Errors.Should().HaveCount(3);
        exception.Which.Errors.Should().Contain(e => e.Contains("ReceivingTeam must be either the HomeTeam or the AwayTeam"));
        exception.Which.Errors.Should().Contain(e => e.Contains("GiverTeam must be either the HomeTeam or the AwayTeam"));
        exception.Which.Errors.Should().Contain(e => e.Contains("GiverTeam cannot be the same as the ReceivingTeam"));
    }

    [Theory]
    [InlineData("TeamC", "TeamA", "TeamB", "TeamA")] // ReceivingTeam not in match (TeamC is not HomeTeam or AwayTeam)
    public async Task SaveKudosAsync_ThrowsValidationException_WhenReceivingTeamNotInMatch(
        string receivingTeam, string homeTeam, string awayTeam, string giverTeam)
    {
        // Arrange
        var kudos = CreateTestKudos();
        kudos.ReceivingTeam = receivingTeam;
        kudos.HomeTeam = homeTeam;
        kudos.AwayTeam = awayTeam;
        kudos.GiverTeam = giverTeam;

        // Act
        var act = async () => await _db.SaveKudosAsync(kudos);

        // Assert
        var exception = await act.Should().ThrowAsync<Invites.Lambdas.ValidationException>();
        exception.Which.Errors.Should().Contain(e => e.Contains("ReceivingTeam must be either the HomeTeam or the AwayTeam"));
    }

    [Theory]
    [InlineData("TeamB", "TeamA", "TeamB", "TeamC")] // GiverTeam not in match
    public async Task SaveKudosAsync_ThrowsValidationException_WhenGiverTeamNotInMatch(
        string receivingTeam, string homeTeam, string awayTeam, string giverTeam)
    {
        // Arrange
        var kudos = CreateTestKudos();
        kudos.ReceivingTeam = receivingTeam;
        kudos.HomeTeam = homeTeam;
        kudos.AwayTeam = awayTeam;
        kudos.GiverTeam = giverTeam;

        // Act
        var act = async () => await _db.SaveKudosAsync(kudos);

        // Assert
        var exception = await act.Should().ThrowAsync<Invites.Lambdas.ValidationException>();
        exception.Which.Errors.Should().Contain(e => e.Contains("GiverTeam must be either the HomeTeam or the AwayTeam"));
    }

    [Theory]
    [InlineData("TeamA", "TeamA", "TeamB", "TeamA")] // GiverTeam same as ReceivingTeam
    public async Task SaveKudosAsync_ThrowsValidationException_WhenGiverTeamSameAsReceivingTeam(
        string receivingTeam, string homeTeam, string awayTeam, string giverTeam)
    {
        // Arrange
        var kudos = CreateTestKudos();
        kudos.ReceivingTeam = receivingTeam;
        kudos.HomeTeam = homeTeam;
        kudos.AwayTeam = awayTeam;
        kudos.GiverTeam = giverTeam;

        // Act
        var act = async () => await _db.SaveKudosAsync(kudos);

        // Assert
        var exception = await act.Should().ThrowAsync<Invites.Lambdas.ValidationException>();
        exception.Which.Errors.Should().Contain(e => e.Contains("GiverTeam cannot be the same as the ReceivingTeam"));
    }

    [Theory]
    [InlineData(-2)]
    [InlineData(2)]
    [InlineData(10)]
    [InlineData(100)]
    public async Task SaveKudosAsync_ThrowsValidationException_WhenKudosValueIsInvalid(int invalidKudosValue)
    {
        // Arrange
        var kudos = CreateTestKudos();
        kudos.KudosValue = invalidKudosValue;

        // Act
        var act = async () => await _db.SaveKudosAsync(kudos);

        // Assert
        var exception = await act.Should().ThrowAsync<Invites.Lambdas.ValidationException>();
        exception.Which.Errors.Should().Contain(e => e.Contains("KudosValue must be -1, 0, or 1"));
    }

    [Theory]
    [InlineData(1)]
    [InlineData(0)]
    [InlineData(-1)]
    public async Task SaveKudosAsync_Succeeds_WhenKudosValueIsValid(int validKudosValue)
    {
        // Arrange
        var kudos = CreateTestKudos();
        kudos.KudosValue = validKudosValue;

        // Act
        await TrackedSave(kudos);

        // Assert
        var retrieved = await _db.RetrieveKudosAsync(
            kudos.League, kudos.Season, kudos.Division, kudos.ReceivingTeam,
            kudos.HomeTeam, kudos.AwayTeam, kudos.GiverPersonSub);
        
        retrieved.KudosValue.Should().Be(validKudosValue);
    }

    #endregion

    private static KudosEvent CreateTestKudos()
    {
        var id = Guid.NewGuid().ToString("N")[..8];
        var sixPlayerNames = new[] { "Emily Parker", "James Whitman", "Sophia Bennett", "Liam Harrison", "Olivia Montgomery", "John Smith" };
        return new KudosEvent
        {
            League = "CLTTL",
            Season = "2025",
            Division = "Division1",
            ReceivingTeam = $"TeamA_{id}",
            HomeTeam = $"TeamB_{id}",
            AwayTeam = $"TeamA_{id}",
            MatchDateTime = 1767282591,
            GiverTeam = $"TeamB_{id}",
            GiverPersonName = sixPlayerNames[new Random().Next(6)],
            GiverPersonSub = Guid.NewGuid().ToString(),
            KudosValue = 1
        };
    }

    private async Task TrackedSave(KudosEvent kudos)
    {
        await _db.SaveKudosAsync(kudos);
        var pk = $"{kudos.League}#{kudos.Season}#{kudos.Division}#{kudos.ReceivingTeam}";
        var sk = $"match#{kudos.HomeTeam}#{kudos.AwayTeam}#{kudos.GiverPersonSub}";
        var summarySk = $"match#{kudos.HomeTeam}#{kudos.AwayTeam}#SUMMARY";
        _createdKeys.Add((pk, sk));
        _createdKeys.Add((pk, summarySk));
    }

    public async Task DisposeAsync()
    {
        foreach (var (pk, sk) in _createdKeys)
        {
            // Skip summary keys, as DeleteKudosAsync handles summary updates/deletion automatically
            // when deleting the corresponding kudos item.
            if (sk.EndsWith("#SUMMARY")) continue;

            // Parse PK: League#Season#Division#ReceivingTeam
            var pkParts = pk.Split('#');
            if (pkParts.Length < 4) continue;
            var league = pkParts[0];
            var season = pkParts[1];
            var division = pkParts[2];
            var receivingTeam = pkParts[3];

            // Parse SK: match#HomeTeam#AwayTeam#GiverPersonSub
            var skParts = sk.Split('#');
            if (skParts.Length < 4) continue;
            var homeTeam = skParts[1];
            var awayTeam = skParts[2];
            var giverPersonSub = skParts[3];

            try
            {
                // Use the business operation to delete checking idempotency internally
                await _db.DeleteKudosAsync(league, season, division, receivingTeam, homeTeam, awayTeam, giverPersonSub);
            }
            catch (Exception)
            {
                // Ignore exceptions during cleanup (e.g. if validation fails or other issues)
                // We want to try to clean up as much as possible.
            }
        }

        _db.Dispose();
        await Task.CompletedTask;
    }
}

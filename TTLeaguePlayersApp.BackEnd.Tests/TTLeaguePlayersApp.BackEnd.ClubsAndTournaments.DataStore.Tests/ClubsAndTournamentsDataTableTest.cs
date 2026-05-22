using FluentAssertions;
using Xunit;
using System.Collections.Concurrent;

namespace TTLeaguePlayersApp.BackEnd.ClubsAndTournaments.DataStore.Tests;

[Trait("Environment", "Staging")]
public class ClubsAndTournamentsDataTableTest : IAsyncLifetime
{
    private readonly ClubsAndTournamentsDataTable _db;
    private readonly ConcurrentBag<(string PK, string SK)> _createdKeys = new();

    public ClubsAndTournamentsDataTableTest()
    {
        var config = new Configuration.DataStore.Loader().GetEnvironmentVariables();

        Amazon.RegionEndpoint? region = null;
        if (!string.IsNullOrEmpty(config.DynamoDB.AWSRegion))
            region = Amazon.RegionEndpoint.GetBySystemName(config.DynamoDB.AWSRegion);

        _db = new ClubsAndTournamentsDataTable(config.DynamoDB.ServiceLocalUrl, region, config.DynamoDB.TablesNameSuffix!);
    }

    public Task InitializeAsync() => Task.CompletedTask;

    // -------------------------------------------------------------------------
    // Club CRUD
    // -------------------------------------------------------------------------

    [Fact]
    public async Task UpsertClubAsync_SavesClubSuccessfully()
    {
        // Arrange
        var club = CreateTestClub();

        // Act
        await TrackedUpsertClub(club);

        // Assert
        var retrieved = await _db.RetrieveClubAsync(club.Location, club.ClubName);
        retrieved.Should().BeEquivalentTo(club);
    }

    [Fact]
    public async Task UpsertClubAsync_UpdatesExistingClub()
    {
        // Arrange
        var club = CreateTestClub();
        await TrackedUpsertClub(club);

        // Act
        club.Homepage = new Uri("https://updated.example.com");
        await _db.UpsertClubAsync(club);

        // Assert
        var retrieved = await _db.RetrieveClubAsync(club.Location, club.ClubName);
        retrieved.Homepage.Should().Be("https://updated.example.com");
    }

    [Fact]
    public async Task UpsertClubAsync_SavesOptionalSocialFields()
    {
        // Arrange
        var club = CreateTestClub();
        club.Instagram = new Uri("https://instagram.com/testclub");
        club.Facebook  = new Uri("https://facebook.com/testclub");
        club.Youtube   = new Uri("https://youtube.com/testclub");

        // Act
        await TrackedUpsertClub(club);

        // Assert
        var retrieved = await _db.RetrieveClubAsync(club.Location, club.ClubName);
        retrieved.Instagram.Should().Be(club.Instagram);
        retrieved.Facebook.Should().Be(club.Facebook);
        retrieved.Youtube.Should().Be(club.Youtube);
    }

    [Fact]
    public async Task UpsertClubAsync_ThrowsValidationException_WhenRequiredFieldsMissing()
    {
        // Arrange — location and club_name are the only string fields that can be blank
        var club = CreateTestClub();
        club.Location = "";
        club.ClubName = "";

        // Act
        var act = async () => await _db.UpsertClubAsync(club);

        // Assert
        var exception = await act.Should().ThrowAsync<ValidationException>();
        exception.Which.Errors.Should().HaveCount(2);
        exception.Which.Errors.Should().Contain(e => e.Contains("location is required"));
        exception.Which.Errors.Should().Contain(e => e.Contains("club_name is required"));
    }

    [Fact]
    public async Task RetrieveClubAsync_Throws_WhenNotFound()
    {
        // Act
        var act = async () => await _db.RetrieveClubAsync("NonExistentLocation", "NonExistentClub");

        // Assert
        await act.Should().ThrowAsync<KeyNotFoundException>()
            .WithMessage("*NonExistentClub*NonExistentLocation*");
    }

    [Fact]
    public async Task RetrieveClubAsync_Throws_WhenParametersMissing()
    {
        // Act
        var act = async () => await _db.RetrieveClubAsync("", "");

        // Assert
        await act.Should().ThrowAsync<ArgumentException>()
            .WithMessage("*location is required*");
    }

    [Fact]
    public async Task DeleteClubAsync_RemovesClub()
    {
        // Arrange
        var club = CreateTestClub();
        await _db.UpsertClubAsync(club); // not tracked — deleted in Act

        // Act
        await _db.DeleteClubAsync(club.Location, club.ClubName);

        // Assert
        var act = async () => await _db.RetrieveClubAsync(club.Location, club.ClubName);
        await act.Should().ThrowAsync<KeyNotFoundException>();
    }

    // -------------------------------------------------------------------------
    // Tournament CRUD
    // -------------------------------------------------------------------------

    [Fact]
    public async Task UpsertTournamentAsync_SavesTournamentSuccessfully()
    {
        // Arrange
        var club = CreateTestClub();
        await TrackedUpsertClub(club);
        var tournament = CreateTestTournament(club);

        // Act
        await TrackedUpsertTournament(tournament);

        // Assert
        var retrieved = await _db.RetrieveTournamentAsync(tournament.Location, tournament.ClubName, tournament.TournamentName);
        retrieved.Should().BeEquivalentTo(tournament);
    }

    [Fact]
    public async Task UpsertTournamentAsync_UpdatesExistingTournament()
    {
        // Arrange
        var club = CreateTestClub();
        await TrackedUpsertClub(club);
        var tournament = CreateTestTournament(club);
        await TrackedUpsertTournament(tournament);

        // Act
        tournament.TournamentInfo = new Uri("https://updated-info.example.com/flyer.pdf");
        await _db.UpsertTournamentAsync(tournament);

        // Assert
        var retrieved = await _db.RetrieveTournamentAsync(tournament.Location, tournament.ClubName, tournament.TournamentName);
        retrieved.TournamentInfo.Should().Be("https://updated-info.example.com/flyer.pdf");
    }

    [Fact]
    public async Task UpsertTournamentAsync_SavesOptionalSocialFields()
    {
        // Arrange
        var club = CreateTestClub();
        await TrackedUpsertClub(club);
        var tournament = CreateTestTournament(club);
        tournament.Instagram = new Uri("https://instagram.com/tournament");
        tournament.Facebook  = new Uri("https://facebook.com/tournament");

        // Act
        await TrackedUpsertTournament(tournament);

        // Assert
        var retrieved = await _db.RetrieveTournamentAsync(tournament.Location, tournament.ClubName, tournament.TournamentName);
        retrieved.Instagram.Should().Be(tournament.Instagram);
        retrieved.Facebook.Should().Be(tournament.Facebook);
    }

    [Fact]
    public async Task UpsertTournamentAsync_ThrowsValidationException_WhenRequiredFieldsMissing()
    {
        // Arrange — location, club_name, tournament_name are the string fields that can be blank;
        // TournamentInfo is Uri (compiler-enforced); dates validated separately
        var tournament = CreateTestTournament(CreateTestClub());
        tournament.Location       = "";
        tournament.ClubName       = "";
        tournament.TournamentName = "";
        tournament.StartDate      = 0;
        tournament.EndDate        = 0;

        // Act
        var act = async () => await _db.UpsertTournamentAsync(tournament);

        // Assert
        var exception = await act.Should().ThrowAsync<ValidationException>();
        exception.Which.Errors.Should().Contain(e => e.Contains("location is required"));
        exception.Which.Errors.Should().Contain(e => e.Contains("club_name is required"));
        exception.Which.Errors.Should().Contain(e => e.Contains("tournament_name is required"));
        exception.Which.Errors.Should().Contain(e => e.Contains("start_date must be a positive unix timestamp"));
        exception.Which.Errors.Should().Contain(e => e.Contains("end_date must be a positive unix timestamp"));
    }

    [Fact]
    public async Task UpsertTournamentAsync_ThrowsValidationException_WhenEndDateBeforeStartDate()
    {
        // Arrange
        var club = CreateTestClub();
        var tournament = CreateTestTournament(club);
        tournament.StartDate = 2000000000L;
        tournament.EndDate   = 1000000000L;

        // Act
        var act = async () => await _db.UpsertTournamentAsync(tournament);

        // Assert
        var exception = await act.Should().ThrowAsync<ValidationException>();
        exception.Which.Errors.Should().Contain(e => e.Contains("end_date must be >="));
    }

    [Fact]
    public async Task RetrieveTournamentAsync_Throws_WhenNotFound()
    {
        // Act
        var act = async () => await _db.RetrieveTournamentAsync("London", "SomeClub", "NonExistentTournament");

        // Assert
        await act.Should().ThrowAsync<KeyNotFoundException>()
            .WithMessage("*NonExistentTournament*");
    }

    [Fact]
    public async Task DeleteTournamentAsync_RemovesTournament()
    {
        // Arrange
        var club = CreateTestClub();
        await TrackedUpsertClub(club);
        var tournament = CreateTestTournament(club);
        await _db.UpsertTournamentAsync(tournament); // not tracked — deleted in Act

        // Act
        await _db.DeleteTournamentAsync(tournament.Location, tournament.ClubName, tournament.TournamentName);

        // Assert
        var act = async () => await _db.RetrieveTournamentAsync(tournament.Location, tournament.ClubName, tournament.TournamentName);
        await act.Should().ThrowAsync<KeyNotFoundException>();
    }

    // -------------------------------------------------------------------------
    // Read-heavy queries
    // -------------------------------------------------------------------------

    [Fact]
    public async Task RetrieveAllClubsWithActiveTournamentsAsync_ReturnsClubsWithOnlyActiveTournaments()
    {
        // Arrange
        var club = CreateTestClub();
        await TrackedUpsertClub(club);

        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var activeTournament   = CreateTestTournament(club, startOffset: -7, endOffset: +7);   // ends in future
        var expiredTournament  = CreateTestTournament(club, startOffset: -30, endOffset: -1);  // ended yesterday

        await TrackedUpsertTournament(activeTournament);
        await TrackedUpsertTournament(expiredTournament);

        // Act
        var result = await _db.RetrieveAllClubsWithActiveTournamentsAsync(now);

        // Assert
        var entry = result.FirstOrDefault(e => e.Club.ClubName == club.ClubName);
        entry.Should().NotBeNull();
        entry!.Tournaments.Should().ContainSingle(t => t.TournamentName == activeTournament.TournamentName);
        entry.Tournaments.Should().NotContain(t => t.TournamentName == expiredTournament.TournamentName);
    }

    [Fact]
    public async Task RetrieveAllClubsWithActiveTournamentsAsync_ReturnsClubWithEmptyTournaments_WhenAllExpired()
    {
        // Arrange
        var club = CreateTestClub();
        await TrackedUpsertClub(club);

        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var expiredTournament = CreateTestTournament(club, startOffset: -30, endOffset: -1);
        await TrackedUpsertTournament(expiredTournament);

        // Act
        var result = await _db.RetrieveAllClubsWithActiveTournamentsAsync(now);

        // Assert
        var entry = result.FirstOrDefault(e => e.Club.ClubName == club.ClubName);
        entry.Should().NotBeNull();
        entry!.Tournaments.Should().BeEmpty();
    }

    [Fact]
    public async Task RetrieveAllClubsWithActiveTournamentsAsync_ResultsOrderedByLocationThenClubNameThenStartDate()
    {
        // Arrange — two clubs in different locations, each with two tournaments
        var id = UniqueId();
        var clubA = CreateTestClub(location: $"AAA_Location_{id}", clubName: $"AAA_Club_{id}");
        var clubB = CreateTestClub(location: $"BBB_Location_{id}", clubName: $"BBB_Club_{id}");
        await TrackedUpsertClub(clubA);
        await TrackedUpsertClub(clubB);

        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var t1 = CreateTestTournament(clubA, startOffset: -5, endOffset: +10);
        var t2 = CreateTestTournament(clubA, startOffset: -2, endOffset: +10);
        var t3 = CreateTestTournament(clubB, startOffset: -3, endOffset: +10);
        await TrackedUpsertTournament(t1);
        await TrackedUpsertTournament(t2);
        await TrackedUpsertTournament(t3);

        // Act
        var result = await _db.RetrieveAllClubsWithActiveTournamentsAsync(now);

        // Assert — clubs appear in location order
        var clubAEntry = result.FirstOrDefault(e => e.Club.ClubName == clubA.ClubName);
        var clubBEntry = result.FirstOrDefault(e => e.Club.ClubName == clubB.ClubName);
        clubAEntry.Should().NotBeNull();
        clubBEntry.Should().NotBeNull();

        var clubAIndex = result.IndexOf(clubAEntry!);
        var clubBIndex = result.IndexOf(clubBEntry!);
        clubAIndex.Should().BeLessThan(clubBIndex);

        // Tournaments within clubA ordered by start date ascending
        clubAEntry!.Tournaments.Should().HaveCount(2);
        clubAEntry.Tournaments[0].StartDate.Should().BeLessThanOrEqualTo(clubAEntry.Tournaments[1].StartDate);
    }

    [Fact]
    public async Task RetrieveClubsWithActiveTournamentsByLocationAsync_ReturnsOnlyClubsInGivenLocation()
    {
        // Arrange
        var id = UniqueId();
        var targetLocation = $"TargetLoc_{id}";
        var otherLocation  = $"OtherLoc_{id}";

        var clubInTarget = CreateTestClub(location: targetLocation);
        var clubInOther  = CreateTestClub(location: otherLocation);
        await TrackedUpsertClub(clubInTarget);
        await TrackedUpsertClub(clubInOther);

        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var tournament = CreateTestTournament(clubInTarget, startOffset: -1, endOffset: +7);
        await TrackedUpsertTournament(tournament);

        // Act
        var result = await _db.RetrieveClubsWithActiveTournamentsByLocationAsync(targetLocation, now);

        // Assert
        result.Should().NotBeEmpty();
        result.Should().AllSatisfy(e => e.Club.Location.Should().Be(targetLocation));
        result.Should().NotContain(e => e.Club.Location == otherLocation);
    }

    [Fact]
    public async Task RetrieveClubsWithActiveTournamentsByLocationAsync_Throws_WhenLocationMissing()
    {
        // Act
        var act = async () => await _db.RetrieveClubsWithActiveTournamentsByLocationAsync("", DateTimeOffset.UtcNow.ToUnixTimeSeconds());

        // Assert
        await act.Should().ThrowAsync<ArgumentException>()
            .WithMessage("*location is required*");
    }

    [Fact]
    public async Task RetrieveAllClubsWithActiveTournamentsAsync_Throws_WhenNowIsInvalid()
    {
        // Act
        var act = async () => await _db.RetrieveAllClubsWithActiveTournamentsAsync(0);

        // Assert
        await act.Should().ThrowAsync<ArgumentException>()
            .WithMessage("*now must be a positive unix timestamp*");
    }

    // -------------------------------------------------------------------------
    // Builders
    // -------------------------------------------------------------------------

    private static Club CreateTestClub(string? location = null, string? clubName = null)
    {
        var id = UniqueId();
        return new Club
        {
            Location = location ?? $"London_{id}",
            ClubName = clubName ?? $"TestClub_{id}",
            Homepage = new Uri($"https://club-{id}.example.com"),
        };
    }

    private static Tournament CreateTestTournament(Club club, int startOffset = -3, int endOffset = +7)
    {
        var id = UniqueId();
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        return new Tournament
        {
            Location       = club.Location,
            ClubName       = club.ClubName,
            TournamentName = $"Tournament_{id}",
            TournamentInfo = new Uri($"https://info-{id}.example.com/flyer.pdf"),
            StartDate      = now + (startOffset * 86400L),
            EndDate        = now + (endOffset   * 86400L),
        };
    }

    private static string UniqueId() => Guid.NewGuid().ToString("N")[..8];

    // -------------------------------------------------------------------------
    // Tracked helpers and teardown
    // -------------------------------------------------------------------------

    private async Task TrackedUpsertClub(Club club)
    {
        await _db.UpsertClubAsync(club);
        _createdKeys.Add(($"LOC#{club.Location}", $"CLUB#{club.ClubName}"));
    }

    private async Task TrackedUpsertTournament(Tournament tournament)
    {
        await _db.UpsertTournamentAsync(tournament);
        _createdKeys.Add(($"LOC#{tournament.Location}#CLUB#{tournament.ClubName}", $"TOURN#{tournament.TournamentName}"));
    }

    public async Task DisposeAsync()
    {
        /*
        foreach (var (pk, sk) in _createdKeys)
        {
            try
            {
                if (sk.StartsWith("CLUB#"))
                {
                    var location = pk["LOC#".Length..];
                    var clubName = sk["CLUB#".Length..];
                    await _db.DeleteClubAsync(location, clubName);
                }
                else if (sk.StartsWith("TOURN#"))
                {
                    // PK = LOC#<location>#CLUB#<clubName>
                    var withoutPrefix = pk["LOC#".Length..];
                    var clubIdx = withoutPrefix.IndexOf("#CLUB#", StringComparison.Ordinal);
                    var location = withoutPrefix[..clubIdx];
                    var clubName = withoutPrefix[(clubIdx + "#CLUB#".Length)..];
                    var tournamentName = sk["TOURN#".Length..];
                    await _db.DeleteTournamentAsync(location, clubName, tournamentName);
                }
            }
            catch { }
        }
        */
        _db.Dispose();
    }
}

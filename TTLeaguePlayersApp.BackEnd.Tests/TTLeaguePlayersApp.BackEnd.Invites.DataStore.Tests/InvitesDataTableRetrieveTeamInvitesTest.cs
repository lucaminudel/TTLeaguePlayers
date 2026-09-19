using FluentAssertions;
using System.Collections.Concurrent;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.Invites.DataStore.Tests;

// Integration tests for RetrievePlayersInvitesForTeam against a real DynamoDB table.
[Trait("Environment", "Staging")]
public class InvitesDataTableRetrievePlayersInvitesTest : IAsyncLifetime
{
    private const string Season = "2025-2026";
    private const string OtherSeason = "2024-2025";

    private readonly InvitesDataTable _db;
    private readonly ConcurrentBag<string> _createdNanoIds = new();
    private readonly string _league = $"TEST-LEAGUE-{Guid.NewGuid():N}";

    public InvitesDataTableRetrievePlayersInvitesTest()
    {
        var config = new Configuration.DataStore.Loader().GetEnvironmentVariables();

        Amazon.RegionEndpoint? region = null;
        if (!string.IsNullOrEmpty(config.DynamoDB.AWSRegion))
        {
            region = Amazon.RegionEndpoint.GetBySystemName(config.DynamoDB.AWSRegion);
        }

        _db = new InvitesDataTable(config.DynamoDB.ServiceLocalUrl, region, config.DynamoDB.TablesNameSuffix!);
    }

    public Task InitializeAsync() => Task.CompletedTask;

    public async Task DisposeAsync()
    {
        foreach (var nanoId in _createdNanoIds)
        {
            try { await _db.DeleteInvite(nanoId); } catch { /* best effort, as elsewhere in this suite */ }
        }
        _db.Dispose();
    }

    // ------------------------------------------------------------------ roles

    [Fact]
    public async Task RetrievesACaptainInvite()
    {
        var invite = await TrackedCreate(CaptainInvite("Alpha 1"));

        var found = await _db.RetrievePlayersInvitesForTeam(_league, Season, "Alpha 1");

        var result = found.Should().ContainSingle().Subject;
        result.NanoId.Should().Be(invite.NanoId);
        result.InviteeRole.Should().Be(Role.CAPTAIN);
    }

    // The one line that differs from the captains-only query: PLAYER invites come back too.
    [Fact]
    public async Task RetrievesAPlayerInvite()
    {
        var invite = await TrackedCreate(PlayerInvite("Alpha 2"));

        var found = await _db.RetrievePlayersInvitesForTeam(_league, Season, "Alpha 2");

        var result = found.Should().ContainSingle().Subject;
        result.NanoId.Should().Be(invite.NanoId);
        result.InviteeRole.Should().Be(Role.PLAYER);
    }

    [Fact]
    public async Task RetrievesBothTheCaptainAndThePlayersOfOneTeam()
    {
        await TrackedCreate(CaptainInvite("Alpha 3"));
        await TrackedCreate(PlayerInvite("Alpha 3", "Player One"));
        await TrackedCreate(PlayerInvite("Alpha 3", "Player Two"));

        var found = await _db.RetrievePlayersInvitesForTeam(_league, Season, "Alpha 3");

        found.Should().HaveCount(3);
        found.Select(i => i.InviteeRole).Should().BeEquivalentTo(new[] { Role.CAPTAIN, Role.PLAYER, Role.PLAYER });
        found.Select(i => i.InviteeName).Should().BeEquivalentTo("Test Captain", "Player One", "Player Two");
    }

    [Fact]
    public async Task ReturnsEveryProjectedFieldPopulated_ForAPlayerInvite()
    {
        var invite = await TrackedCreate(PlayerInvite("Alpha 4", "Projected Player"));

        var found = await _db.RetrievePlayersInvitesForTeam(_league, Season, "Alpha 4");

        var result = found.Should().ContainSingle().Subject;
        result.NanoId.Should().Be(invite.NanoId);
        result.InviteeName.Should().Be("Projected Player");
        result.InviteeEmailId.Should().Be(invite.InviteeEmailId);
        result.InviteeRole.Should().Be(Role.PLAYER);
        result.InviteeTeam.Should().Be("Alpha 4");
        result.TeamDivision.Should().Be(invite.TeamDivision);
        result.League.Should().Be(_league);
        result.Season.Should().Be(Season);
        result.CreatedAt.Should().Be(invite.CreatedAt);
        result.AcceptedAt.Should().BeNull();
    }

    [Fact]
    public async Task RetrievesAnAcceptedInvite_WithTheAcceptedAtTimestamp()
    {
        var invite = await TrackedCreate(PlayerInvite("Alpha 5"));
        await _db.MarkInviteAccepted(invite.NanoId, 1786000000);

        var found = await _db.RetrievePlayersInvitesForTeam(_league, Season, "Alpha 5");

        found.Should().ContainSingle().Which.AcceptedAt.Should().Be(1786000000);
    }

    // ------------------------------------------------------------------ exclusions

    // Mechanism 1: the KeyConditionExpression on league_season.
    [Fact]
    public async Task ExcludesADifferentSeason_TheKeyCondition()
    {
        await TrackedCreate(CaptainInvite("Beta 1", season: OtherSeason));

        var found = await _db.RetrievePlayersInvitesForTeam(_league, Season, "Beta 1");

        found.Should().BeEmpty();
    }

    [Fact]
    public async Task ExcludesADifferentLeague_TheKeyCondition()
    {
        await TrackedCreate(CaptainInvite("Beta 2"));

        var found = await _db.RetrievePlayersInvitesForTeam($"{_league}-OTHER", Season, "Beta 2");

        found.Should().BeEmpty();
    }

    // Mechanism 2: the in-memory team match. Other teams of the same league_season share the
    // partition and must be dropped.
    [Fact]
    public async Task ExcludesAnotherTeamsInvites_TheTeamMatch()
    {
        await TrackedCreate(CaptainInvite("Beta 3"));
        await TrackedCreate(PlayerInvite("Beta 3"));
        await TrackedCreate(CaptainInvite("Beta 4"));
        await TrackedCreate(PlayerInvite("Beta 4"));

        var found = await _db.RetrievePlayersInvitesForTeam(_league, Season, "Beta 3");

        found.Should().HaveCount(2);
        found.Should().OnlyContain(i => i.InviteeTeam == "Beta 3");
    }

    // Mechanism 3: the sparse index. A ClubManagerInvite has no invitee_team, so DynamoDB never
    // indexes it — and the role filter would drop it anyway.
    [Fact]
    public async Task ExcludesClubManagerInvites_TheSparseIndex()
    {
        await TrackedCreate(ClubManagerInvite("Beta Club"));

        var found = await _db.RetrievePlayersInvitesForTeam(_league, Season, "Beta Club");

        found.Should().BeEmpty();
    }

    // ------------------------------------------------------------------ matching semantics
    //
    // Same rule as RetrieveCaptainInvitesForTeams: case-insensitive, whitespace around either
    // spelling ignored, not a prefix match.

    [Fact]
    public async Task TeamMatchingIsCaseInsensitive()
    {
        await TrackedCreate(PlayerInvite("Gamma 1"));

        var found = await _db.RetrievePlayersInvitesForTeam(_league, Season, "gamma 1");

        found.Should().ContainSingle().Which.InviteeTeam.Should().Be("Gamma 1");
    }

    [Fact]
    public async Task TeamMatchingIgnoresWhitespaceAroundTheRequestedName()
    {
        await TrackedCreate(PlayerInvite("Gamma 2"));

        var found = await _db.RetrievePlayersInvitesForTeam(_league, Season, "  Gamma 2  ");

        found.Should().ContainSingle().Which.InviteeTeam.Should().Be("Gamma 2");
    }

    [Fact]
    public async Task TeamMatchingIgnoresWhitespaceAroundTheStoredName()
    {
        await TrackedCreate(PlayerInvite("  Gamma 3  "));

        var found = await _db.RetrievePlayersInvitesForTeam(_league, Season, "Gamma 3");

        found.Should().ContainSingle().Which.InviteeTeam.Should().Be("  Gamma 3  ");
    }

    [Fact]
    public async Task TeamMatchingIsNotAPrefixMatch()
    {
        await TrackedCreate(PlayerInvite("Gamma 4"));

        var found = await _db.RetrievePlayersInvitesForTeam(_league, Season, "Gamma");

        found.Should().BeEmpty();
    }

    [Fact]
    public async Task ReturnsEmptyWhenNothingMatches()
    {
        var found = await _db.RetrievePlayersInvitesForTeam(_league, Season, "Nobody 1");

        found.Should().BeEmpty();
    }

    // ------------------------------------------------------------------ guards

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Throws_WhenLeagueIsMissing(string league)
    {
        var act = async () => await _db.RetrievePlayersInvitesForTeam(league, Season, "Alpha 1");

        await act.Should().ThrowAsync<ValidationException>();
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Throws_WhenSeasonIsMissing(string season)
    {
        var act = async () => await _db.RetrievePlayersInvitesForTeam(_league, season, "Alpha 1");

        await act.Should().ThrowAsync<ValidationException>();
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Throws_WhenTeamNameIsMissing(string teamName)
    {
        var act = async () => await _db.RetrievePlayersInvitesForTeam(_league, Season, teamName);

        await act.Should().ThrowAsync<ValidationException>();
    }

    // ------------------------------------------------------------------ test data

    private async Task<T> TrackedCreate<T>(T invite) where T : Invite
    {
        await _db.CreateNewInvite(invite);
        _createdNanoIds.Add(invite.NanoId);
        return invite;
    }

    private CaptainOrPlayerInvite CaptainInvite(string inviteeTeam, string? season = null)
        => new()
        {
            NanoId = GenerateNanoId(),
            InviteeName = "Test Captain",
            InviteeEmailId = $"test-{Guid.NewGuid()}@example.com",
            InviteeRole = Role.CAPTAIN,
            InviteeTeam = inviteeTeam,
            TeamDivision = "Division 4",
            League = _league,
            Season = season ?? Season,
            InvitedBy = "Admin User",
            CreatedAt = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
            AcceptedAt = null
        };

    private CaptainOrPlayerInvite PlayerInvite(string inviteeTeam, string inviteeName = "Test Player")
        => new()
        {
            NanoId = GenerateNanoId(),
            InviteeName = inviteeName,
            InviteeEmailId = $"test-{Guid.NewGuid()}@example.com",
            InviteeRole = Role.PLAYER,
            InviteeTeam = inviteeTeam,
            TeamDivision = "Division 4",
            League = _league,
            Season = Season,
            InvitedBy = "Admin User",
            CreatedAt = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
            AcceptedAt = null
        };

    private ClubManagerInvite ClubManagerInvite(string inviteeClub)
        => new()
        {
            NanoId = GenerateNanoId(),
            InviteeName = "Test Manager",
            InviteeEmailId = $"test-{Guid.NewGuid()}@example.com",
            InviteeRole = Role.CLUB_MANAGER,
            InviteeClub = inviteeClub,
            ClubLocation = "London",
            League = _league,
            Season = Season,
            InvitedBy = "Admin User",
            CreatedAt = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
            AcceptedAt = null
        };

    private static string GenerateNanoId() => Guid.NewGuid().ToString("N")[..8];
}

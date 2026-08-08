using FluentAssertions;
using System.Collections.Concurrent;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.Invites.DataStore.Tests;

// Integration tests for RetrieveCaptainInvitesForTeams against a real DynamoDB table.//
[Trait("Environment", "Staging")]
public class InvitesDataTableRetrieveCaptainInvitesTest : IAsyncLifetime
{
    private const string Season = "2025-2026";
    private const string OtherSeason = "2024-2025";

    private readonly InvitesDataTable _db;
    private readonly ConcurrentBag<string> _createdNanoIds = new();
    private readonly string _league = $"TEST-LEAGUE-{Guid.NewGuid():N}";

    public InvitesDataTableRetrieveCaptainInvitesTest()
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

    // ------------------------------------------------------------------ statuses

    [Fact]
    public async Task RetrievesAnUnacceptedCaptainInvite_WithNullAcceptedAt()
    {
        var invite = await TrackedCreate(CaptainInvite("Alpha 1", accepted: false));

        var found = await _db.RetrieveCaptainInvitesForTeams(_league, Season, new[] { "Alpha 1" });

        var result = found.Should().ContainSingle().Subject;
        result.NanoId.Should().Be(invite.NanoId);
        result.InviteeTeam.Should().Be("Alpha 1");
        result.InviteeRole.Should().Be(Role.CAPTAIN);

        result.AcceptedAt.Should().BeNull();
    }

    [Fact]
    public async Task RetrievesAnAcceptedCaptainInvite_WithTheAcceptedAtTimestamp()
    {
        var invite = await TrackedCreate(CaptainInvite("Alpha 2", accepted: false));
        await _db.MarkInviteAccepted(invite.NanoId, 1786000000);

        var found = await _db.RetrieveCaptainInvitesForTeams(_league, Season, new[] { "Alpha 2" });

        found.Should().ContainSingle().Which.AcceptedAt.Should().Be(1786000000);
    }

    [Fact]
    public async Task ReturnsEveryProjectedFieldPopulated()
    {
        var invite = await TrackedCreate(CaptainInvite("Alpha 3", accepted: false));

        var found = await _db.RetrieveCaptainInvitesForTeams(_league, Season, new[] { "Alpha 3" });

        var result = found.Should().ContainSingle().Subject;
        result.NanoId.Should().Be(invite.NanoId);
        result.InviteeName.Should().Be(invite.InviteeName);
        result.InviteeEmailId.Should().Be(invite.InviteeEmailId);
        result.TeamDivision.Should().Be(invite.TeamDivision);
        result.League.Should().Be(_league);
        result.Season.Should().Be(Season);
        result.CreatedAt.Should().Be(invite.CreatedAt);
    }


    // Mechanism 1: the FilterExpression on invitee_role.
    [Fact]
    public async Task ExcludesPlayerInvites_TheRoleFilter()
    {
        await TrackedCreate(PlayerInvite("Beta 1"));

        var found = await _db.RetrieveCaptainInvitesForTeams(_league, Season, new[] { "Beta 1" });

        found.Should().BeEmpty();
    }

    // Mechanism 2: the KeyConditionExpression on league_season.
    [Fact]
    public async Task ExcludesADifferentSeason_TheKeyCondition()
    {
        await TrackedCreate(CaptainInvite("Beta 2", accepted: false, season: OtherSeason));

        var found = await _db.RetrieveCaptainInvitesForTeams(_league, Season, new[] { "Beta 2" });

        found.Should().BeEmpty();
    }

    [Fact]
    public async Task ExcludesADifferentLeague_TheKeyCondition()
    {
        await TrackedCreate(CaptainInvite("Beta 3", accepted: false));

        var found = await _db.RetrieveCaptainInvitesForTeams($"{_league}-OTHER", Season, new[] { "Beta 3" });

        found.Should().BeEmpty();
    }

    // Mechanism 3: the in-memory byte-exact team match.
    [Fact]
    public async Task ExcludesAnUnrequestedTeam_TheTeamMatch()
    {
        await TrackedCreate(CaptainInvite("Beta 4", accepted: false));
        await TrackedCreate(CaptainInvite("Beta 5", accepted: false));

        var found = await _db.RetrieveCaptainInvitesForTeams(_league, Season, new[] { "Beta 4" });

        found.Should().ContainSingle().Which.InviteeTeam.Should().Be("Beta 4");
    }

    // Mechanism 4: the sparse index. A ClubManagerInvite carries league_season — CreateNewInvite
    // writes it for every invite type — but has no invitee_team, so DynamoDB never indexes it.
    [Fact]
    public async Task ExcludesClubManagerInvites_TheSparseIndex()
    {
        await TrackedCreate(ClubManagerInvite("Beta Club"));

        var found = await _db.RetrieveCaptainInvitesForTeams(_league, Season, new[] { "Beta Club" });

        found.Should().BeEmpty();
    }

    // ------------------------------------------------------------------ matching semantics

    [Fact]
    public async Task TeamMatchingIsCaseSensitive()
    {
        await TrackedCreate(CaptainInvite("Gamma 1", accepted: false));

        var found = await _db.RetrieveCaptainInvitesForTeams(_league, Season, new[] { "gamma 1" });

        found.Should().BeEmpty();
    }

    [Fact]
    public async Task TeamMatchingIsNotAPrefixMatch()
    {
        await TrackedCreate(CaptainInvite("Gamma 2", accepted: false));

        var found = await _db.RetrieveCaptainInvitesForTeams(_league, Season, new[] { "Gamma" });

        found.Should().BeEmpty();
    }

    [Fact]
    public async Task MatchesTeamNamesContainingSpacesAndApostrophes()
    {
        // Real configured club names look like this, and they are the reason the team list travels
        // in a request body rather than a query string.
        await TrackedCreate(CaptainInvite("St Katharine's Trust 2", accepted: false));

        var found = await _db.RetrieveCaptainInvitesForTeams(_league, Season, new[] { "St Katharine's Trust 2" });

        found.Should().ContainSingle().Which.InviteeTeam.Should().Be("St Katharine's Trust 2");
    }

    [Fact]
    public async Task RetrievesSeveralTeamsInOneQuery()
    {
        await TrackedCreate(CaptainInvite("Delta 1", accepted: false));
        await TrackedCreate(CaptainInvite("Delta 2", accepted: false));
        await TrackedCreate(CaptainInvite("Delta 3", accepted: false));

        var found = await _db.RetrieveCaptainInvitesForTeams(
            _league, Season, new[] { "Delta 1", "Delta 3", "Delta 99" });

        found.Select(i => i.InviteeTeam).Should().BeEquivalentTo("Delta 1", "Delta 3");
    }

    [Fact]
    public async Task ReturnsBothInvitesWhenATeamHasTwoCaptains()
    {
        // The datastore does not resolve duplicates — it returns what is stored, and the lambda
        // decides. Production contains a real instance of this.
        await TrackedCreate(CaptainInvite("Delta 4", accepted: false));
        await TrackedCreate(CaptainInvite("Delta 4", accepted: false));

        var found = await _db.RetrieveCaptainInvitesForTeams(_league, Season, new[] { "Delta 4" });

        found.Should().HaveCount(2);
        found.Select(i => i.NanoId).Distinct().Should().HaveCount(2);
    }

    [Fact]
    public async Task ReturnsEmptyWhenNothingMatches()
    {
        var found = await _db.RetrieveCaptainInvitesForTeams(_league, Season, new[] { "Nobody 1" });

        found.Should().BeEmpty();
    }

    // ------------------------------------------------------------------ guards
    //
    // These fail as ValidationException naming the parameter, rather than as a DynamoDB service error
    // or — worse — as a silently empty result.

    [Fact]
    public async Task Throws_WhenTeamNamesIsEmpty()
    {
        var act = async () => await _db.RetrieveCaptainInvitesForTeams(_league, Season, Array.Empty<string>());

        await act.Should().ThrowAsync<ValidationException>();
    }

    [Fact]
    public async Task Throws_WhenTeamNamesIsNull()
    {
        var act = async () => await _db.RetrieveCaptainInvitesForTeams(_league, Season, null!);

        await act.Should().ThrowAsync<ValidationException>();
    }

    [Fact]
    public async Task Throws_WhenATeamNameIsBlank()
    {
        var act = async () => await _db.RetrieveCaptainInvitesForTeams(_league, Season, new[] { "Alpha 1", "  " });

        await act.Should().ThrowAsync<ValidationException>();
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Throws_WhenLeagueIsMissing(string league)
    {
        var act = async () => await _db.RetrieveCaptainInvitesForTeams(league, Season, new[] { "Alpha 1" });

        await act.Should().ThrowAsync<ValidationException>();
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Throws_WhenSeasonIsMissing(string season)
    {
        var act = async () => await _db.RetrieveCaptainInvitesForTeams(_league, season, new[] { "Alpha 1" });

        await act.Should().ThrowAsync<ValidationException>();
    }

    // A large list is accepted: the old 100-name cap existed only because DynamoDB limits an IN
    // comparison to 100 operands, and the query no longer uses one.
    [Fact]
    public async Task AcceptsMoreThanOneHundredTeamNames()
    {
        await TrackedCreate(CaptainInvite("Epsilon 1", accepted: false));

        var teamNames = Enumerable.Range(0, 150).Select(i => $"Filler {i}").Append("Epsilon 1").ToList();

        var found = await _db.RetrieveCaptainInvitesForTeams(_league, Season, teamNames);

        found.Should().ContainSingle().Which.InviteeTeam.Should().Be("Epsilon 1");
    }

    // ------------------------------------------------------------------ test data

    private async Task<T> TrackedCreate<T>(T invite) where T : Invite
    {
        await _db.CreateNewInvite(invite);
        _createdNanoIds.Add(invite.NanoId);
        return invite;
    }

    private CaptainOrPlayerInvite CaptainInvite(string inviteeTeam, bool accepted, string? season = null)
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
            AcceptedAt = accepted ? 1786000000 : null
        };

    private CaptainOrPlayerInvite PlayerInvite(string inviteeTeam)
        => new()
        {
            NanoId = GenerateNanoId(),
            InviteeName = "Test Player",
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

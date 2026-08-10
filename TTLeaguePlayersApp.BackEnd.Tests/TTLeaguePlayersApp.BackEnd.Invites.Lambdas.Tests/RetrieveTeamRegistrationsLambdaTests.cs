using Amazon.Lambda.TestUtilities;
using FluentAssertions;
using TTLeaguePlayersApp.BackEnd.Invites.DataStore;
using TTLeaguePlayersApp.BackEnd.Tests;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.Invites.Lambdas.Tests;

public class RetrieveTeamRegistrationsLambdaTests
{
    private const string League = "CLTTL";
    private const string Season = "2025-2026";
    private const string ClubName = "Morpeth Table Tennis Club";
    private const string ClubLocation = "London";

    private readonly TestLambdaContext _context = new();
    private readonly FakeInvitesDataTable _dataTable = new();
    private readonly SpyLoggerObserver _observer = new();

    private RetrieveTeamRegistrationsLambda CreateLambda() => new(_observer, _dataTable);

    // ---------------------------------------------------------------- statuses

    [Fact]
    public async Task WhenCaptainInviteIsAccepted_ReturnsAccepted()
    {
        _dataTable.Seed(CreateCaptainInvite("11111111", "Morpeth 9", acceptedAt: 1786000000));

        var result = await CreateLambda().HandleAsync(CreateRequest("Morpeth 9"), ManagerClaims(), _context);

        var entry = result.Teams.Should().ContainSingle().Subject;
        entry.Status.Should().Be(TeamRegistrationStatus.ACCEPTED);
        entry.NanoId.Should().Be("11111111");
        entry.AcceptedAt.Should().Be(1786000000);
    }

    [Fact]
    public async Task WhenCaptainInviteIsNotAccepted_ReturnsPendingWithNullAcceptedAt()
    {
        _dataTable.Seed(CreateCaptainInvite("22222222", "Morpeth 9", acceptedAt: null));

        var result = await CreateLambda().HandleAsync(CreateRequest("Morpeth 9"), ManagerClaims(), _context);

        var entry = result.Teams.Should().ContainSingle().Subject;
        entry.Status.Should().Be(TeamRegistrationStatus.PENDING);
        entry.NanoId.Should().Be("22222222");
        entry.AcceptedAt.Should().BeNull();
    }

    [Fact]
    public async Task WhenNoCaptainInviteExists_ReturnsNotInvitedWithNoInviteFields()
    {
        var result = await CreateLambda().HandleAsync(CreateRequest("Morpeth 9"), ManagerClaims(), _context);

        var entry = result.Teams.Should().ContainSingle().Subject;
        entry.Status.Should().Be(TeamRegistrationStatus.NOT_INVITED);
        entry.NanoId.Should().BeNull();
        entry.InviteeName.Should().BeNull();
        entry.InviteeEmailId.Should().BeNull();
        entry.CreatedAt.Should().BeNull();
        entry.AcceptedAt.Should().BeNull();
    }

    // A PLAYER invite for the team must not make the team look registered — only a CAPTAIN counts.
    [Fact]
    public async Task WhenOnlyAPlayerInviteExists_ReturnsNotInvited()
    {
        _dataTable.Seed(CreatePlayerInvite("33333333", "Morpeth 9"));

        var result = await CreateLambda().HandleAsync(CreateRequest("Morpeth 9"), ManagerClaims(), _context);

        result.Teams.Should().ContainSingle().Which.Status.Should().Be(TeamRegistrationStatus.NOT_INVITED);
    }

    // ---------------------------------------------------------------- the left join

    [Fact]
    public async Task ReturnsOneEntryPerRequestedTeam_InTheCallersOrder()
    {
        _dataTable.Seed(CreateCaptainInvite("11111111", "Morpeth 9", acceptedAt: 1786000000));
        _dataTable.Seed(CreateCaptainInvite("22222222", "Morpeth 11", acceptedAt: null));

        var result = await CreateLambda().HandleAsync(
            CreateRequest("Morpeth 11", "Morpeth 12", "Morpeth 9"), ManagerClaims(), _context);

        result.Teams.Select(t => t.TeamName).Should().Equal("Morpeth 11", "Morpeth 12", "Morpeth 9");
        result.Teams.Select(t => t.Status).Should().Equal(
            TeamRegistrationStatus.PENDING,
            TeamRegistrationStatus.NOT_INVITED,
            TeamRegistrationStatus.ACCEPTED);
    }

    [Fact]
    public async Task EchoesTheRequestsLeagueSeasonAndClubIdentity()
    {
        var result = await CreateLambda().HandleAsync(CreateRequest("Morpeth 9"), ManagerClaims(), _context);

        result.League.Should().Be(League);
        result.Season.Should().Be(Season);
        result.ClubName.Should().Be(ClubName);
        result.ClubLocation.Should().Be(ClubLocation);
    }

    // ---------------------------------------------------------------- matching semantics
    //
    // Matching is case-insensitive and ignores surrounding whitespace, but NOTHING else: it is not a
    // prefix match and punctuation still counts. Pinned in BOTH directions on purpose — the forgiving
    // tests alone would still pass if matching became fuzzy, and the strict ones alone would still
    // pass if matching stopped working altogether.

    [Fact]
    public async Task TeamNameMatchingIsCaseInsensitive_LowercaseStillMatches()
    {
        _dataTable.Seed(CreateCaptainInvite("11111111", "Morpeth 9", acceptedAt: 1786000000));

        var result = await CreateLambda().HandleAsync(CreateRequest("morpeth 9"), ManagerClaims(), _context);

        result.Teams.Should().ContainSingle().Which.Status.Should().Be(TeamRegistrationStatus.ACCEPTED);
    }

    [Fact]
    public async Task TeamNameMatchingIgnoresWhitespaceAroundTheRequestedName()
    {
        _dataTable.Seed(CreateCaptainInvite("11111111", "Morpeth 9", acceptedAt: 1786000000));

        var result = await CreateLambda().HandleAsync(CreateRequest("  Morpeth 9  "), ManagerClaims(), _context);

        result.Teams.Should().ContainSingle().Which.Status.Should().Be(TeamRegistrationStatus.ACCEPTED);
    }

    [Fact]
    public async Task TeamNameMatchingIgnoresWhitespaceAroundTheStoredName()
    {
        // No frontend feature currently implemented in this codebase creates invites, so the stored
        // spelling is hand-typed and may carry stray whitespace that only a non-empty rule ever checked.
        _dataTable.Seed(CreateCaptainInvite("11111111", "  Morpeth 9  ", acceptedAt: 1786000000));

        var result = await CreateLambda().HandleAsync(CreateRequest("Morpeth 9"), ManagerClaims(), _context);

        result.Teams.Should().ContainSingle().Which.Status.Should().Be(TeamRegistrationStatus.ACCEPTED);
    }

    [Fact]
    public async Task TeamNameMatchingStillDistinguishesPunctuation()
    {
        _dataTable.Seed(CreateCaptainInvite("11111111", "St Katharine's Trust 2", acceptedAt: 1786000000));

        // A curly apostrophe is a different character; forgiving case and whitespace does not make
        // matching fuzzy.
        var result = await CreateLambda().HandleAsync(CreateRequest("St Katharine’s Trust 2"), ManagerClaims(), _context);

        result.Teams.Should().ContainSingle().Which.Status.Should().Be(TeamRegistrationStatus.NOT_INVITED);
    }

    [Fact]
    public async Task TeamNameMatchingIsExact_TheSameSpellingDoesMatch()
    {
        _dataTable.Seed(CreateCaptainInvite("11111111", "Morpeth 9", acceptedAt: 1786000000));

        var result = await CreateLambda().HandleAsync(CreateRequest("Morpeth 9"), ManagerClaims(), _context);

        result.Teams.Should().ContainSingle().Which.Status.Should().Be(TeamRegistrationStatus.ACCEPTED);
    }

    [Fact]
    public async Task TeamNameMatchingIsNotAPrefixMatch()
    {
        _dataTable.Seed(CreateCaptainInvite("11111111", "Morpeth 9", acceptedAt: 1786000000));

        var result = await CreateLambda().HandleAsync(CreateRequest("Morpeth 99"), ManagerClaims(), _context);

        result.Teams.Should().ContainSingle().Which.Status.Should().Be(TeamRegistrationStatus.NOT_INVITED);
    }

    [Fact]
    public async Task TheResponseEchoesTheCallersSpellingNotTheStoredOne()
    {
        _dataTable.Seed(CreateCaptainInvite("11111111", "Morpeth 9", acceptedAt: 1786000000));

        var result = await CreateLambda().HandleAsync(CreateRequest("morpeth 9"), ManagerClaims(), _context);

        // The invite IS found now that matching is case-insensitive, but the entry is still spelled
        // the way the caller asked, so the page can join it back to its own team list.
        result.Teams.Should().ContainSingle().Which.TeamName.Should().Be("morpeth 9");
    }

    // ---------------------------------------------------------------- duplicate captains

    [Fact]
    public async Task WhenTwoCaptainInvitesExist_PrefersTheAcceptedOne()
    {
        _dataTable.Seed(CreateCaptainInvite("11111111", "Morpeth 9", acceptedAt: null, createdAt: 2000));
        _dataTable.Seed(CreateCaptainInvite("22222222", "Morpeth 9", acceptedAt: 1786000000, createdAt: 1000));

        var result = await CreateLambda().HandleAsync(CreateRequest("Morpeth 9"), ManagerClaims(), _context);

        var entry = result.Teams.Should().ContainSingle().Subject;
        entry.Status.Should().Be(TeamRegistrationStatus.ACCEPTED);
        // The accepted one wins even though the pending one was created later.
        entry.NanoId.Should().Be("22222222");
    }

    [Fact]
    public async Task WhenTwoUnacceptedCaptainInvitesExist_PrefersTheNewest()
    {
        _dataTable.Seed(CreateCaptainInvite("11111111", "Morpeth 9", acceptedAt: null, createdAt: 1000));
        _dataTable.Seed(CreateCaptainInvite("22222222", "Morpeth 9", acceptedAt: null, createdAt: 2000));

        var result = await CreateLambda().HandleAsync(CreateRequest("Morpeth 9"), ManagerClaims(), _context);

        var entry = result.Teams.Should().ContainSingle().Subject;
        entry.Status.Should().Be(TeamRegistrationStatus.PENDING);
        entry.NanoId.Should().Be("22222222");
    }

    [Fact]
    public async Task WhenTwoCaptainInvitesExist_EmitsAWarningNamingTheTeamAndBothIds()
    {
        _dataTable.Seed(CreateCaptainInvite("11111111", "Morpeth 9", acceptedAt: null, createdAt: 1000));
        _dataTable.Seed(CreateCaptainInvite("22222222", "Morpeth 9", acceptedAt: null, createdAt: 2000));

        await CreateLambda().HandleAsync(CreateRequest("Morpeth 9"), ManagerClaims(), _context);

        var warning = _observer.RuntimeIrregularEvents.Should().ContainSingle().Subject;
        warning.EventName.Should().Be("DUPLICATE CAPTAIN INVITES FOR TEAM");
        warning.Parameters!["team_name"].Should().Be("Morpeth 9");
        warning.Parameters["invites_count"].Should().Be("2");
        warning.Parameters["nano_ids"].Should().Be("11111111,22222222");
    }

    [Fact]
    public async Task WhenOnlyOneCaptainInviteExists_EmitsNoWarning()
    {
        _dataTable.Seed(CreateCaptainInvite("11111111", "Morpeth 9", acceptedAt: null));

        await CreateLambda().HandleAsync(CreateRequest("Morpeth 9"), ManagerClaims(), _context);

        _observer.RuntimeIrregularEvents.Should().BeEmpty();
    }

    // ---------------------------------------------------------------- security: LOG AND CONTINUE
    //
    // Every one of these asserts BOTH halves: the security error was observed, AND nothing was thrown
    // and the data came back anyway. Asserting only the first would still pass if the lambda started
    // returning 403, which is not what this system does.

    [Fact]
    public async Task WhenClaimsHaveNoManagedClubs_LogsSecurityValidationExceptionAndContinues()
    {
        _dataTable.Seed(CreateCaptainInvite("11111111", "Morpeth 9", acceptedAt: 1786000000));

        var result = await CreateLambda().HandleAsync(CreateRequest("Morpeth 9"), new Dictionary<string, string>(), _context);

        _observer.SecurityErrors.Should().ContainSingle().Which.Should().BeOfType<SecurityValidationException>();
        result.Teams.Should().ContainSingle().Which.Status.Should().Be(TeamRegistrationStatus.ACCEPTED);
    }

    [Fact]
    public async Task WhenClaimsAreMalformed_LogsSecurityValidationExceptionAndContinues()
    {
        _dataTable.Seed(CreateCaptainInvite("11111111", "Morpeth 9", acceptedAt: 1786000000));

        var claims = new Dictionary<string, string> { ["custom:managed_clubs"] = "INVALID_JSON" };

        var result = await CreateLambda().HandleAsync(CreateRequest("Morpeth 9"), claims, _context);

        _observer.SecurityErrors.Should().ContainSingle().Which.Should().BeOfType<SecurityValidationException>();
        result.Teams.Should().ContainSingle().Which.Status.Should().Be(TeamRegistrationStatus.ACCEPTED);
    }

    [Fact]
    public async Task WhenUserManagesADifferentClub_LogsSecurityValidationExceptionAndContinues()
    {
        _dataTable.Seed(CreateCaptainInvite("11111111", "Morpeth 9", acceptedAt: 1786000000));

        var claims = ManagerClaims(clubName: "Some Other Club");

        var result = await CreateLambda().HandleAsync(CreateRequest("Morpeth 9"), claims, _context);

        _observer.SecurityErrors.Should().ContainSingle().Which.Should().BeOfType<SecurityValidationException>();
        result.Teams.Should().ContainSingle().Which.Status.Should().Be(TeamRegistrationStatus.ACCEPTED);
    }

    // The behaviour the 5-argument overload ADDS. The 3-argument form used by the promotion features
    // would pass both of these — it never looks at league or season.

    [Fact]
    public async Task WhenUserManagesTheClubInADifferentLeague_LogsSecurityValidationExceptionAndContinues()
    {
        _dataTable.Seed(CreateCaptainInvite("11111111", "Morpeth 9", acceptedAt: 1786000000));

        var claims = ManagerClaims(league: "SOME-OTHER-LEAGUE");

        var result = await CreateLambda().HandleAsync(CreateRequest("Morpeth 9"), claims, _context);

        _observer.SecurityErrors.Should().ContainSingle().Which.Should().BeOfType<SecurityValidationException>();
        result.Teams.Should().ContainSingle().Which.Status.Should().Be(TeamRegistrationStatus.ACCEPTED);
    }

    [Fact]
    public async Task WhenUserManagesTheClubInADifferentSeason_LogsSecurityValidationExceptionAndContinues()
    {
        _dataTable.Seed(CreateCaptainInvite("11111111", "Morpeth 9", acceptedAt: 1786000000));

        var claims = ManagerClaims(season: "2024-2025");

        var result = await CreateLambda().HandleAsync(CreateRequest("Morpeth 9"), claims, _context);

        _observer.SecurityErrors.Should().ContainSingle().Which.Should().BeOfType<SecurityValidationException>();
        result.Teams.Should().ContainSingle().Which.Status.Should().Be(TeamRegistrationStatus.ACCEPTED);
    }

    [Fact]
    public async Task WhenUserManagesThisClubThisLeagueAndSeason_LogsNoSecurityError()
    {
        _dataTable.Seed(CreateCaptainInvite("11111111", "Morpeth 9", acceptedAt: 1786000000));

        await CreateLambda().HandleAsync(CreateRequest("Morpeth 9"), ManagerClaims(), _context);

        _observer.SecurityErrors.Should().BeEmpty();
    }

    // ---------------------------------------------------------------- validation and errors

    [Theory]
    [InlineData("", Season, ClubName, ClubLocation)]
    [InlineData(League, "", ClubName, ClubLocation)]
    [InlineData(League, Season, "", ClubLocation)]
    [InlineData(League, Season, ClubName, "")]
    public async Task WhenARequiredFieldIsMissing_Throws(string league, string season, string clubName, string clubLocation)
    {
        var request = new TeamRegistrationsRequest
        {
            League = league,
            Season = season,
            ClubName = clubName,
            ClubLocation = clubLocation,
            TeamNames = new() { "Morpeth 9" }
        };

        var act = async () => await CreateLambda().HandleAsync(request, ManagerClaims(), _context);

        await act.Should().ThrowAsync<ValidationException>();
    }

    [Fact]
    public async Task WhenTeamNamesIsEmpty_Throws()
    {
        var act = async () => await CreateLambda().HandleAsync(CreateRequest(), ManagerClaims(), _context);

        await act.Should().ThrowAsync<ValidationException>();
    }

    [Fact]
    public async Task WhenATeamNameIsBlank_Throws()
    {
        var act = async () => await CreateLambda().HandleAsync(CreateRequest("Morpeth 9", "   "), ManagerClaims(), _context);

        await act.Should().ThrowAsync<ValidationException>();
    }

    [Fact]
    public async Task WhenTheDatastoreThrows_ObservesTheRuntimeErrorAndRethrows()
    {
        _dataTable.ThrowOnceOnRetrieveCaptainInvitesForTeams = new InvalidOperationException("boom");

        var act = async () => await CreateLambda().HandleAsync(CreateRequest("Morpeth 9"), ManagerClaims(), _context);

        await act.Should().ThrowAsync<InvalidOperationException>().WithMessage("boom");
        _observer.RuntimeErrors.Should().ContainSingle().Which.Should().BeOfType<InvalidOperationException>();
    }

    // ---------------------------------------------------------------- test data

    private static TeamRegistrationsRequest CreateRequest(params string[] teamNames)
        => new()
        {
            League = League,
            Season = Season,
            ClubName = ClubName,
            ClubLocation = ClubLocation,
            TeamNames = teamNames.ToList()
        };

    private static Dictionary<string, string> ManagerClaims(
        string league = League, string season = Season,
        string clubName = ClubName, string clubLocation = ClubLocation)
        => new()
        {
            ["custom:managed_clubs"] =
                $"[{{\"league\":\"{league}\",\"season\":\"{season}\",\"club_name\":\"{clubName}\"," +
                $"\"club_location\":\"{clubLocation}\",\"manager_name\":\"Test Manager\"}}]"
        };

    private static CaptainOrPlayerInvite CreateCaptainInvite(
        string nanoId, string inviteeTeam, long? acceptedAt, long createdAt = 1000)
        => new()
        {
            NanoId = nanoId,
            InviteeName = "Test Captain",
            InviteeEmailId = "captain@example.com",
            InviteeRole = Role.CAPTAIN,
            InviteeTeam = inviteeTeam,
            TeamDivision = "Division 4",
            League = League,
            Season = Season,
            InvitedBy = "Test Inviter",
            CreatedAt = createdAt,
            AcceptedAt = acceptedAt
        };

    private static CaptainOrPlayerInvite CreatePlayerInvite(string nanoId, string inviteeTeam)
        => new()
        {
            NanoId = nanoId,
            InviteeName = "Test Player",
            InviteeEmailId = "player@example.com",
            InviteeRole = Role.PLAYER,
            InviteeTeam = inviteeTeam,
            TeamDivision = "Division 4",
            League = League,
            Season = Season,
            InvitedBy = "Test Inviter",
            CreatedAt = 1000,
            AcceptedAt = null
        };
}

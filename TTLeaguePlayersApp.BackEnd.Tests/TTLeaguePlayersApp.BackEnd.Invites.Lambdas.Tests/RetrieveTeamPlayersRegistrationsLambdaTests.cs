using Amazon.Lambda.TestUtilities;
using FluentAssertions;
using TTLeaguePlayersApp.BackEnd.Invites.DataStore;
using TTLeaguePlayersApp.BackEnd.Tests;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.Invites.Lambdas.Tests;

public class RetrieveTeamPlayersRegistrationsLambdaTests
{
    private const string League = "CLTTL";
    private const string Season = "2025-2026";
    private const string Division = "Division 4";
    private const string Team = "Morpeth 10";

    private readonly TestLambdaContext _context = new();
    private readonly FakeInvitesDataTable _dataTable = new();
    private readonly SpyLoggerObserver _observer = new();

    private RetrieveTeamPlayersRegistrationsLambda CreateLambda() => new(_observer, _dataTable);

    // ---------------------------------------------------------------- statuses

    [Fact]
    public async Task WhenTheInviteIsAccepted_ReturnsAccepted()
    {
        _dataTable.Seed(CreateInvite("11111111", "Luca Minudel", Role.PLAYER, acceptedAt: 1786000000));

        var result = await CreateLambda().HandleAsync(CreateRequest("Luca Minudel"), CaptainClaims(), _context);

        var entry = result.Players.Should().ContainSingle().Subject;
        entry.Status.Should().Be(TeamRegistrationStatus.ACCEPTED);
        entry.NanoId.Should().Be("11111111");
        entry.AcceptedAt.Should().Be(1786000000);
    }

    [Fact]
    public async Task WhenTheInviteIsNotAccepted_ReturnsPendingWithNullAcceptedAt()
    {
        _dataTable.Seed(CreateInvite("22222222", "Luca Minudel", Role.PLAYER, acceptedAt: null));

        var result = await CreateLambda().HandleAsync(CreateRequest("Luca Minudel"), CaptainClaims(), _context);

        var entry = result.Players.Should().ContainSingle().Subject;
        entry.Status.Should().Be(TeamRegistrationStatus.PENDING);
        entry.NanoId.Should().Be("22222222");
        entry.AcceptedAt.Should().BeNull();
    }

    [Fact]
    public async Task WhenNoInviteExists_ReturnsNotInvitedWithNoInviteFields()
    {
        var result = await CreateLambda().HandleAsync(CreateRequest("Luca Minudel"), CaptainClaims(), _context);

        var entry = result.Players.Should().ContainSingle().Subject;
        entry.PlayerName.Should().Be("Luca Minudel");
        entry.Status.Should().Be(TeamRegistrationStatus.NOT_INVITED);
        entry.InviteeRole.Should().BeNull();
        entry.NanoId.Should().BeNull();
        entry.InviteeName.Should().BeNull();
        entry.InviteeEmailId.Should().BeNull();
        entry.CreatedAt.Should().BeNull();
        entry.AcceptedAt.Should().BeNull();
    }

    // ---------------------------------------------------------------- invitee_role echoed

    [Fact]
    public async Task APlayerInvite_ReportsInviteeRolePlayer()
    {
        _dataTable.Seed(CreateInvite("11111111", "Luca Minudel", Role.PLAYER, acceptedAt: null));

        var result = await CreateLambda().HandleAsync(CreateRequest("Luca Minudel"), CaptainClaims(), _context);

        result.Players.Should().ContainSingle().Which.InviteeRole.Should().Be(Role.PLAYER);
    }

    // The captain's own row is reported like everyone else's — same status rule, role says CAPTAIN.
    [Fact]
    public async Task ACaptainInvite_ReportsInviteeRoleCaptain()
    {
        _dataTable.Seed(CreateInvite("11111111", "Test Captain", Role.CAPTAIN, acceptedAt: 1786000000));

        var result = await CreateLambda().HandleAsync(CreateRequest("Test Captain"), CaptainClaims(), _context);

        var entry = result.Players.Should().ContainSingle().Subject;
        entry.InviteeRole.Should().Be(Role.CAPTAIN);
        entry.Status.Should().Be(TeamRegistrationStatus.ACCEPTED);
    }

    // ---------------------------------------------------------------- the left join over the caller's list

    [Fact]
    public async Task ReturnsOneEntryPerRequestedPlayer_InTheCallersOrder()
    {
        _dataTable.Seed(CreateInvite("11111111", "Alice", Role.PLAYER, acceptedAt: 1786000000));
        _dataTable.Seed(CreateInvite("22222222", "Carol", Role.PLAYER, acceptedAt: null));

        var result = await CreateLambda().HandleAsync(CreateRequest("Carol", "Bob", "Alice"), CaptainClaims(), _context);

        result.Players.Select(p => p.PlayerName).Should().Equal("Carol", "Bob", "Alice");
        result.Players.Select(p => p.Status).Should().Equal(
            TeamRegistrationStatus.PENDING, TeamRegistrationStatus.NOT_INVITED, TeamRegistrationStatus.ACCEPTED);
    }

    [Fact]
    public async Task TheResponseEchoesTheRequest()
    {
        var result = await CreateLambda().HandleAsync(CreateRequest("Luca Minudel"), CaptainClaims(), _context);

        result.League.Should().Be(League);
        result.Season.Should().Be(Season);
        result.TeamDivision.Should().Be(Division);
        result.TeamName.Should().Be(Team);
    }

    [Fact]
    public async Task TheEntryEchoesTheCallersSpelling_AndReportsTheStoredOneAsInviteeName()
    {
        _dataTable.Seed(CreateInvite("11111111", "Luca Minudel", Role.PLAYER, acceptedAt: null));

        var result = await CreateLambda().HandleAsync(CreateRequest("  luca minudel "), CaptainClaims(), _context);

        var entry = result.Players.Should().ContainSingle().Subject;
        entry.PlayerName.Should().Be("  luca minudel ");
        entry.InviteeName.Should().Be("Luca Minudel");
        entry.Status.Should().Be(TeamRegistrationStatus.PENDING);
    }

    // ---------------------------------------------------------------- name matching
    //
    // The same rule the team match uses: case-insensitive, whitespace around either spelling
    // ignored, and nothing more forgiving than that.

    [Fact]
    public async Task NameMatchingIsCaseInsensitive()
    {
        _dataTable.Seed(CreateInvite("11111111", "Luca Minudel", Role.PLAYER, acceptedAt: 1786000000));

        var result = await CreateLambda().HandleAsync(CreateRequest("LUCA MINUDEL"), CaptainClaims(), _context);

        result.Players.Should().ContainSingle().Which.Status.Should().Be(TeamRegistrationStatus.ACCEPTED);
    }

    [Fact]
    public async Task NameMatchingIgnoresWhitespaceAroundTheStoredName()
    {
        _dataTable.Seed(CreateInvite("11111111", "  Luca Minudel  ", Role.PLAYER, acceptedAt: 1786000000));

        var result = await CreateLambda().HandleAsync(CreateRequest("Luca Minudel"), CaptainClaims(), _context);

        result.Players.Should().ContainSingle().Which.Status.Should().Be(TeamRegistrationStatus.ACCEPTED);
    }

    [Fact]
    public async Task NameMatchingStillDistinguishesPunctuation()
    {
        _dataTable.Seed(CreateInvite("11111111", "Michele De Giovanni", Role.PLAYER, acceptedAt: 1786000000));

        var result = await CreateLambda().HandleAsync(CreateRequest("Michele De-Giovanni"), CaptainClaims(), _context);

        // The requested spelling is NOT_INVITED, and the stored one surfaces as an extra (below).
        result.Players.First().Status.Should().Be(TeamRegistrationStatus.NOT_INVITED);
    }

    [Fact]
    public async Task NameMatchingIsNotAPrefixMatch()
    {
        _dataTable.Seed(CreateInvite("11111111", "Luca Minudel", Role.PLAYER, acceptedAt: 1786000000));

        var result = await CreateLambda().HandleAsync(CreateRequest("Luca"), CaptainClaims(), _context);

        result.Players.First().Status.Should().Be(TeamRegistrationStatus.NOT_INVITED);
    }

    // ---------------------------------------------------------------- the extras: the right side of the outer join
    //
    // An invite of the team whose invitee_name matches no requested player still comes back, after
    // the requested entries, with NO player_name — its absence is what marks "not from your list".

    [Fact]
    public async Task AnInviteForANameNotRequested_IsReturnedAsAnExtraAfterTheRequestedOnes()
    {
        _dataTable.Seed(CreateInvite("99999999", "Michele De Giovanni", Role.PLAYER, acceptedAt: null));

        var result = await CreateLambda().HandleAsync(CreateRequest("Luca Minudel"), CaptainClaims(), _context);

        result.Players.Should().HaveCount(2);
        result.Players[0].PlayerName.Should().Be("Luca Minudel");
        result.Players[0].Status.Should().Be(TeamRegistrationStatus.NOT_INVITED);

        var extra = result.Players[1];
        extra.PlayerName.Should().BeNull();
        extra.Status.Should().Be(TeamRegistrationStatus.PENDING);
        extra.InviteeRole.Should().Be(Role.PLAYER);
        extra.NanoId.Should().Be("99999999");
        extra.InviteeName.Should().Be("Michele De Giovanni");
        extra.InviteeEmailId.Should().NotBeNullOrEmpty();
        extra.CreatedAt.Should().Be(1000);
    }

    [Fact]
    public async Task AnExtraIsNeverNotInvited()
    {
        _dataTable.Seed(CreateInvite("88888888", "Someone Else", Role.PLAYER, acceptedAt: 1786000000));
        _dataTable.Seed(CreateInvite("99999999", "Another One", Role.PLAYER, acceptedAt: null));

        var result = await CreateLambda().HandleAsync(CreateRequest("Luca Minudel"), CaptainClaims(), _context);

        result.Players.Where(p => p.PlayerName is null)
            .Should().HaveCount(2)
            .And.OnlyContain(p => p.Status != TeamRegistrationStatus.NOT_INVITED);
    }

    [Fact]
    public async Task ExtrasAreOrderedByCreatedAtAscending()
    {
        _dataTable.Seed(CreateInvite("22222222", "Newer Extra", Role.PLAYER, acceptedAt: null, createdAt: 2000));
        _dataTable.Seed(CreateInvite("11111111", "Older Extra", Role.PLAYER, acceptedAt: null, createdAt: 1000));

        var result = await CreateLambda().HandleAsync(CreateRequest("Luca Minudel"), CaptainClaims(), _context);

        result.Players.Skip(1).Select(p => p.NanoId).Should().Equal("11111111", "22222222");
    }

    [Fact]
    public async Task AMatchedInviteIsNotRepeatedAsAnExtra()
    {
        _dataTable.Seed(CreateInvite("11111111", "Luca Minudel", Role.PLAYER, acceptedAt: null));

        var result = await CreateLambda().HandleAsync(CreateRequest("luca minudel"), CaptainClaims(), _context);

        result.Players.Should().ContainSingle();
    }

    // The datastore already scopes the query to the one team; the fake mirrors that, so an invite of
    // another team must not appear even as an extra.
    [Fact]
    public async Task InvitesOfAnotherTeam_AreNotReturnedAsExtras()
    {
        _dataTable.Seed(CreateInvite("11111111", "Other Team Player", Role.PLAYER, acceptedAt: null, team: "Morpeth 9"));

        var result = await CreateLambda().HandleAsync(CreateRequest("Luca Minudel"), CaptainClaims(), _context);

        result.Players.Should().ContainSingle().Which.Status.Should().Be(TeamRegistrationStatus.NOT_INVITED);
    }

    // ---------------------------------------------------------------- duplicate invites for one person

    [Fact]
    public async Task WhenTwoInvitesExistForOnePerson_PrefersTheAcceptedOne()
    {
        _dataTable.Seed(CreateInvite("11111111", "Luca Minudel", Role.PLAYER, acceptedAt: null, createdAt: 2000));
        _dataTable.Seed(CreateInvite("22222222", "Luca Minudel", Role.PLAYER, acceptedAt: 1786000000, createdAt: 1000));

        var result = await CreateLambda().HandleAsync(CreateRequest("Luca Minudel"), CaptainClaims(), _context);

        var entry = result.Players.Should().ContainSingle().Subject;
        entry.Status.Should().Be(TeamRegistrationStatus.ACCEPTED);
        entry.NanoId.Should().Be("22222222");
    }

    [Fact]
    public async Task WhenTwoUnacceptedInvitesExistForOnePerson_PrefersTheNewest()
    {
        _dataTable.Seed(CreateInvite("11111111", "Luca Minudel", Role.PLAYER, acceptedAt: null, createdAt: 1000));
        _dataTable.Seed(CreateInvite("22222222", "Luca Minudel", Role.PLAYER, acceptedAt: null, createdAt: 2000));

        var result = await CreateLambda().HandleAsync(CreateRequest("Luca Minudel"), CaptainClaims(), _context);

        var entry = result.Players.Should().ContainSingle().Subject;
        entry.Status.Should().Be(TeamRegistrationStatus.PENDING);
        entry.NanoId.Should().Be("22222222");
    }

    // ---------------------------------------------------------------- security: LOG AND CONTINUE
    //
    // As for the club-teams endpoint: every case asserts BOTH halves — the security error was
    // observed, AND the data came back anyway. This system does not return 403.

    [Fact]
    public async Task WhenClaimsHaveNoActiveSeasons_LogsSecurityValidationExceptionAndContinues()
    {
        _dataTable.Seed(CreateInvite("11111111", "Luca Minudel", Role.PLAYER, acceptedAt: 1786000000));

        var result = await CreateLambda().HandleAsync(CreateRequest("Luca Minudel"), new Dictionary<string, string>(), _context);

        _observer.SecurityErrors.Should().ContainSingle().Which.Should().BeOfType<SecurityValidationException>();
        result.Players.Should().ContainSingle().Which.Status.Should().Be(TeamRegistrationStatus.ACCEPTED);
    }

    [Fact]
    public async Task WhenClaimsAreMalformed_LogsSecurityValidationExceptionAndContinues()
    {
        _dataTable.Seed(CreateInvite("11111111", "Luca Minudel", Role.PLAYER, acceptedAt: 1786000000));
        var claims = new Dictionary<string, string> { ["custom:active_seasons"] = "{ not json" };

        var result = await CreateLambda().HandleAsync(CreateRequest("Luca Minudel"), claims, _context);

        _observer.SecurityErrors.Should().ContainSingle().Which.Should().BeOfType<SecurityValidationException>();
        result.Players.Should().ContainSingle().Which.Status.Should().Be(TeamRegistrationStatus.ACCEPTED);
    }

    // The gap ActiveSessionSecurityCheck leaves open: a PLAYER of the very team is not its captain.
    [Fact]
    public async Task WhenTheCallerIsAPlayerOfTheTeam_LogsSecurityValidationExceptionAndContinues()
    {
        _dataTable.Seed(CreateInvite("11111111", "Luca Minudel", Role.PLAYER, acceptedAt: 1786000000));

        var result = await CreateLambda().HandleAsync(CreateRequest("Luca Minudel"), CaptainClaims(role: "PLAYER"), _context);

        _observer.SecurityErrors.Should().ContainSingle().Which.Should().BeOfType<SecurityValidationException>();
        result.Players.Should().ContainSingle().Which.Status.Should().Be(TeamRegistrationStatus.ACCEPTED);
    }

    [Theory]
    [InlineData("Other League", Season, Division, Team)]
    [InlineData(League, "2024-2025", Division, Team)]
    [InlineData(League, Season, "Division 3", Team)]
    [InlineData(League, Season, Division, "Morpeth 9")]
    public async Task WhenTheCallerIsCaptainElsewhere_LogsSecurityValidationExceptionAndContinues(
        string league, string season, string division, string team)
    {
        _dataTable.Seed(CreateInvite("11111111", "Luca Minudel", Role.PLAYER, acceptedAt: 1786000000));

        var result = await CreateLambda().HandleAsync(
            CreateRequest("Luca Minudel"), CaptainClaims(league, season, division, team), _context);

        _observer.SecurityErrors.Should().ContainSingle().Which.Should().BeOfType<SecurityValidationException>();
        result.Players.Should().ContainSingle().Which.Status.Should().Be(TeamRegistrationStatus.ACCEPTED);
    }

    [Fact]
    public async Task WhenTheCallerIsTheCaptainOfTheTeam_LogsNoSecurityError()
    {
        await CreateLambda().HandleAsync(CreateRequest("Luca Minudel"), CaptainClaims(), _context);

        _observer.SecurityErrors.Should().BeEmpty();
    }

    [Fact]
    public async Task TheCaptainClaimMatchIsCaseInsensitive()
    {
        await CreateLambda().HandleAsync(
            CreateRequest("Luca Minudel"), CaptainClaims("clttl", Season, "division 4", "MORPETH 10", "captain"), _context);

        _observer.SecurityErrors.Should().BeEmpty();
    }

    // ---------------------------------------------------------------- validation and errors

    [Theory]
    [InlineData("", Season, Division, Team)]
    [InlineData(League, "", Division, Team)]
    [InlineData(League, Season, "", Team)]
    [InlineData(League, Season, Division, "")]
    public async Task WhenARequiredFieldIsMissing_Throws(string league, string season, string division, string team)
    {
        var request = new TeamPlayersRegistrationsRequest
        {
            League = league,
            Season = season,
            TeamDivision = division,
            TeamName = team,
            PlayerNames = new() { "Luca Minudel" }
        };

        var act = async () => await CreateLambda().HandleAsync(request, CaptainClaims(), _context);

        await act.Should().ThrowAsync<ValidationException>();
    }

    [Fact]
    public async Task WhenPlayerNamesIsEmpty_Throws()
    {
        var act = async () => await CreateLambda().HandleAsync(CreateRequest(), CaptainClaims(), _context);

        await act.Should().ThrowAsync<ValidationException>();
    }

    [Fact]
    public async Task WhenAPlayerNameIsBlank_Throws()
    {
        var act = async () => await CreateLambda().HandleAsync(CreateRequest("Luca Minudel", "   "), CaptainClaims(), _context);

        await act.Should().ThrowAsync<ValidationException>();
    }

    [Fact]
    public async Task WhenTheDatastoreThrows_ObservesTheRuntimeErrorAndRethrows()
    {
        _dataTable.ThrowOnceOnRetrievePlayersInvitesForTeam = new InvalidOperationException("boom");

        var act = async () => await CreateLambda().HandleAsync(CreateRequest("Luca Minudel"), CaptainClaims(), _context);

        await act.Should().ThrowAsync<InvalidOperationException>().WithMessage("boom");
        _observer.RuntimeErrors.Should().ContainSingle().Which.Should().BeOfType<InvalidOperationException>();
    }

    // ---------------------------------------------------------------- test data

    private static TeamPlayersRegistrationsRequest CreateRequest(params string[] playerNames)
        => new()
        {
            League = League,
            Season = Season,
            TeamDivision = Division,
            TeamName = Team,
            PlayerNames = playerNames.ToList()
        };

    private static Dictionary<string, string> CaptainClaims(
        string league = League, string season = Season,
        string division = Division, string team = Team, string role = "CAPTAIN")
        => new()
        {
            ["custom:active_seasons"] =
                $"[{{\"league\":\"{league}\",\"season\":\"{season}\",\"team_name\":\"{team}\"," +
                $"\"team_division\":\"{division}\",\"person_name\":\"Test Captain\",\"role\":\"{role}\"}}]"
        };

    private static CaptainOrPlayerInvite CreateInvite(
        string nanoId, string inviteeName, Role role, long? acceptedAt, long createdAt = 1000, string team = Team)
        => new()
        {
            NanoId = nanoId,
            InviteeName = inviteeName,
            InviteeEmailId = $"{nanoId}@example.com",
            InviteeRole = role,
            InviteeTeam = team,
            TeamDivision = Division,
            League = League,
            Season = Season,
            InvitedBy = "Test Inviter",
            CreatedAt = createdAt,
            AcceptedAt = acceptedAt
        };
}

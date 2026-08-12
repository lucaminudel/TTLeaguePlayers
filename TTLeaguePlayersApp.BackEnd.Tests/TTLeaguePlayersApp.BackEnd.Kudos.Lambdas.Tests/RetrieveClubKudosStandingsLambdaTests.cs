using System.Text.Json;
using Amazon.Lambda.TestUtilities;
using FluentAssertions;
using TTLeaguePlayersApp.BackEnd.Tests;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.Kudos.Lambdas.Tests;

// Runs entirely on fakes: no DynamoDB, no Cognito, no network. Hence no [Trait("Environment",
// "Staging")] and no [Trait("Cognito","Live")] anywhere in this class.
public class RetrieveClubKudosStandingsLambdaTests
{
    private readonly TestLambdaContext _context = new();

    [Fact]
    public async Task HandleAsync_CountsMATCHES_NotKudos()
    {
        // THE contract test for the response field names. `positive_count` reads as a count of
        // kudos; it is not. Three summaries with positive kudos in only two of them must score 2,
        // and the middle summary's SIX positive kudos must still contribute exactly 1.
        // A rename to `positive_matches_count` was considered and declined (user, 2026-08-11), so
        // this test is the only guard on that meaning. Do not weaken or delete it.
        var summaries = new List<KudosSummary>
        {
            Summary("Highbury 2", positive: 1, neutral: 0, negative: 0),
            Summary("Highbury 2", positive: 6, neutral: 0, negative: 2),
            Summary("Highbury 2", positive: 0, neutral: 3, negative: 0)
        };

        var result = await Handle(Request(("Highbury 2", "Division 4")), summaries);

        var entry = result.Teams.Single();
        entry.PositiveCount.Should().Be(2, "two of the three matches had at least one positive kudos");
        entry.NeutralCount.Should().Be(1, "only the third match had a neutral kudos");
        entry.NegativeCount.Should().Be(1, "only the second match had a negative kudos");
    }

    [Fact]
    public async Task HandleAsync_ReturnsZeroCounts_ForARequestedTeamWithNoSummaries()
    {
        // The left join. A team nobody has rated has no rows in the table at all, so a response
        // built from the query results alone could never mention it — and the manager would see
        // their club with teams missing rather than with a team on zero.
        var summaries = new List<KudosSummary>
        {
            Summary("Highbury 2", positive: 1, neutral: 0, negative: 0)
        };

        var result = await Handle(
            Request(("Highbury 2", "Division 4"), ("Highbury 3", "Division 4")),
            summaries);

        result.Teams.Should().HaveCount(2);
        var unrated = result.Teams.Single(team => team.TeamName == "Highbury 3");
        unrated.PositiveCount.Should().Be(0);
        unrated.NeutralCount.Should().Be(0);
        unrated.NegativeCount.Should().Be(0);
    }

    [Fact]
    public async Task HandleAsync_ReturnsTeamsInREQUESTOrder_NotSortedByCount()
    {
        // Deliberately unlike GET /kudos/standings, which sorts descending by count. This page
        // mirrors the club page, so the manager finds their teams where they expect them.
        var summaries = new List<KudosSummary>
        {
            Summary("Highbury 1", positive: 1, neutral: 0, negative: 0),
            Summary("Highbury 2", positive: 1, neutral: 0, negative: 0),
            Summary("Highbury 2", positive: 1, neutral: 0, negative: 0),
            Summary("Highbury 2", positive: 1, neutral: 0, negative: 0)
        };

        var result = await Handle(
            Request(("Highbury 1", "Division 4"), ("Highbury 2", "Division 7")),
            summaries);

        result.Teams.Select(team => team.TeamName)
            .Should().ContainInOrder("Highbury 1", "Highbury 2");
        result.Teams[0].PositiveCount.Should().Be(1);
        result.Teams[1].PositiveCount.Should().Be(3);
    }

    [Fact]
    public async Task HandleAsync_AggregatesCorrectly_WhenSummariesArriveInterleavedAndOutOfOrder()
    {
        // The datastore concatenates one query per team and promises no order. RetrieveKudos-
        // StandingsLambda's single-pass loop would restart a team's tally every time it saw the
        // name again and report 1 instead of 2; this lambda groups explicitly, so it must not.
        var summaries = new List<KudosSummary>
        {
            Summary("Highbury 2", positive: 1, neutral: 0, negative: 0),
            Summary("Highbury 3", positive: 1, neutral: 0, negative: 0),
            Summary("Highbury 2", positive: 1, neutral: 0, negative: 0),
            Summary("Highbury 3", positive: 1, neutral: 0, negative: 0)
        };

        var result = await Handle(
            Request(("Highbury 2", "Division 4"), ("Highbury 3", "Division 7")),
            summaries);

        result.Teams.Single(team => team.TeamName == "Highbury 2").PositiveCount.Should().Be(2);
        result.Teams.Single(team => team.TeamName == "Highbury 3").PositiveCount.Should().Be(2);
    }

    [Fact]
    public async Task HandleAsync_IgnoresSummaries_ForATeamThatWasNotRequested()
    {
        // The response is seeded from the request, so a stray row cannot add a team to it.
        var summaries = new List<KudosSummary>
        {
            Summary("Highbury 2", positive: 1, neutral: 0, negative: 0),
            Summary("Some Other Club 1", positive: 5, neutral: 0, negative: 0)
        };

        var result = await Handle(Request(("Highbury 2", "Division 4")), summaries);

        result.Teams.Should().HaveCount(1);
        result.Teams.Single().TeamName.Should().Be("Highbury 2");
    }

    [Fact]
    public async Task HandleAsync_MatchesTeamNamesByteExactly()
    {
        // Standing assumption 2: no case folding, no trimming. Discovery verified that club-page
        // names equal the stored receiving_team byte for byte, so a near-match here means the two
        // sources have genuinely diverged - and 0/0/0 is the honest answer, not a silent repair.
        var summaries = new List<KudosSummary>
        {
            Summary("highbury 2", positive: 1, neutral: 0, negative: 0),
            Summary(" Highbury 2", positive: 1, neutral: 0, negative: 0)
        };

        var result = await Handle(Request(("Highbury 2", "Division 4")), summaries);

        result.Teams.Single().PositiveCount.Should().Be(0);
    }

    [Fact]
    public async Task HandleAsync_PassesEveryRequestedCoupleToTheDataStore_Unchanged()
    {
        // A dropped or reordered couple is invisible in the response: the team simply reads 0/0/0,
        // exactly like a team nobody rated. This asserts on what the lambda ASKED for.
        var fakeDataTable = new FakeKudosDataTable { ClubTeamsSummariesToReturn = new List<KudosSummary>() };
        var lambda = new RetrieveClubKudosStandingsLambda(new SpyLoggerObserver(), fakeDataTable);

        await lambda.HandleAsync(
            Request(("Highbury 2", "Division 4"), ("Highbury 5", "Division 7")),
            ManagerClaims(), _context);

        fakeDataTable.LastRequestedTeams.Should().ContainInOrder(
            ("Division 4", "Highbury 2"),
            ("Division 7", "Highbury 5"));
    }

    [Fact]
    public async Task HandleAsync_WhenTheCallerDoesNotManageTheClub_LogsTheSecurityErrorAndSTILLReturnsTheStandings()
    {
        // Documents decision 7: the check is ADVISORY. This test is what fails, loudly and by
        // design, on the day someone makes it enforcing - at which point the acceptance test and
        // the frontend both need revisiting too.
        var spy = new SpyLoggerObserver();
        var fakeDataTable = new FakeKudosDataTable
        {
            ClubTeamsSummariesToReturn = new List<KudosSummary>
            {
                Summary("Highbury 2", positive: 1, neutral: 0, negative: 0)
            }
        };
        var lambda = new RetrieveClubKudosStandingsLambda(spy, fakeDataTable);

        var result = await lambda.HandleAsync(
            Request(("Highbury 2", "Division 4")), ClaimsForADifferentClub(), _context);

        spy.SecurityErrors.Should().ContainSingle();
        result.Teams.Should().ContainSingle();
        result.Teams.Single().PositiveCount.Should().Be(1);
    }

    [Fact]
    public async Task HandleAsync_WhenTheClaimIsForTheSameClubInADifferentSeason_LogsTheSecurityError()
    {
        // The check is SEASON-scoped, not club-scoped: standings are season data.
        var spy = new SpyLoggerObserver();
        var fakeDataTable = new FakeKudosDataTable { ClubTeamsSummariesToReturn = new List<KudosSummary>() };
        var lambda = new RetrieveClubKudosStandingsLambda(spy, fakeDataTable);

        await lambda.HandleAsync(
            Request(("Highbury 2", "Division 4")), ManagerClaims(season: "2024-2025"), _context);

        spy.SecurityErrors.Should().ContainSingle();
    }

    [Fact]
    public async Task HandleAsync_WhenTheDataStoreThrows_LogsARuntimeErrorAndRethrows()
    {
        var spy = new SpyLoggerObserver();
        var fakeDataTable = new FakeKudosDataTable { ThrowOnRetrieveKudosAwardedToClubTeams = true };
        var lambda = new RetrieveClubKudosStandingsLambda(spy, fakeDataTable);

        await lambda.Invoking(l => l.HandleAsync(
                Request(("Highbury 2", "Division 4")), ManagerClaims(), _context))
            .Should().ThrowAsync<Exception>();

        spy.RuntimeErrors.Should().ContainSingle();
    }

    [Theory]
    [InlineData("", "2025-2026", "Highbury Table Tennis Club", "Islington", "league is required")]
    [InlineData("CLTTL", "", "Highbury Table Tennis Club", "Islington", "season is required")]
    [InlineData("CLTTL", "2025-2026", "", "Islington", "club_name is required")]
    [InlineData("CLTTL", "2025-2026", "Highbury Table Tennis Club", "", "club_location is required")]
    public async Task HandleAsync_ThrowsValidationException_WhenAScalarIsMissing(
        string league, string season, string clubName, string clubLocation, string expectedError)
    {
        var lambda = new RetrieveClubKudosStandingsLambda(new SpyLoggerObserver(), new FakeKudosDataTable());
        var request = Request(("Highbury 2", "Division 4"));
        request.League = league;
        request.Season = season;
        request.ClubName = clubName;
        request.ClubLocation = clubLocation;

        var act = async () => await lambda.HandleAsync(request, ManagerClaims(), _context);

        var exception = await act.Should().ThrowAsync<ValidationException>();
        exception.Which.Errors.Should().Contain(error => error.Contains(expectedError));
    }

    [Fact]
    public async Task HandleAsync_ThrowsValidationException_WhenTheTeamListIsEmpty()
    {
        var lambda = new RetrieveClubKudosStandingsLambda(new SpyLoggerObserver(), new FakeKudosDataTable());
        var request = Request();

        var act = async () => await lambda.HandleAsync(request, ManagerClaims(), _context);

        var exception = await act.Should().ThrowAsync<ValidationException>();
        exception.Which.Errors.Should().Contain(error => error.Contains("teams must contain at least one team"));
    }

    [Fact]
    public async Task HandleAsync_ThrowsValidationException_WhenATeamNameOrDivisionIsBlank()
    {
        var lambda = new RetrieveClubKudosStandingsLambda(new SpyLoggerObserver(), new FakeKudosDataTable());
        var request = Request(("Highbury 2", "Division 4"), ("", ""));

        var act = async () => await lambda.HandleAsync(request, ManagerClaims(), _context);

        var exception = await act.Should().ThrowAsync<ValidationException>();
        exception.Which.Errors.Should().Contain(error => error.Contains("teams must not contain empty team names"));
        exception.Which.Errors.Should().Contain(error => error.Contains("teams must not contain empty team divisions"));
    }

    [Fact]
    public async Task HandleAsync_ValidatesTheREQUEST_EvenWhenTheSecurityCheckFailed()
    {
        // Order matters: the advisory check runs first and does NOT return, so a malformed request
        // from an unauthorised caller must still produce a 400 rather than falling through.
        var spy = new SpyLoggerObserver();
        var lambda = new RetrieveClubKudosStandingsLambda(spy, new FakeKudosDataTable());

        var act = async () => await lambda.HandleAsync(Request(), ClaimsForADifferentClub(), _context);

        await act.Should().ThrowAsync<ValidationException>();
        spy.SecurityErrors.Should().ContainSingle();
    }

    // Builders

    private async Task<ClubKudosStandingsResponse> Handle(
        ClubKudosStandingsRequest request, List<KudosSummary> summaries)
    {
        var fakeDataTable = new FakeKudosDataTable { ClubTeamsSummariesToReturn = summaries };
        var lambda = new RetrieveClubKudosStandingsLambda(new SpyLoggerObserver(), fakeDataTable);

        return await lambda.HandleAsync(request, ManagerClaims(), _context);
    }

    private static ClubKudosStandingsRequest Request(params (string TeamName, string Division)[] teams)
        => new()
        {
            League = "CLTTL",
            Season = "2025-2026",
            ClubName = "Highbury Table Tennis Club",
            ClubLocation = "Islington",
            Teams = teams
                .Select(team => new ClubKudosStandingsTeam { TeamName = team.TeamName, TeamDivision = team.Division })
                .ToList()
        };

    private static KudosSummary Summary(string receivingTeam, int positive, int neutral, int negative)
        => new()
        {
            League = "CLTTL",
            Season = "2025-2026",
            Division = "Division 4",
            ReceivingTeam = receivingTeam,
            MatchDateTime = 1000L,
            HomeTeam = receivingTeam,
            AwayTeam = "Opponent",
            PositiveKudosCount = positive,
            NeutralKudosCount = neutral,
            NegativeKudosCount = negative
        };

    private static Dictionary<string, string> ManagerClaims(string season = "2025-2026")
        => Claims("Highbury Table Tennis Club", "Islington", season);

    private static Dictionary<string, string> ClaimsForADifferentClub()
        => Claims("Walworth Table Tennis Club", "London", "2025-2026");

    private static Dictionary<string, string> Claims(string clubName, string clubLocation, string season)
        => new()
        {
            ["custom:managed_clubs"] = JsonSerializer.Serialize(new[]
            {
                new
                {
                    league = "CLTTL",
                    season,
                    club_name = clubName,
                    club_location = clubLocation,
                    manager_name = "Luca Minudel"
                }
            })
        };
}

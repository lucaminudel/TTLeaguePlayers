using TTLeaguePlayersApp.BackEnd.Strategy.Lambdas;
using TTLeaguePlayersApp.BackEnd.Strategy.TT365;
using TTLeaguePlayersApp.BackEnd.Strategy.Lambdas;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.Tests.Strategy.TT365;

public sealed class FixturesParserTests
{
    private readonly CLTTLStrategy2026Parser _parser = new();

    [Fact]
    public void ParsedRosterAndFixture_MatchNamesAndCalculatePlayerResults()
    {
        var division = new Division("Premier");
        foreach (var name in new[] { "A", "B", "C" }) division.Teams.Add(name, new Team(name));
        const string roster = "{\"teamPlayers\":[{\"name\":\"Alex\\u00a0  Smith\"}],\"otherPlayers\":[]}";
        _parser.ParseTeamPlayers(ParserPageImpersonator.FetchTeamPlayers(roster, "1"), division.Teams["A"], division.Teams);
        var html = Page(Division("Premier", Week("05 Oct 2026", "09 Oct 2026",
            Scored("Mon 05 Oct", "A", "B", "6 - 4",
                Players(("aLEX&nbsp; Smith", 2), ("Two", 2), ("Three", 1)), DefaultAway))));
        var fixtures = _parser.ParseDivisionFixtures(html);
        var divisions = new OrderedDictionary<string, Division>(StringComparer.OrdinalIgnoreCase) { ["Premier"] = division };
        var table = new DivisionTable("Premier");
        foreach (var name in division.Teams.Keys) table.TeamsStanding.Add(name, new TeamStanding(0, 0, 0, 0));
        var tables = new OrderedDictionary<string, DivisionTable>(StringComparer.OrdinalIgnoreCase) { ["Premier"] = table };

        var rankingDirectory = Path.Combine(AppContext.BaseDirectory, "Fixtures", "Ranking");
        var rankingRow = File.ReadAllText(Path.Combine(rankingDirectory, "ParserRow.html"))
            .Replace("{{NAME}}", "alex&nbsp;  smith", StringComparison.Ordinal)
            .Replace("{{CURRENT}}", "1200", StringComparison.Ordinal);
        var rankingPage = File.ReadAllText(Path.Combine(rankingDirectory, "ParserPage.html"))
            .Replace("{{ROWS}}", rankingRow, StringComparison.Ordinal);
        var (rankings, _) = _parser.ParseRankingPlayers([ParserPageImpersonator.Fetch("Ranking", rankingPage)]);
        
        new StrategyDataCalculator(divisions).UpdateStrategyDataWith( rankings, tables, fixtures);

        var player = Assert.Single(division.Teams["A"].Players.Values);
        Assert.Equal(1200, player.CurrentRanking);
        Assert.Equal(3, player.RecentSetsPlayed);
        Assert.Equal(200m / 3m, player.RecentWinsPercentage);
        Assert.Equal(200m / 3m, player.RecentStrength);
    }

    [Fact]
    public void ParseDivisionFixtures_ReturnsScoresPlayersAndNormalizedNamesInSourceOrder()
    {
        var html = Page(Division("Division One", Week("05 Oct 2026", "09 Oct 2026",
            Scored("Mon 05 Oct", "North &amp; South 1", "East 1", "6 - 4",
                Players(("Amy &amp; Jo", 2), ("Bea", 2), ("Cee", 1)),
                Players(("Dee", 2), ("Eve", 1), ("Fay", 1))),
            Unplayed("Tue 06 Oct", "A", "B"))),
            Division("Premier", Week("05 Oct 2026", "09 Oct 2026", Unplayed("Wed 07 Oct", "C", "D"))));

        var divisions = _parser.ParseDivisionFixtures(html);

        Assert.Equal(["Division 1", "Premier"], divisions.Keys);
        var fixtures = divisions["division 1"];
        Assert.Equal(2, fixtures.Count);
        var match = fixtures[0];
        Assert.Equal(new DateOnly(2026, 10, 5), match.Date);
        Assert.True(match.Played);
        Assert.Equal("North & South 1", match.HomeTeamName);
        Assert.Equal("East 1", match.AwayTeamName);
        Assert.Equal(6, match.HomeTeamScore);
        Assert.Equal(4, match.AwayTeamScore);
        Assert.Equal(new[] { ("Amy & Jo", 2), ("Bea", 2), ("Cee", 1) }, match.HomeTeamPlayersScore.Select(p => (p.Name, p.Won)));
        Assert.Equal(new[] { ("Dee", 2), ("Eve", 1), ("Fay", 1) }, match.AwayTeamPlayersScore.Select(p => (p.Name, p.Won)));
        Assert.All(match.HomeTeamPlayersScore, player => Assert.Equal(3, player.Played));
        Assert.All(match.AwayTeamPlayersScore, player => Assert.Equal(3, player.Played));
        Assert.Equal("A", fixtures[1].HomeTeamName);
    }

    [Fact]
    public void ParseDivisionFixtures_TreatsPostponedAsUnplayedAndSkipsVoidEvenIfCompleted()
    {
        var html = Page(Division("Premier", Week("05 Oct 2026", "09 Oct 2026",
            Unplayed("Mon 05 Oct", "A", "B"),
            Unplayed("Tue 06 Oct", "C", "D", "<span class='tt-fixture-badge tt-fixture-badge-postponed'>P</span>"),
            Unplayed("Thu 08 Oct", "G", "H", "<span class='tt-fixture-badge tt-fixture-badge-rearranged'>R</span>"),
            Row("Wed 07 Oct", "E", "F", "<span class='tt-fixture-badge tt-fixture-badge-void'>V</span>", rowClass: "tt-fixture-completed"))));

        var fixtures = _parser.ParseDivisionFixtures(html)["Premier"];

        Assert.Equal(3, fixtures.Count);
        Assert.All(fixtures, fixture =>
        {
            Assert.False(fixture.Played);
            Assert.Null(fixture.HomeTeamScore);
            Assert.Null(fixture.AwayTeamScore);
            Assert.Empty(fixture.HomeTeamPlayersScore);
            Assert.Empty(fixture.AwayTeamPlayersScore);
        });
    }

    [Fact]
    public void ParseDivisionFixtures_SkipsHolidayWeeksWithoutFixtures()
    {
        var holiday = "<div class='tt-fixture-week-header'><span>Week 12</span></div><div class='tt-fixture-skipped'>Christmas</div>";
        var html = Page(Division("Premier", holiday, Week("04 Jan 2027", "08 Jan 2027", Unplayed("Mon 04 Jan", "A", "B"))));

        var fixture = Assert.Single(_parser.ParseDivisionFixtures(html)["Premier"]);

        Assert.Equal(new DateOnly(2027, 1, 4), fixture.Date);
    }

    [Fact]
    public void ParseDivisionFixtures_UsesWeekPeriodForBothSidesOfYearRollover()
    {
        var html = Page(Division("Premier", Week("28 Dec 2026", "03 Jan 2027",
            Unplayed("Thu 31 Dec", "A", "B"), Unplayed("Sat 02 Jan", "C", "D"))));

        var fixtures = _parser.ParseDivisionFixtures(html)["Premier"];

        Assert.Equal(new DateOnly(2026, 12, 31), fixtures[0].Date);
        Assert.Equal(new DateOnly(2027, 1, 2), fixtures[1].Date);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void ParseDivisionFixtures_ExcludesForfeitAndRemovesAwardedWinsFromOpponents(bool forfeitAtHome)
    {
        var forfeitSide = Players(("One", 1), ("Forfeit", 0), ("Two", 1));
        var opponent = Players(("Three", 3), ("Four", 2), ("Five", 2));
        var html = Page(Division("Premier", Week("05 Oct 2026", "09 Oct 2026",
            Scored("Mon 05 Oct", "A", "B", forfeitAtHome ? "3 - 7" : "7 - 3",
                forfeitAtHome ? forfeitSide : opponent, forfeitAtHome ? opponent : forfeitSide))));

        var fixture = Assert.Single(_parser.ParseDivisionFixtures(html)["Premier"]);

        Assert.Equal(forfeitAtHome ? 3 : 7, fixture.HomeTeamScore);
        Assert.Equal(forfeitAtHome ? 7 : 3, fixture.AwayTeamScore);
        var forfeitPlayers = forfeitAtHome ? fixture.HomeTeamPlayersScore : fixture.AwayTeamPlayersScore;
        var opponents = forfeitAtHome ? fixture.AwayTeamPlayersScore : fixture.HomeTeamPlayersScore;
        Assert.Equal(new[] { ("One", 1), ("Two", 1) }, forfeitPlayers.Select(p => (p.Name, p.Won)));
        Assert.Equal(new[] { ("Three", 2), ("Four", 1), ("Five", 1) }, opponents.Select(p => (p.Name, p.Won)));
        Assert.All(forfeitPlayers, player => Assert.Equal(3, player.Played));
        Assert.All(opponents, player => Assert.Equal(2, player.Played));
    }

    [Theory]
    [InlineData(1)]
    [InlineData(5)]
    public void ParseDivisionFixtures_AllowsUpToFiveScoredMatchesWithoutPlayerListsInOneDivision(int count)
    {
        var matches = Enumerable.Range(0, count).Select(_ => Scored("Mon 05 Oct", "A", "B", "10 - 0", "", ""))
            .Append(Scored("Tue 06 Oct", "C", "D", "6 - 4", DefaultHome, DefaultAway)).ToArray();
        var html = Page(Division("Premier", Week("05 Oct 2026", "09 Oct 2026", matches)));

        var fixtures = _parser.ParseDivisionFixtures(html)["Premier"];

        Assert.Equal(count + 1, fixtures.Count);
        Assert.All(fixtures.Take(count), fixture =>
        {
            Assert.True(fixture.Played);
            Assert.Equal(10, fixture.HomeTeamScore);
            Assert.Empty(fixture.HomeTeamPlayersScore);
            Assert.Empty(fixture.AwayTeamPlayersScore);
        });
    }

    [Fact]
    public void ParseDivisionFixtures_RejectsSixScoredMatchesWithoutPlayersInOneDivision()
    {
        var matches = Enumerable.Repeat(Scored("Mon 05 Oct", "A", "B", "10 - 0", "", ""), 6)
            .Append(Scored("Tue 06 Oct", "C", "D", "6 - 4", DefaultHome, DefaultAway)).ToArray();
        var html = Page(Division("Premier", Week("05 Oct 2026", "09 Oct 2026", matches)));

        Assert.Throws<StrategySourceCheckException>(() => _parser.ParseDivisionFixtures(html));
    }

    [Fact]
    public void ParseDivisionFixtures_CountsMissingPlayersPerDivisionAcrossWeeks()
    {
        var missing = Scored("Mon 05 Oct", "A", "B", "10 - 0", "", "");
        var nextWeekMissing = Scored("Mon 12 Oct", "C", "D", "10 - 0", "", "");
        var html = Page(Division("Premier", Week("05 Oct 2026", "09 Oct 2026", Enumerable.Repeat(missing, 5).ToArray()),
            Week("12 Oct 2026", "16 Oct 2026", nextWeekMissing)),
            Division("Division One", Week("05 Oct 2026", "09 Oct 2026", Scored("Mon 05 Oct", "E", "F", "6 - 4", DefaultHome, DefaultAway))));

        Assert.Throws<StrategySourceCheckException>(() => _parser.ParseDivisionFixtures(html));
    }

    [Fact]
    public void ParseDivisionFixtures_RejectsIncompleteSinglesResultsWhenBothListsArePresent()
    {
        var html = Page(Division("Premier", Week("05 Oct 2026", "09 Oct 2026",
            Scored("Mon 05 Oct", "A", "B", "6 - 4", Players(("One", 2)), Players(("Two", 1))))));

        Assert.Throws<StrategySourceCheckException>(() => _parser.ParseDivisionFixtures(html));
    }

    [Fact]
    public void ParseDivisionFixtures_RejectsAWeekWithoutATableBeforeNextDivision()
    {
        var unfinishedWeek = "<div class='tt-fixture-week-header'><span class='tt-fixture-week-period'>&ndash; 12 Oct 2026 &#x2013; 16 Oct 2026</span></div>";
        var html = Page(Division("Premier", Week("05 Oct 2026", "09 Oct 2026", Unplayed("Mon 05 Oct", "A", "B")), unfinishedWeek),
            Division("Division One", Week("05 Oct 2026", "09 Oct 2026", Unplayed("Mon 05 Oct", "C", "D"))));

        Assert.Throws<StrategySourceCheckException>(() => _parser.ParseDivisionFixtures(html));
    }

    [Fact]
    public void ParseDivisionFixtures_RejectsAPlayerListMissingFromOnlyOneSide()
    {
        var html = Page(Division("Premier", Week("05 Oct 2026", "09 Oct 2026",
            Scored("Mon 05 Oct", "A", "B", "6 - 4", DefaultHome, ""))));

        Assert.Throws<StrategySourceCheckException>(() => _parser.ParseDivisionFixtures(html));
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void ParseDivisionFixtures_RejectsDuplicatePlayerNamesOnEitherTeam(bool duplicateAtHome)
    {
        var home = duplicateAtHome ? Players(("One", 2), ("one", 2), ("Three", 1)) : DefaultHome;
        var away = duplicateAtHome ? DefaultAway : Players(("Four", 2), ("four", 1), ("Six", 1));
        var html = Page(Division("Premier", Week("05 Oct 2026", "09 Oct 2026",
            Scored("Mon 05 Oct", "A", "B", "6 - 4", home, away))));

        var error = Assert.Throws<StrategySourceCheckException>(() => _parser.ParseDivisionFixtures(html));
        Assert.Contains("duplicate", error.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void ParseDivisionFixtures_RejectsAForfeitAdjustmentThatMakesWinsNegative(bool forfeitAtHome)
    {
        var forfeitSide = Players(("One", 2), ("Two", 1), ("Forfeit", 0));
        var opponents = Players(("Three", 3), ("Four", 3), ("Five", 0));
        var html = Page(Division("Premier", Week("05 Oct 2026", "09 Oct 2026", Scored("Mon 05 Oct", "A", "B", forfeitAtHome ? "4 - 6" : "6 - 4", forfeitAtHome ? forfeitSide : opponents, forfeitAtHome ? opponents : forfeitSide))));
        Assert.Throws<StrategySourceCheckException>(() => _parser.ParseDivisionFixtures(html));
    }

    [Fact]
    public void ParseDivisionFixtures_RejectsMultipleForfeitsWithoutInventingPlayerWins()
    {
        var html = Page(Division("Premier", Week("05 Oct 2026", "09 Oct 2026",
            Scored("Mon 05 Oct", "A", "B", "8 - 2", DefaultHome, Players(("Forfeit", 0), ("Forfeit", 0), ("One", 1))))));

        Assert.Throws<StrategySourceCheckException>(() => _parser.ParseDivisionFixtures(html));
    }

    [Fact]
    public void ParseDivisionFixtures_RejectsPageWhereEveryScoredMatchLacksPlayersEvenWithFutureFixtures()
    {
        var html = Page(Division("Premier", Week("05 Oct 2026", "09 Oct 2026",
            Scored("Mon 05 Oct", "A", "B", "10 - 0", "", ""), Unplayed("Tue 06 Oct", "C", "D"))));

        Assert.Throws<StrategySourceCheckException>(() => _parser.ParseDivisionFixtures(html));
    }

    [Fact]
    public void ParseDivisionFixtures_AllowsASeasonWithNoScoredFixtures()
    {
        var html = Page(Division("Premier", Week("05 Oct 2026", "09 Oct 2026", Unplayed("Mon 05 Oct", "A", "B"))));

        Assert.False(Assert.Single(_parser.ParseDivisionFixtures(html)["Premier"]).Played);
    }

    [Theory]
    [InlineData("5 - 4")]
    [InlineData("11 - 0")]
    [InlineData("oops")]
    public void ParseDivisionFixtures_RejectsMalformedOrIncompleteTeamScore(string score)
    {
        var html = Page(Division("Premier", Week("05 Oct 2026", "09 Oct 2026",
            Scored("Mon 05 Oct", "A", "B", score, DefaultHome, DefaultAway))));

        Assert.Throws<StrategySourceCheckException>(() => _parser.ParseDivisionFixtures(html));
    }

    [Theory]
    [InlineData(-1)]
    [InlineData(4)]
    public void ParseDivisionFixtures_RejectsPlayerWinsOutsideSinglesRange(int won)
    {
        var html = Page(Division("Premier", Week("05 Oct 2026", "09 Oct 2026",
            Scored("Mon 05 Oct", "A", "B", "6 - 4", Players(("One", won)), DefaultAway))));

        Assert.Throws<StrategySourceCheckException>(() => _parser.ParseDivisionFixtures(html));
    }

    [Fact]
    public void ParseDivisionFixtures_RejectsMissingDivisionStructure()
    {
        Assert.Throws<StrategySourceCheckException>(() => _parser.ParseDivisionFixtures("<html><body>No fixtures</body></html>"));
    }

    [Fact]
    public void ParseDivisionFixtures_RejectsFixtureWithMissingTeam()
    {
        var html = Page(Division("Premier", Week("05 Oct 2026", "09 Oct 2026", Unplayed("Mon 05 Oct", "", "B"))));

        Assert.Throws<StrategySourceCheckException>(() => _parser.ParseDivisionFixtures(html));
    }

    [Fact]
    public void ParseDivisionFixtures_RejectsFixtureDateWithoutUnambiguousYear()
    {
        var html = Page(Division("Premier", Week("05 Oct 2026", "09 Oct 2026", Unplayed("Tue 06 Oct", "A", "B"))))
            .Replace("05 Oct 2026 &#x2013; 09 Oct 2026", "unknown week");

        Assert.Throws<StrategySourceCheckException>(() => _parser.ParseDivisionFixtures(html));
    }

    [Fact]
    public void ParseDivisionFixtures_RejectsSelfPlayIgnoringCase()
    {
        var html = Page(Division("Premier", Week("05 Oct 2026", "09 Oct 2026", Unplayed("Mon 05 Oct", "Team", "team"))));
        Assert.Throws<StrategySourceCheckException>(() => _parser.ParseDivisionFixtures(html));
    }

    [Theory]
    [InlineData("4 - 6")]
    [InlineData("7 - 3")]
    public void ParseDivisionFixtures_RejectsTeamScoresInconsistentWithSingles(string score)
    {
        var html = Page(Division("Premier", Week("05 Oct 2026", "09 Oct 2026", Scored("Mon 05 Oct", "A", "B", score, DefaultHome, DefaultAway))));
        Assert.Throws<StrategySourceCheckException>(() => _parser.ParseDivisionFixtures(html));
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void ParseDivisionFixtures_RequiresThreeScorecardEntriesPerTeam(bool atHome)
    {
        var four = atHome ? Players(("One", 2), ("Two", 2), ("Three", 1), ("Extra", 0))
            : Players(("Four", 2), ("Five", 1), ("Six", 1), ("Extra", 0));
        var html = Page(Division("Premier", Week("05 Oct 2026", "09 Oct 2026", Scored("Mon 05 Oct", "A", "B", "6 - 4", atHome ? four : DefaultHome, atHome ? DefaultAway : four))));
        Assert.Throws<StrategySourceCheckException>(() => _parser.ParseDivisionFixtures(html));
    }

    [Fact]
    public void ParseDivisionFixtures_AcceptsDoublesPointForAwayTeam()
    {
        var html = Page(Division("Premier", Week("05 Oct 2026", "09 Oct 2026", Scored("Mon 05 Oct", "A", "B", "5 - 5", DefaultHome, DefaultAway))));
        var fixture = Assert.Single(_parser.ParseDivisionFixtures(html)["Premier"]);
        Assert.Equal(5, fixture.AwayTeamScore);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void ParseDivisionFixtures_RejectsTooFewPlayersEvenWhenSinglesTotalNine(bool atHome)
    {
        var two = Players(("One", 3), ("Two", 2));
        var three = Players(("Four", 2), ("Five", 1), ("Six", 1));
        var html = Page(Division("Premier", Week("05 Oct 2026", "09 Oct 2026", Scored("Mon 05 Oct", "A", "B", atHome ? "6 - 4" : "4 - 6", atHome ? two : three, atHome ? three : two))));
        Assert.Throws<StrategySourceCheckException>(() => _parser.ParseDivisionFixtures(html));
    }

    [Fact]
    public void ValidateFixtureDivisionCoverage_RequiresEveryRosterDivisionIgnoringCase()
    {
        var divisions = new OrderedDictionary<string, Division> { ["Premier"] = new Division("Premier") };
        var fixtures = new OrderedDictionary<string, List<Fixture>> { ["premier"] = [] };
        _parser.ValidateFixtureDivisionCoverage(divisions, fixtures);
        divisions.Add("Division 1", new Division("Division 1"));
        Assert.Throws<StrategySourceCheckException>(() => _parser.ValidateFixtureDivisionCoverage(divisions, fixtures));
    }

    private static string Page(params string[] divisions) => $"<html><body><div id='fixtures'>{string.Concat(divisions)}</div></body></html>";
    private static string Division(string name, params string[] weeks) => $"<h3 class='tt-potm-division-title'>{name}</h3>{string.Concat(weeks)}";
    private static string Week(string start, string end, params string[] rows) => $"<div class='tt-fixture-week-header'><span class='tt-fixture-week-period'>&ndash; {start} &#x2013; {end}</span></div><div class='table-responsive mb-3'><table class='table table-sm tt-fixture-table'><thead><tr><th>Date</th><th>Home</th><th>Score</th><th>Away</th></tr></thead><tbody>{string.Concat(rows)}</tbody></table></div>";
    private static string Unplayed(string date, string home, string away, string score = "vs") => Row(date, home, away, score);
    private static string Scored(string date, string home, string away, string score, string homePlayers, string awayPlayers) => Row(date, home, away, $"<a class='tt-result-score-link'><span class='tt-result-score-text'>{score}</span></a>", homePlayers, awayPlayers, "tt-fixture-completed");
    private static string Row(string date, string home, string away, string score, string homePlayers = "", string awayPlayers = "", string rowClass = "") => $"<tr class='{rowClass}'><td class='tt-fixture-date'>{date}</td><td class='tt-fixture-teamcell'><a class='tt-team-link'>{home}</a>{Scorecard("home", homePlayers)}</td><td class='tt-fixture-score'>{score}</td><td class='tt-fixture-teamcell'><a class='tt-team-link'>{away}</a>{Scorecard("away", awayPlayers)}</td></tr>";
    private static string Scorecard(string side, string players) => players.Length == 0 ? "" : $"<ul class='tt-fixture-scorecard tt-fixture-scorecard-{side}'>{players}</ul>";
    private static string Players(params (string name, int won)[] players) => string.Concat(players.Select(p => $"<li class='tt-fixture-scorecard-player'>{(p.name == "Forfeit" ? "<span class='tt-fixture-scorecard-forfeit'>Forfeit</span>" : $"<a class='tt-player-link'>{p.name}</a>")}<span class='tt-fixture-scorecard-score'>{p.won}</span></li>"));
    private static string DefaultHome => Players(("One", 2), ("Two", 2), ("Three", 1));
    private static string DefaultAway => Players(("Four", 2), ("Five", 1), ("Six", 1));
}

using TTLeaguePlayersApp.BackEnd.TTLeaguePlayersApp.BackEnd.Strategy.Lambdas;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.Tests.Strategy.Lambdas;

public sealed class StrategyDataCalculationTests
{
    [Fact]
    public void CalculatesEachDivisionUsingAllTeamsAndPreservesOrderAndOtherData()
    {
        var first = Division("First", ("A", new[] { "Low", "Middle" }), ("B", new[] { "High", "Third" }));
        first.TeamsLookbackPeriod = 4;
        first.Teams["A"].Played = 7;
        var second = Division("Second", ("C", new[] { "Low", "Middle" }));
        var divisions = Divisions(first, second);
        var ranked = Rankings(("low", 100), ("middle", 150), ("high", 200), ("third", 133));
        var tables = Tables(divisions);
        var fixtures = new OrderedDictionary<string, List<Fixture>> { ["First"] = [] };

        var result = StrategyDataCalculation.CalculateStrategyData(divisions, ranked, tables, fixtures);

        Assert.Same(divisions, result);
        Assert.Equal(new[] { "First", "Second" }, result.Keys);
        Assert.Equal(new[] { "A", "B" }, first.Teams.Keys);
        Assert.Equal(new[] { "Low", "Middle" }, first.Teams["A"].Players.Keys);
        Assert.Equal(0m, first.Teams["A"].Players["Low"].NormalisedRanking);
        Assert.Equal(50m, first.Teams["A"].Players["Middle"].NormalisedRanking);
        Assert.Equal(100m, first.Teams["B"].Players["High"].NormalisedRanking);
        Assert.Equal(33m, first.Teams["B"].Players["Third"].NormalisedRanking);
        Assert.Equal(100m, second.Teams["C"].Players["Middle"].NormalisedRanking);
        Assert.Equal(1, first.TeamsLookbackPeriod);
        Assert.Equal(0, first.Teams["A"].Played);
        Assert.Equal(2, tables.Count);
        Assert.Single(fixtures);
        Assert.Null(ranked["middle"].NormalisedRanking);
    }

    [Fact]
    public void ClearsMissingAndZeroValuesAndRecalculatesOnRepeatedCalls()
    {
        var division = Division("One", ("A", new[] { "A", "B", "Zero", "Missing" }));
        var divisions = Divisions(division);

        Calculate(divisions, Rankings(("A", 100), ("B", 400), ("Zero", 0), ("Missing", 200)));

        Assert.Equal(100m / 3m, division.Teams["A"].Players["Missing"].NormalisedRanking);



        Calculate(divisions, Rankings(("A", 200), ("B", 400), ("Zero", 0)));

        var players = division.Teams["A"].Players;
        Assert.Equal(200, players["A"].CurrentRanking);
        Assert.Equal(0m, players["A"].NormalisedRanking);
        Assert.Equal(100m, players["B"].NormalisedRanking);
        Assert.Equal(0, players["Zero"].CurrentRanking);
        Assert.Null(players["Zero"].NormalisedRanking);
        Assert.Null(players["Missing"].CurrentRanking);
        Assert.Null(players["Missing"].NormalisedRanking);
    }

    [Fact]
    public void EmptyAndSingleDistinctNonzeroRankingsHaveNoNormalizedValues()
    {
        var empty = Division("Empty", ("Empty team", Array.Empty<string>()));
        var same = Division("Same", ("A", new[] { "A", "B", "Zero" }));
        var unknown = Division("Unknown", ("B", new[] { "Missing" }));
        var divisions = Divisions(empty, same, unknown);

        Calculate(divisions, Rankings(("A", 100), ("B", 100), ("Zero", 0)));

        Assert.Empty(empty.Teams["Empty team"].Players);
        Assert.All(same.Teams["A"].Players.Values, player => Assert.Null(player.NormalisedRanking));
        Assert.Null(unknown.Teams["B"].Players["Missing"].NormalisedRanking);
        Calculate(new OrderedDictionary<string, Division>(), Rankings());
    }

    [Fact]
    public void NormalizationUsesDecimalArithmeticAtIntegerExtremes()
    {
        var division = Division("One", ("A", new[] { "Low", "High" }));

        Calculate(Divisions(division), Rankings(("Low", int.MinValue), ("High", int.MaxValue)));

        Assert.Equal(0m, division.Teams["A"].Players["Low"].NormalisedRanking);
        Assert.Equal(100m, division.Teams["A"].Players["High"].NormalisedRanking);
    }

    [Fact]
    public void IntegratesTablesForEveryDivisionAndRecalculatesZeroSets()
    {
        var first = Division("Premier", Enumerable.Range(1, 12).Select(i => ($"Team {i}", Array.Empty<string>())).ToArray());
        var second = Division("Second", ("Other", Array.Empty<string>()), ("Next", Array.Empty<string>()), ("Last", Array.Empty<string>()));
        var divisions = Divisions(first, second);
        var tables = Tables(divisions);
        var premier = tables["Premier"];
        tables.Remove("Premier");
        tables.Add("PREMIER", premier);
        premier.TeamsStanding.Remove("Team 1");
        premier.TeamsStanding.Add("TEAM 1", new TeamStanding(0, 0, 0, 0));
        tables["premier"].TeamsStanding["team 1"] = new TeamStanding(6, 55, 5, 73);
        tables["Second"].TeamsStanding["Other"] = new TeamStanding(3, 1, 2, 4);

        var result = StrategyDataCalculation.CalculateStrategyData(divisions, Rankings(), tables, new());

        Assert.Same(divisions, result);
        Assert.Equal(11, first.TeamsLookbackPeriod);
        Assert.Equal(7, first.PlayersLookbackPeriod);
        Assert.Equal(2, second.TeamsLookbackPeriod);
        Assert.Equal(1, second.PlayersLookbackPeriod);
        Assert.Equal(6, first.Teams["Team 1"].Played);
        Assert.Equal(73, first.Teams["Team 1"].Points);
        Assert.Equal(100m * 55m / 60m, first.Teams["Team 1"].WinPercentage);
        Assert.Equal(100m / 3m, second.Teams["Other"].WinPercentage);
        Assert.Null(first.Teams["Team 2"].WinPercentage);
        tables["Premier"].TeamsStanding["Team 1"] = new TeamStanding(0, 0, 0, 0);

        
        
        StrategyDataCalculation.CalculateStrategyData(divisions, Rankings(), tables, new());

        Assert.Null(first.Teams["Team 1"].WinPercentage);
        Assert.Equal(0, first.Teams["Team 1"].Played);
    }

    [Fact]
    public void PercentageHandlesLargeSetCountsWithoutIntegerOverflow()
    {
        var divisions = Divisions(Division("One", ("A", Array.Empty<string>())));
        var tables = Tables(divisions);
        tables["One"].TeamsStanding["A"] = new TeamStanding(1, int.MaxValue, int.MaxValue, 0);

        StrategyDataCalculation.CalculateStrategyData(divisions, Rankings(), tables, new());

        Assert.Equal(50m, divisions["One"].Teams["A"].WinPercentage);
        Assert.Equal(0, divisions["One"].TeamsLookbackPeriod);
        Assert.Equal(0, divisions["One"].PlayersLookbackPeriod);
    }

    [Theory]
    [InlineData("missing division")]
    [InlineData("extra division")]
    [InlineData("missing team")]
    [InlineData("extra team")]
    [InlineData("different team")]
    [InlineData("empty division")]
    public void MismatchedTablesFailBeforeAnyRosterMutation(string mismatch)
    {
        var first = Division("First", ("A", new[] { "Player" }));
        first.TeamsLookbackPeriod = 99;
        first.Teams["A"].Played = 88;
        var second = Division("Second", ("B", Array.Empty<string>()));
        var divisions = Divisions(first, second);
        var tables = Tables(divisions);
        switch (mismatch)
        {
            case "missing division": tables.Remove("Second"); break;
            case "extra division": tables.Add("Extra", new DivisionTable("Extra")); break;
            case "missing team": tables["Second"].TeamsStanding.Remove("B"); break;
            case "extra team": tables["Second"].TeamsStanding.Add("C", new TeamStanding(0, 0, 0, 0)); break;
            case "different team": tables["Second"].TeamsStanding.Remove("B"); tables["Second"].TeamsStanding.Add("C", new TeamStanding(0, 0, 0, 0)); break;
            case "empty division": second.Teams.Clear(); tables["Second"].TeamsStanding.Clear(); break;
        }

        var exception = Assert.Throws<InvalidOperationException>(() =>
            StrategyDataCalculation.CalculateStrategyData(divisions, Rankings(("Player", 123)), tables, new()));
            
        Assert.Contains(mismatch == "extra division" ? "Extra" : "Second", exception.Message);
        Assert.Equal(99, first.TeamsLookbackPeriod);
        Assert.Equal(88, first.Teams["A"].Played);
        Assert.Null(first.Teams["A"].Players["Player"].CurrentRanking);
    }

    [Theory]
    [InlineData(1, 0, 0)]
    [InlineData(2, 0, 0)]
    [InlineData(3, 50, 100d / 3d)]
    public void HistoriesUseIndependentLimitsAndProcessorOrder(int count, double playerPercentage, double teamPercentage)
    {
        var first = FiveTeamDivision("First", ("A", new[] { "Player" }));
        var second = Division("Second", ("X", new[] { "Other" }), ("Y", Array.Empty<string>()),
            ("Z", Array.Empty<string>()));
        var divisions = Divisions(first, second);
        var entries = new[]
        {
            Match("A", "B", 0, 3, [new("Player", 0, 3)], day: 20),
            Match("A", "B", 0, 3, [new("Player", 0, 3)], day: 10),
            Match("A", "B", 3, 0, [new("Player", 3, 3)], day: 1)
        };
        var fixtures = Fixtures(("First", entries.Take(count).ToArray()),
            ("Second", new[] { Match("X", "Y", 1, 3, [new("Other", 1, 2)]) }));

        StrategyDataCalculation.CalculateStrategyData(divisions, Rankings(), Tables(divisions), fixtures);

        Assert.Equal(2, first.PlayersLookbackPeriod);
        Assert.Equal(4, first.TeamsLookbackPeriod);
        AssertClose((decimal)playerPercentage, first.Teams["A"].Players["Player"].RecentWinsPercentage, 0.000000000001m);
        AssertClose((decimal)teamPercentage, first.Teams["A"].RecentWinsPercentage, 0.000000000001m);
        Assert.Equal(count == 1 ? 3 : 6, first.Teams["A"].Players["Player"].RecentSetsPlayed);
        Assert.Equal(50m, second.Teams["X"].Players["Other"].RecentWinsPercentage);
        Assert.Equal(25m, second.Teams["X"].RecentWinsPercentage);
    }

    [Fact]
    public void TeamEvictionDoesNotEvictPlayerWhoMissedLaterFixtures()
    {
        var division = FiveTeamDivision("One", ("A", new[] { "Player" }));
        var divisions = Divisions(division);
        var fixtures = Fixtures(("One", new[] {
            Match("A", "B", 1, 9, [new("Player", 1, 3)]),
            Match("A", "B", 3, 7, [new("Player", 0, 3)]),
            Match("A", "B", 7, 3, [new("Player", 3, 3)]),
            Match("A", "B", 0, 10), Match("A", "B", 9, 1)
        }));

        var firstFour = Fixtures(("One", fixtures["One"].Take(4).ToArray()));

        StrategyDataCalculation.CalculateStrategyData(divisions, Rankings(), Tables(divisions), firstFour);
        
        Assert.Equal(27.5m, division.Teams["A"].RecentWinsPercentage);

        
        
        StrategyDataCalculation.CalculateStrategyData(divisions, Rankings(), Tables(divisions), fixtures);

        Assert.Equal(47.5m, division.Teams["A"].RecentWinsPercentage);
        Assert.Equal(50m, division.Teams["A"].Players["Player"].RecentWinsPercentage);
        Assert.Equal(6, division.Teams["A"].Players["Player"].RecentSetsPlayed);
        Assert.Equal(52.5m, division.Teams["B"].RecentWinsPercentage);
    }

    [Fact]
    public void BlendsPartialPlayerWindowAndComputesWeightedAndRankingStatistics()
    {
        var division = FiveTeamDivision("One", ("A", new[] { "Eighty", "Forty", "Unknown" }),
            ("B", new[] { "Low", "High" }));
        var divisions = Divisions(division);
        var fixtures = Fixtures(("One", new[] { Match("A", "B", 7, 3,
            [new("Eighty", 12, 15), new("Forty", 2, 5)]) }));

        StrategyDataCalculation.CalculateStrategyData(divisions,
            Rankings(("Low", 100), ("High", 200), ("Eighty", 180), ("Forty", 140)), Tables(divisions), fixtures);

        var team = division.Teams["A"];
        Assert.Equal(80m, team.Players["Eighty"].RecentStrength);
        Assert.Equal(40m, team.Players["Forty"].RecentStrength);
        Assert.Null(team.Players["Unknown"].RecentStrength);
        Assert.Equal(1, team.PlayersWithUnknownStrengthCount);
        Assert.Equal(70m, team.WeightedAveragePlayersRecentStrength);
        AssertClose(0.24743582965m, team.PlayersRecentStrengthCoefficientOfVariation, 0.00000000001m);
        Assert.Equal(60m, team.AverageNormalisedPlayersRanking);
        AssertClose(1m / 3m, team.AverageNormalisedPlayersRankingCoefficientOfVariation, 0.0000000000001m);
        Assert.Equal(70m, team.RecentStrength);
    }

    [Fact]
    public void PartialWindowUsesSpecifiedBlendAndEqualWeightRankingCv()
    {
        var division = FiveTeamDivision("One", ("A", new[] { "Eighty", "Forty", "Sixty" }),
            ("B", new[] { "Low", "High" }));
        var divisions = Divisions(division);
        var fixtures = Fixtures(("One", new[] { Match("A", "B", 1, 1, [new("Eighty", 1, 2)]) }));

        StrategyDataCalculation.CalculateStrategyData(divisions,
            Rankings(("Low", 100), ("High", 200), ("Eighty", 180), ("Forty", 140), ("Sixty", 160)), Tables(divisions), fixtures);

        var team = division.Teams["A"];
        Assert.Equal(62m, team.Players["Eighty"].RecentStrength);
        Assert.Equal(60m, team.AverageNormalisedPlayersRanking);
        AssertClose(0.2721655269759087m, team.AverageNormalisedPlayersRankingCoefficientOfVariation, 0.000000000000001m);
        Assert.Equal(58.1m, team.RecentStrength);
    }

    [Fact]
    public void FullPlayerWindowUsesRecentResultsInsteadOfDifferentRanking()
    {
        var division = FiveTeamDivision("One", ("A", new[] { "Player" }), ("B", new[] { "Low", "High" }));
        var divisions = Divisions(division);
        var fixtures = Fixtures(("One", new[] {
            Match("A", "B", 1, 1, [new("Player", 1, 2)]),
            Match("A", "B", 1, 1, [new("Player", 1, 2)])
        }));

        StrategyDataCalculation.CalculateStrategyData(divisions,
            Rankings(("Low", 100), ("High", 200), ("Player", 180)), Tables(divisions), fixtures);

        Assert.Equal(80m, division.Teams["A"].Players["Player"].NormalisedRanking);
        Assert.Equal(50m, division.Teams["A"].Players["Player"].RecentStrength);
    }

    [Fact]
    public void FixturePlayerRosteredOnAnotherTeamIsNotCreditedToEitherRoster()
    {
        var division = FiveTeamDivision("One", ("A", new[] { "Home" }), ("B", new[] { "Away" }),
            ("C", new[] { "Substitute" }));
        var divisions = Divisions(division);
        var fixtures = Fixtures(("One", new[] {
            Match("A", "B", 7, 3, [new("Substitute", 3, 3)], [new("Away", 1, 3)])
        }));

        StrategyDataCalculation.CalculateStrategyData(divisions, Rankings(), Tables(divisions), fixtures);

        Assert.Equal(70m, division.Teams["A"].RecentWinsPercentage);
        Assert.Equal(0, division.Teams["A"].Players["Home"].RecentSetsPlayed);
        Assert.Equal(0, division.Teams["C"].Players["Substitute"].RecentSetsPlayed);
        Assert.Null(division.Teams["C"].Players["Substitute"].RecentStrength);
        Assert.Equal(3, division.Teams["B"].Players["Away"].RecentSetsPlayed);
    }

    [Fact]
    public void PopulationRankingCvAndZeroWeightedMeanAreHandled()
    {
        var division = FiveTeamDivision("One", ("A", new[] { "Forty", "Sixty" }),
            ("B", new[] { "Low", "High" }));
        var divisions = Divisions(division);
        var fixtures = Fixtures(("One", new[] { Match("B", "A", 1, 0, [new("Low", 0, 3)]) }));

        StrategyDataCalculation.CalculateStrategyData(divisions,
            Rankings(("Low", 100), ("High", 200), ("Forty", 140), ("Sixty", 160)), Tables(divisions), fixtures);

        Assert.Equal(50m, division.Teams["A"].AverageNormalisedPlayersRanking);
        Assert.Equal(0.2m, division.Teams["A"].AverageNormalisedPlayersRankingCoefficientOfVariation);
        Assert.Equal(0m, division.Teams["B"].WeightedAveragePlayersRecentStrength);
        Assert.Null(division.Teams["B"].PlayersRecentStrengthCoefficientOfVariation);
    }

    [Fact]
    public void FixtureMatchingHandlesAwayRosterCaseSubstitutesUnplayedAndWalkover()
    {
        var division = FiveTeamDivision("One", ("A", new[] { "Home" }), ("B", new[] { "Away" }));
        var divisions = Divisions(division);
        var fixtures = Fixtures(("oNE", new[] {
            Match("a", "b", 8, 2, [new("HOME", 2, 3), new("Substitute", 3, 3)], [new("away", 1, 3)]),
            Match("A", "B", 10, 0),
            Match("A", "B", 0, 10, [new("Home", 0, 3)], played: false)
        }));
        var tables = Tables(divisions);
        tables["One"].TeamsStanding["A"] = new TeamStanding(7, 1, 3, 12);

        StrategyDataCalculation.CalculateStrategyData(divisions, Rankings(), tables, fixtures);

        var home = division.Teams["A"];
        var away = division.Teams["B"];
        Assert.Equal(90m, home.RecentWinsPercentage);
        Assert.Equal(10m, away.RecentWinsPercentage);
        Assert.Equal(3, home.Players["Home"].RecentSetsPlayed);
        Assert.Equal(100m * 2m / 3m, home.Players["Home"].RecentWinsPercentage);
        Assert.Equal(100m / 3m, away.Players["Away"].RecentWinsPercentage);
        Assert.Single(home.Players);
        Assert.Equal(7, home.Played);
        Assert.Equal(12, home.Points);
        Assert.Equal(25m, home.WinPercentage);
    }

    [Fact]
    public void FallbacksZeroWindowsZeroMeansAndRepeatedCallsClearResults()
    {
        var first = FiveTeamDivision("One", ("A", new[] { "Ranked", "Unranked", "Zero" }),
            ("B", new[] { "Low", "High" }));
        var single = Division("Single", ("Only", new[] { "Solo" }));
        var divisions = Divisions(first, single);
        var fixtures = Fixtures(("One", new[] { Match("A", "B", 0, 0,
            [new("Unranked", 1, 2), new("Zero", 0, 2)]) }),
            ("Single", new[] { Match("Only", "Only", 1, 0, [new("Solo", 1, 1)]) }));
        var rankings = Rankings(("Low", 100), ("High", 200), ("Ranked", 180), ("Zero", 100));

        StrategyDataCalculation.CalculateStrategyData(divisions, rankings, Tables(divisions), fixtures);

        var team = first.Teams["A"];
        Assert.Equal(80m, team.Players["Ranked"].RecentStrength);
        Assert.Equal(50m, team.Players["Unranked"].RecentStrength);
        Assert.Equal(25m, team.WeightedAveragePlayersRecentStrength);
        Assert.Equal(25m, team.RecentStrength);
        Assert.Null(single.Teams["Only"].RecentWinsPercentage);
        Assert.Equal(0, single.Teams["Only"].Players["Solo"].RecentSetsPlayed);
        Assert.Null(single.Teams["Only"].Players["Solo"].RecentStrength);

        StrategyDataCalculation.CalculateStrategyData(divisions, Rankings(("Low", 100), ("High", 200), ("Zero", 100)), Tables(divisions), new());

        team = first.Teams["A"];
        Assert.Equal(0, team.Players["Unranked"].RecentSetsPlayed);
        Assert.Null(team.Players["Unranked"].RecentWinsPercentage);
        Assert.Null(team.Players["Unranked"].RecentStrength);
        Assert.Null(team.WeightedAveragePlayersRecentStrength);
        Assert.Null(team.PlayersRecentStrengthCoefficientOfVariation);
        Assert.Equal(0m, team.AverageNormalisedPlayersRanking);
        Assert.Null(team.AverageNormalisedPlayersRankingCoefficientOfVariation);
        Assert.Null(team.RecentWinsPercentage);
        Assert.Null(team.RecentStrength);
        Assert.Equal(2, team.PlayersWithUnknownStrengthCount);
    }

    [Fact]
    public void TeamFallsBackToResultsWithNoWeightedPlayersAndHandlesLargeScores()
    {
        var division = FiveTeamDivision("One", ("A", new[] { "P" }));
        var divisions = Divisions(division);
        var fixtures = Fixtures(("One", new[] { Match("A", "B", int.MaxValue, int.MaxValue),
            Match("A", "B", int.MaxValue, int.MaxValue) }));

        StrategyDataCalculation.CalculateStrategyData(divisions, Rankings(), Tables(divisions), fixtures);

        var team = division.Teams["A"];
        Assert.Equal(50m, team.RecentWinsPercentage);
        Assert.Null(team.WeightedAveragePlayersRecentStrength);
        Assert.Equal(50m, team.RecentStrength);
        Assert.Null(team.PlayersRecentStrengthCoefficientOfVariation);
    }

    [Theory]
    [InlineData("division")]
    [InlineData("home")]
    [InlineData("away")]
    public void UnknownFixtureReferencesFailBeforeAnyMutationEvenWhenUnplayed(string mismatch)
    {
        var first = Division("First", ("A", new[] { "Player" }), ("B", Array.Empty<string>()));
        var second = Division("Second", ("C", Array.Empty<string>()), ("D", Array.Empty<string>()));
        first.TeamsLookbackPeriod = 99;
        first.Teams["A"].Played = 88;
        var divisions = Divisions(first, second);
        var fixtures = Fixtures(("First", new[] { Match("A", "B", 1, 0) }),
            (mismatch == "division" ? "Extra" : "Second", new[] {
                Match(mismatch == "home" ? "MissingHome" : "C", mismatch == "away" ? "MissingAway" : "D", 0, 0, played: false)
            }));

        var exception = Assert.Throws<InvalidOperationException>(() =>
            StrategyDataCalculation.CalculateStrategyData(divisions, Rankings(("Player", 123)), Tables(divisions), fixtures));

        Assert.Contains(mismatch == "division" ? "Extra" : mismatch == "home" ? "MissingHome" : "MissingAway", exception.Message);
        Assert.Equal(99, first.TeamsLookbackPeriod);
        Assert.Equal(88, first.Teams["A"].Played);
        Assert.Null(first.Teams["A"].Players["Player"].CurrentRanking);
    }

    private static void AssertClose(decimal expected, decimal? actual, decimal tolerance)
    {
        Assert.NotNull(actual);
        Assert.InRange(actual.Value, expected - tolerance, expected + tolerance);
    }

    private static Fixture Match(string home, string away, int homeScore, int awayScore,
        PlayerScore[]? homePlayers = null, PlayerScore[]? awayPlayers = null, bool played = true, int day = 1) =>
        new(new DateOnly(2026, 1, day), played, home, away, homeScore, awayScore, homePlayers ?? [], awayPlayers ?? []);

    private static OrderedDictionary<string, List<Fixture>> Fixtures(params (string Division, Fixture[] Entries)[] entries)
    {
        var result = new OrderedDictionary<string, List<Fixture>>(StringComparer.OrdinalIgnoreCase);
        foreach (var (division, fixtures) in entries) result.Add(division, fixtures.ToList());
        return result;
    }

    private static Division FiveTeamDivision(string name, params (string Team, string[] Players)[] specified)
    {
        var teams = specified.ToDictionary(item => item.Team, item => item.Players, StringComparer.OrdinalIgnoreCase);
        foreach (var namePart in new[] { "A", "B", "C", "D", "E" }) teams.TryAdd(namePart, []);
        return Division(name, teams.Select(item => (item.Key, item.Value)).ToArray());
    }

    private static OrderedDictionary<string, DivisionTable> Tables(OrderedDictionary<string, Division> divisions)
    {
        var tables = new OrderedDictionary<string, DivisionTable>(StringComparer.OrdinalIgnoreCase);
        foreach (var (name, division) in divisions)
        {
            var table = new DivisionTable(name);
            foreach (var team in division.Teams.Keys) table.TeamsStanding.Add(team, new TeamStanding(0, 0, 0, 0));
            tables.Add(name, table);
        }
        return tables;
    }

    private static void Calculate(OrderedDictionary<string, Division> divisions, IReadOnlyDictionary<string, Player> ranked) =>
        StrategyDataCalculation.CalculateStrategyData(divisions, ranked, Tables(divisions), new());

    private static Dictionary<string, Player> Rankings(params (string Name, int Value)[] values) =>
        values.ToDictionary(value => value.Name, value => new Player(value.Name, value.Value), StringComparer.OrdinalIgnoreCase);

    private static OrderedDictionary<string, Division> Divisions(params Division[] divisions)
    {
        var result = new OrderedDictionary<string, Division>(StringComparer.OrdinalIgnoreCase);
        foreach (var division in divisions) result.Add(division.Name, division);
        return result;
    }

    private static Division Division(string name, params (string Team, string[] Players)[] teams)
    {
        var division = new Division(name);
        foreach (var (teamName, names) in teams)
        {
            var team = new Team(teamName);
            foreach (var player in names) team.Players.Add(player, new Player(player, null));
            division.Teams.Add(teamName, team);
        }
        return division;
    }
}

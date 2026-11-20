using TTLeaguePlayersApp.BackEnd.TTLeaguePlayersApp.BackEnd.Strategy.Lambdas;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.Tests.Strategy.Lambdas;

public sealed class StrategyDataCalculationTests
{
    [Fact]
    public void ConstructorRejectsNullRoster()
    {
        Assert.Throws<ArgumentNullException>(() => new StrategyDataCalculator(null!));
    }

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

        new StrategyDataCalculator(divisions).UpdateStrategyDataWith( ranked, tables, fixtures);

        Assert.Equal(new[] { "First", "Second" }, divisions.Keys);
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

        new StrategyDataCalculator(divisions).UpdateStrategyDataWith( Rankings(), tables, new());

        Assert.Equal(11, first.TeamsLookbackPeriod);
        Assert.Equal(5, first.PlayersLookbackPeriod);
        Assert.Equal(2, second.TeamsLookbackPeriod);
        Assert.Equal(1, second.PlayersLookbackPeriod);
        Assert.Equal(6, first.Teams["Team 1"].Played);
        Assert.Equal(73, first.Teams["Team 1"].Points);
        Assert.Equal(100m * 55m / 60m, first.Teams["Team 1"].WinPercentage);
        Assert.Equal(100m / 3m, second.Teams["Other"].WinPercentage);
        Assert.Null(first.Teams["Team 2"].WinPercentage);
        tables["Premier"].TeamsStanding["Team 1"] = new TeamStanding(0, 0, 0, 0);

        
        
        new StrategyDataCalculator(divisions).UpdateStrategyDataWith( Rankings(), tables, new());

        Assert.Null(first.Teams["Team 1"].WinPercentage);
        Assert.Equal(0, first.Teams["Team 1"].Played);
    }

    [Fact]
    public void PercentageHandlesLargeSetCountsWithoutIntegerOverflow()
    {
        var divisions = Divisions(Division("One", ("A", Array.Empty<string>())));
        var tables = Tables(divisions);
        tables["One"].TeamsStanding["A"] = new TeamStanding(1, int.MaxValue, int.MaxValue, 0);

        new StrategyDataCalculator(divisions).UpdateStrategyDataWith( Rankings(), tables, new());

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
            new StrategyDataCalculator(divisions).UpdateStrategyDataWith( Rankings(("Player", 123)), tables, new()));
            
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

        new StrategyDataCalculator(divisions).UpdateStrategyDataWith( Rankings(), Tables(divisions), fixtures);

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

        new StrategyDataCalculator(divisions).UpdateStrategyDataWith( Rankings(), Tables(divisions), firstFour);
        
        Assert.Equal(27.5m, division.Teams["A"].RecentWinsPercentage);

        
        
        new StrategyDataCalculator(divisions).UpdateStrategyDataWith( Rankings(), Tables(divisions), fixtures);

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

        new StrategyDataCalculator(divisions).UpdateStrategyDataWith(
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

        new StrategyDataCalculator(divisions).UpdateStrategyDataWith(
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

        new StrategyDataCalculator(divisions).UpdateStrategyDataWith(
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

        new StrategyDataCalculator(divisions).UpdateStrategyDataWith( Rankings(), Tables(divisions), fixtures);

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

        new StrategyDataCalculator(divisions).UpdateStrategyDataWith(
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

        new StrategyDataCalculator(divisions).UpdateStrategyDataWith( Rankings(), tables, fixtures);

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

        new StrategyDataCalculator(divisions).UpdateStrategyDataWith( rankings, Tables(divisions), fixtures);

        var team = first.Teams["A"];
        Assert.Equal(80m, team.Players["Ranked"].RecentStrength);
        Assert.Equal(50m, team.Players["Unranked"].RecentStrength);
        Assert.Equal(25m, team.WeightedAveragePlayersRecentStrength);
        Assert.Equal(25m, team.RecentStrength);
        Assert.Null(single.Teams["Only"].RecentWinsPercentage);
        Assert.Equal(0, single.Teams["Only"].Players["Solo"].RecentSetsPlayed);
        Assert.Null(single.Teams["Only"].Players["Solo"].RecentStrength);

        new StrategyDataCalculator(divisions).UpdateStrategyDataWith( Rankings(("Low", 100), ("High", 200), ("Zero", 100)), Tables(divisions), new());

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

        new StrategyDataCalculator(divisions).UpdateStrategyDataWith( Rankings(), Tables(divisions), fixtures);

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
            new StrategyDataCalculator(divisions).UpdateStrategyDataWith( Rankings(("Player", 123)), Tables(divisions), fixtures));

        Assert.Contains(mismatch == "division" ? "Extra" : mismatch == "home" ? "MissingHome" : "MissingAway", exception.Message);
        Assert.Equal(99, first.TeamsLookbackPeriod);
        Assert.Equal(88, first.Teams["A"].Played);
        Assert.Null(first.Teams["A"].Players["Player"].CurrentRanking);
    }

    [Theory]
    [InlineData(new int[] { 10, 9, 7, 6 }, new int[] { 4, 1, 4, 1, 3, 2, 3, 2 }, new int[] { 20, 20, 20 })]
    [InlineData(new int[] { 9, 9 }, new int[] { 2, 1, 2, 1 }, new int[] { 80 })]
    [InlineData(new int[] { 8, 6 }, new int[] { 1, 1, 1, 1 }, new int[] { })]
    [InlineData(new int[] { 10, 8, 7 }, new int[] { 2, 1, 2, 1, 2, 1 }, new int[] { 40 })]
    public void GroupsTeamsFromWeakestToStrongestUsingDivisionGaps(int[] homeScores, int[] expectedGroups, int[] expectedGaps)
    {
        var division = Division("One", Enumerable.Range(0, homeScores.Length * 2)
            .Select(index => ($"Team {index}", Array.Empty<string>())).ToArray());
        var divisions = Divisions(division);
        var matches = homeScores.Select((score, index) =>
            Match($"Team {index * 2}", $"Team {index * 2 + 1}", score, 10 - score)).ToArray();

        new StrategyDataCalculator(divisions).UpdateStrategyDataWith(Rankings(), Tables(divisions), Fixtures(("One", matches)));

        var expectedStrengths = homeScores.SelectMany(score => new decimal?[] { score * 10m, (10 - score) * 10m });
        Assert.Equal(Enumerable.Range(0, expectedGroups.Length).Select(index => $"Team {index}"), division.Teams.Keys);
        Assert.Equal(expectedStrengths, division.Teams.Values.Select(team => team.RecentStrength));
        Assert.Equal(expectedGroups.Select(value => (int?)value), division.Teams.Values.Select(team => team.RecentStrengthGroup));
        Assert.Equal(expectedGaps.Length + 1, division.StrengthGroupsCount);
        Assert.Equal(expectedGaps.Select(value => (decimal)value), division.StrengthGroupsGaps);
    }

    [Theory]
    [InlineData(new int[] { 9, 0, 10, 10, 8, 10, 2 }, new int[] { 3, 1, 3, 3, 3, 3, 2, 2 }, new int[] { 20, 50 })]
    [InlineData(new int[] { 5, 8, 8, 6, 1, 6, 1 }, new int[] { 2, 3, 3, 2, 1, 2, 1, 2 }, new int[] { 40, 20 })]
    public void FirstDropExceptionAndTiedDropsUseTheNextLeftmostPositiveDrop(int[] scores, int[] expectedGroups, int[] expectedGaps)
    {
        var division = Division("One", Enumerable.Range(0, 8)
            .Select(index => ($"Team {index}", Array.Empty<string>())).ToArray());
        var divisions = Divisions(division);
        var matches = scores.Select((score, index) => Match($"Team {index}", "Team 7", score, 10 - score)).ToArray();

        new StrategyDataCalculator(divisions).UpdateStrategyDataWith(Rankings(), Tables(divisions), Fixtures(("One", matches)));

        Assert.Equal(expectedGroups.Select(value => (int?)value), division.Teams.Values.Select(team => team.RecentStrengthGroup));
        Assert.Equal(expectedGaps.Length + 1, division.StrengthGroupsCount);
        Assert.Equal(expectedGaps.Select(value => (decimal)value), division.StrengthGroupsGaps);
    }

    [Fact]
    public void EqualStrengthsProduceOneGroupWithoutGaps()
    {
        var division = Division("Equal", Enumerable.Range(0, 4).Select(index => ($"Team {index}", Array.Empty<string>())).ToArray());
        var divisions = Divisions(division);
        var matches = new[] { Match("Team 0", "Team 1", 5, 5), Match("Team 2", "Team 3", 5, 5) };

        new StrategyDataCalculator(divisions).UpdateStrategyDataWith(Rankings(), Tables(divisions), Fixtures(("Equal", matches)));

        Assert.All(division.Teams.Values, team => { Assert.Equal(50m, team.RecentStrength); Assert.Equal(1, team.RecentStrengthGroup); });
        Assert.Equal(1, division.StrengthGroupsCount);
        Assert.Empty(division.StrengthGroupsGaps!);
    }

    [Theory]
    [InlineData(2)]
    [InlineData(3)]
    public void SmallDivisionsWithKnownStrengthsHaveOneGroup(int teamCount)
    {
        var division = Division("Small", Enumerable.Range(0, teamCount).Select(index => ($"Team {index}", Array.Empty<string>())).ToArray());
        var divisions = Divisions(division);
        var matches = teamCount == 2
            ? new[] { Match("Team 0", "Team 1", 9, 1) }
            : new[] { Match("Team 0", "Team 1", 9, 1), Match("Team 0", "Team 2", 8, 2) };

        new StrategyDataCalculator(divisions).UpdateStrategyDataWith(Rankings(), Tables(divisions), Fixtures(("Small", matches)));

        Assert.All(division.Teams.Values, team => { Assert.NotNull(team.RecentStrength); Assert.Equal(1, team.RecentStrengthGroup); });
        Assert.Equal(1, division.StrengthGroupsCount);
        Assert.Empty(division.StrengthGroupsGaps!);
    }

    [Fact]
    public void FractionalStrengthDeterminesBoundaryWithoutRounding()
    {
        int[] scores = [9, 6, 8, 4, 4, 6, 3];
        var division = Division("Fractional", Enumerable.Range(0, 8).Select(index => ($"Team {index}", Array.Empty<string>())).ToArray());
        var divisions = Divisions(division);
        var matches = scores.Select((score, index) => Match($"Team {index}", "Team 7", score, 10 - score)).ToArray();

        new StrategyDataCalculator(divisions).UpdateStrategyDataWith(Rankings(), Tables(divisions), Fixtures(("Fractional", matches)));

        Assert.Equal(300m / 7m, division.Teams["Team 7"].RecentStrength);
        Assert.Equal(new int?[] { 3, 2, 3, 1, 1, 2, 1, 1 }, division.Teams.Values.Select(team => team.RecentStrengthGroup));
        Assert.Equal(3, division.StrengthGroupsCount);
        Assert.Equal(new[] { 60m - 300m / 7m, 20m }, division.StrengthGroupsGaps);
    }

    [Fact]
    public void TwelveTeamDivisionCanHaveSixStrengthGroups()
    {
        int[] scores = [4, 8, 5, 7, 4, 6, 7, 8, 8, 6, 10];
        var division = Division("Large", Enumerable.Range(0, 12).Select(index => ($"Team {index}", Array.Empty<string>())).ToArray());
        var divisions = Divisions(division);
        var matches = scores.Select((score, index) => Match($"Team {index}", "Team 11", score, 10 - score)).ToArray();

        new StrategyDataCalculator(divisions).UpdateStrategyDataWith(Rankings(), Tables(divisions), Fixtures(("Large", matches)));

        Assert.Equal(new int?[] { 1, 5, 2, 4, 1, 3, 4, 5, 5, 3, 6, 1 }, division.Teams.Values.Select(team => team.RecentStrengthGroup));
        Assert.Equal(6, division.StrengthGroupsCount);
        Assert.Equal(new decimal[] { 10, 10, 10, 10, 20 }, division.StrengthGroupsGaps);
    }

    [Theory]
    [InlineData(new int[] { 0, 86, 21, 31, 7, 36, 51, 43, 28, 21 }, "5")]
    [InlineData(new int[] { 72, 93, 0, 23, 18, 8, 33, 13, 2, 83 }, "5,3;7,5")]
    [InlineData(new int[] { 41, 19, 50, 83, 6, 9, 68, 12, 46, 74 }, "5,3,1;7,5,3;9,7,5")]
    [InlineData(new int[] { 18, 69, 15, 73, 39, 71, 87, 23, 13, 74 }, "5,3,2,1;7,5,3,2;8,7,5,3;9,8,7,5")]
    [InlineData(new int[] { 93, 89, 39, 82, 73, 87, 57, 36, 91, 49 }, "5,4,3,2,1;6,5,4,3,2;7,6,5,4,3;8,7,6,5,4;9,8,7,6,5")]
    [InlineData(new int[] { 56, 41, 78, 64, 77, 65, 25, 88, 35, 57 }, "5,4,3,2,1,0;6,5,4,3,2,1;7,6,5,4,3,2;8,7,6,5,4,3;9,8,7,6,5,4;10,9,8,7,6,5")]
    [InlineData(new int[] { 21, 57, 51, 70, 35, 17, 55, 70, 35, 90 }, "5,4,3,2,1,0,0;6,5,4,3,2,1,0;7,6,5,4,3,2,1;8,7,6,5,4,3,2;9,8,7,6,5,4,3;10,9,8,7,6,5,4;10,10,9,8,7,6,5")]
    [InlineData(new int[] { 13, 29, 60, 25, 43, 26, 61, 79, 78, 0 }, "5,4,4,3,2,1,0,0;6,5,4,4,3,2,1,0;6,6,5,4,4,3,2,1;7,6,6,5,4,4,3,2;8,7,6,6,5,4,4,3;9,8,7,6,6,5,4,4;10,9,8,7,6,6,5,4;10,10,9,8,7,6,6,5")]
    public void CalculatesAgreedPayOffMatrixForStrengthGroups(int[] scores, string expected)
    {
        var division = Division("Matrix", Enumerable.Range(0, scores.Length * 2)
            .Select(index => ($"Team {index}", Array.Empty<string>())).ToArray());
        var divisions = Divisions(division);
        var matches = scores.Select((score, index) =>
            Match($"Team {index * 2}", $"Team {index * 2 + 1}", score, 100 - score)).ToArray();

        new StrategyDataCalculator(divisions).UpdateStrategyDataWith(Rankings(), Tables(divisions), Fixtures(("Matrix", matches)));

        var expectedRows = expected.Split(';').Select(row => row.Split(',').Select(int.Parse).ToArray()).ToArray();
        Assert.Equal(expectedRows.Length, division.StrengthGroupsCount);
        Assert.NotNull(division.PayOffMatrix);
        Assert.Equal(expectedRows.Length, division.PayOffMatrix.Length);
        for (var row = 0; row < expectedRows.Length; row++)
            Assert.Equal(expectedRows[row], division.PayOffMatrix[row]);
    }

    [Fact]
    public void MoreThanEightStrengthGroupsThrows()
    {
        int[] scores = [73, 74, 50, 6, 28, 5, 71, 17, 37, 53];
        var division = Division("Too many", Enumerable.Range(0, scores.Length * 2)
            .Select(index => ($"Team {index}", Array.Empty<string>())).ToArray());
        var divisions = Divisions(division);
        var matches = scores.Select((score, index) =>
            Match($"Team {index * 2}", $"Team {index * 2 + 1}", score, 100 - score)).ToArray();

        var exception = Assert.Throws<InvalidOperationException>(() => new StrategyDataCalculator(divisions)
            .UpdateStrategyDataWith(Rankings(), Tables(divisions), Fixtures(("Too many", matches))));

        Assert.Contains("9 strength groups", exception.Message);
        Assert.Null(division.PayOffMatrix);
    }

    [Fact]
    public void GroupsUseStrengthBlendedFromRankingAndPlayerResults()
    {
        var division = Division("Blended", ("A", new[] { "Eighty" }), ("B", new[] { "Low", "High" }),
            ("C", Array.Empty<string>()), ("D", Array.Empty<string>()), ("E", Array.Empty<string>()));
        var divisions = Divisions(division);
        var matches = new[]
        {
            Match("A", "B", 1, 9, [new("Eighty", 1, 2)]),
            Match("C", "D", 9, 1),
            Match("C", "E", 9, 1)
        };

        new StrategyDataCalculator(divisions).UpdateStrategyDataWith(
            Rankings(("Low", 100), ("High", 200), ("Eighty", 180)), Tables(divisions), Fixtures(("Blended", matches)));

        var team = division.Teams["A"];
        Assert.Equal(62m, team.Players["Eighty"].RecentStrength);
        Assert.Equal(45.1m, team.RecentStrength);
        Assert.Equal(new int?[] { 1, 2, 2, 1, 1 }, division.Teams.Values.Select(item => item.RecentStrengthGroup));
        Assert.Equal(new[] { 90m - team.RecentStrength!.Value }, division.StrengthGroupsGaps);
    }

    [Fact]
    public void MissingStrengthClearsDivisionGroupsAndLaterCalculationRestoresThem()
    {
        var first = Division("First", Enumerable.Range(0, 4).Select(index => ($"Team {index}", Array.Empty<string>())).ToArray());
        var second = Division("Second", ("Other A", Array.Empty<string>()), ("Other B", Array.Empty<string>()));
        var divisions = Divisions(first, second);
        var firstMatches = new[] { Match("Team 0", "Team 1", 9, 1), Match("Team 2", "Team 3", 9, 1) };
        var secondMatches = new[] { Match("Other A", "Other B", 8, 2) };
        var calculator = new StrategyDataCalculator(divisions);

        calculator.UpdateStrategyDataWith(Rankings(), Tables(divisions), Fixtures(("First", firstMatches), ("Second", secondMatches)));
        Assert.Equal(new int?[] { 2, 1, 2, 1 }, first.Teams.Values.Select(team => team.RecentStrengthGroup));
        Assert.Equal(2, first.StrengthGroupsCount);
        Assert.Equal(new decimal[] { 80 }, first.StrengthGroupsGaps);
        Assert.Equal(new[] { 5, 3 }, first.PayOffMatrix![0]);

        calculator.UpdateStrategyDataWith(Rankings(), Tables(divisions), Fixtures(("First", firstMatches.Take(1).ToArray()), ("Second", secondMatches)));
        Assert.All(first.Teams.Values, team => Assert.Null(team.RecentStrengthGroup));
        Assert.Null(first.StrengthGroupsCount);
        Assert.Null(first.StrengthGroupsGaps);
        Assert.Null(first.PayOffMatrix);
        Assert.All(second.Teams.Values, team => Assert.Equal(1, team.RecentStrengthGroup));
        Assert.Equal(1, second.StrengthGroupsCount);
        Assert.Empty(second.StrengthGroupsGaps!);

        calculator.UpdateStrategyDataWith(Rankings(), Tables(divisions), Fixtures(("First", firstMatches), ("Second", secondMatches)));
        Assert.Equal(new int?[] { 2, 1, 2, 1 }, first.Teams.Values.Select(team => team.RecentStrengthGroup));
        Assert.Equal(2, first.StrengthGroupsCount);
        Assert.Equal(new decimal[] { 80 }, first.StrengthGroupsGaps);
        Assert.Equal(new[] { 5, 3 }, first.PayOffMatrix![0]);
    }

    [Fact]
    public void OneTeamWithZeroLookbackRemainsUngrouped()
    {
        var division = Division("Single", ("Only", Array.Empty<string>()));
        var divisions = Divisions(division);

        new StrategyDataCalculator(divisions).UpdateStrategyDataWith(Rankings(), Tables(divisions), new());

        Assert.Null(division.Teams["Only"].RecentStrengthGroup);
    }

    [Fact]
    public void ForecastAddsBothOrientationsAndBonusForEachRemainingMatch()
    {
        var division = Division("First", Enumerable.Range(0, 4).Select(i => ($"Team {i}", Array.Empty<string>())).ToArray());
        division.BonusPointsPerMatchPlayed = 3;
        var divisions = Divisions(division);
        var tables = Tables(divisions);
        foreach (var name in division.Teams.Keys)
            tables["First"].TeamsStanding[name] = new TeamStanding(1, 0, 0, 20);
        var matches = new[] { Match("Team 0", "Team 1", 9, 1), Match("Team 2", "Team 3", 9, 1),
            Match("Team 0", "Team 1", 0, 0, played: false), Match("Team 1", "Team 0", 0, 0, played: false),
            Match("Team 0", "Team 2", 0, 0, played: false) };

        new StrategyDataCalculator(divisions).UpdateStrategyDataWith(Rankings(), tables, Fixtures(("First", matches)));

        Assert.Equal(48, division.Teams["Team 0"].FinalPointsForecast);
        Assert.Equal(32, division.Teams["Team 1"].FinalPointsForecast);
        Assert.Equal(28, division.Teams["Team 2"].FinalPointsForecast);
        Assert.Equal(20, division.Teams["Team 3"].FinalPointsForecast);
    }

    [Fact]
    public void MissingMatrixOnlyMakesTeamsWithRemainingFixturesUnavailableAndRecalculationResetsForecasts()
    {
        var first = Division("First", ("A", Array.Empty<string>()), ("B", Array.Empty<string>()), ("C", Array.Empty<string>()));
        var second = Division("Second", ("D", Array.Empty<string>()), ("E", Array.Empty<string>()));
        var divisions = Divisions(first, second);
        var tables = Tables(divisions);
        var calculator = new StrategyDataCalculator(divisions);
        var remaining = Match("A", "B", 0, 0, played: false);
        calculator.UpdateStrategyDataWith(Rankings(), tables, Fixtures(("First", [remaining]), ("Second", [Match("D", "E", 5, 5)])));

        Assert.Null(first.PayOffMatrix);
        Assert.Null(first.Teams["A"].FinalPointsForecast);
        Assert.Null(first.Teams["B"].FinalPointsForecast);
        Assert.Equal(0, first.Teams["C"].FinalPointsForecast);
        Assert.Equal(0, second.Teams["D"].FinalPointsForecast);

        calculator.UpdateStrategyDataWith(Rankings(), tables, Fixtures(("First", [Match("A", "B", 5, 5), Match("A", "C", 5, 5), remaining])));
        Assert.Equal(5, first.Teams["A"].FinalPointsForecast);
        Assert.Equal(5, first.Teams["B"].FinalPointsForecast);
        Assert.Equal(0, first.Teams["C"].FinalPointsForecast);
        Assert.Equal(0, second.Teams["D"].FinalPointsForecast);

        calculator.UpdateStrategyDataWith(Rankings(), tables, new());
        Assert.All(first.Teams.Values, team => Assert.Equal(0, team.FinalPointsForecast));
    }

    [Fact]
    public void ForecastUsesCheckedArithmetic()
    {
        var division = Division("First", ("A", Array.Empty<string>()), ("B", Array.Empty<string>()));
        var divisions = Divisions(division);
        var tables = Tables(divisions);
        tables["First"].TeamsStanding["A"] = new TeamStanding(1, 0, 0, int.MaxValue);
        var matches = new[] { Match("A", "B", 5, 5), Match("A", "B", 0, 0, played: false) };

        Assert.Throws<OverflowException>(() => new StrategyDataCalculator(divisions)
            .UpdateStrategyDataWith(Rankings(), tables, Fixtures(("First", matches))));
    }

    [Fact]
    public void AwayForecastUsesCheckedArithmetic()
    {
        var division = Division("First", ("A", Array.Empty<string>()), ("B", Array.Empty<string>()));
        var divisions = Divisions(division);
        var tables = Tables(divisions);
        tables["First"].TeamsStanding["B"] = new TeamStanding(1, 0, 0, int.MaxValue);
        var matches = new[] { Match("A", "B", 5, 5), Match("A", "B", 0, 0, played: false) };

        Assert.Throws<OverflowException>(() => new StrategyDataCalculator(divisions)
            .UpdateStrategyDataWith(Rankings(), tables, Fixtures(("First", matches))));
    }

    [Fact]
    public void ForecastsUseEachDivisionsBonusAndLatestStandingsOnRecalculation()
    {
        var first = Division("First", ("A", Array.Empty<string>()), ("B", Array.Empty<string>()));
        var second = Division("Second", ("C", Array.Empty<string>()), ("D", Array.Empty<string>()));
        first.BonusPointsPerMatchPlayed = 3;
        var divisions = Divisions(first, second);
        var tables = Tables(divisions);
        var fixtures = Fixtures(
            ("First", [Match("A", "B", 5, 5), Match("A", "B", 0, 0, played: false)]),
            ("Second", [Match("C", "D", 5, 5), Match("C", "D", 0, 0, played: false)]));
        var calculator = new StrategyDataCalculator(divisions);

        Assert.Equal(0, second.BonusPointsPerMatchPlayed);
        calculator.UpdateStrategyDataWith(Rankings(), tables, fixtures);
        Assert.Equal(8, first.Teams["A"].FinalPointsForecast);
        Assert.Equal(8, first.Teams["B"].FinalPointsForecast);
        Assert.Equal(5, second.Teams["C"].FinalPointsForecast);
        Assert.Equal(5, second.Teams["D"].FinalPointsForecast);

        tables["First"].TeamsStanding["A"] = new TeamStanding(1, 5, 5, 17);
        tables["First"].TeamsStanding["B"] = new TeamStanding(1, 5, 5, 12);
        tables["Second"].TeamsStanding["C"] = new TeamStanding(1, 5, 5, 9);
        calculator.UpdateStrategyDataWith(Rankings(), tables, fixtures);
        Assert.Equal(25, first.Teams["A"].FinalPointsForecast);
        Assert.Equal(20, first.Teams["B"].FinalPointsForecast);
        Assert.Equal(14, second.Teams["C"].FinalPointsForecast);
        Assert.Equal(5, second.Teams["D"].FinalPointsForecast);
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
        new StrategyDataCalculator(divisions).UpdateStrategyDataWith( ranked, Tables(divisions), new());

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

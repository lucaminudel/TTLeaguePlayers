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
        Assert.Equal(0m, first.Teams["A"].Players["Low"].NormalisedCurrentRanking);
        Assert.Equal(50m, first.Teams["A"].Players["Middle"].NormalisedCurrentRanking);
        Assert.Equal(100m, first.Teams["B"].Players["High"].NormalisedCurrentRanking);
        Assert.Equal(33m, first.Teams["B"].Players["Third"].NormalisedCurrentRanking);
        Assert.Equal(100m, second.Teams["C"].Players["Middle"].NormalisedCurrentRanking);
        Assert.Equal(1, first.TeamsLookbackPeriod);
        Assert.Equal(0, first.Teams["A"].Played);
        Assert.Equal(2, tables.Count);
        Assert.Single(fixtures);
        Assert.Null(ranked["middle"].NormalisedCurrentRanking);
    }

    [Fact]
    public void ClearsMissingAndZeroValuesAndRecalculatesOnRepeatedCalls()
    {
        var division = Division("One", ("A", new[] { "A", "B", "Zero", "Missing" }));
        var divisions = Divisions(division);
        Calculate(divisions, Rankings(("A", 100), ("B", 400), ("Zero", 0), ("Missing", 200)));
        Assert.Equal(100m / 3m, division.Teams["A"].Players["Missing"].NormalisedCurrentRanking);

        Calculate(divisions, Rankings(("A", 200), ("B", 400), ("Zero", 0)));

        var players = division.Teams["A"].Players;
        Assert.Equal(200, players["A"].CurrentRanking);
        Assert.Equal(0m, players["A"].NormalisedCurrentRanking);
        Assert.Equal(100m, players["B"].NormalisedCurrentRanking);
        Assert.Equal(0, players["Zero"].CurrentRanking);
        Assert.Null(players["Zero"].NormalisedCurrentRanking);
        Assert.Null(players["Missing"].CurrentRanking);
        Assert.Null(players["Missing"].NormalisedCurrentRanking);
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
        Assert.All(same.Teams["A"].Players.Values, player => Assert.Null(player.NormalisedCurrentRanking));
        Assert.Null(unknown.Teams["B"].Players["Missing"].NormalisedCurrentRanking);
        Calculate(new OrderedDictionary<string, Division>(), Rankings());
    }

    [Fact]
    public void NormalizationUsesDecimalArithmeticAtIntegerExtremes()
    {
        var division = Division("One", ("A", new[] { "Low", "High" }));
        Calculate(Divisions(division), Rankings(("Low", int.MinValue), ("High", int.MaxValue)));
        Assert.Equal(0m, division.Teams["A"].Players["Low"].NormalisedCurrentRanking);
        Assert.Equal(100m, division.Teams["A"].Players["High"].NormalisedCurrentRanking);
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
        Assert.Equal(73, first.Teams["Team 1"].TotalPoints);
        Assert.Equal(100m * 55m / 60m, first.Teams["Team 1"].TeamWinPercentage);
        Assert.Equal(100m / 3m, second.Teams["Other"].TeamWinPercentage);
        Assert.Null(first.Teams["Team 2"].TeamWinPercentage);
        tables["Premier"].TeamsStanding["Team 1"] = new TeamStanding(0, 0, 0, 0);
        StrategyDataCalculation.CalculateStrategyData(divisions, Rankings(), tables, new());
        Assert.Null(first.Teams["Team 1"].TeamWinPercentage);
        Assert.Equal(0, first.Teams["Team 1"].Played);
    }

    [Fact]
    public void PercentageHandlesLargeSetCountsWithoutIntegerOverflow()
    {
        var divisions = Divisions(Division("One", ("A", Array.Empty<string>())));
        var tables = Tables(divisions);
        tables["One"].TeamsStanding["A"] = new TeamStanding(1, int.MaxValue, int.MaxValue, 0);
        StrategyDataCalculation.CalculateStrategyData(divisions, Rankings(), tables, new());
        Assert.Equal(50m, divisions["One"].Teams["A"].TeamWinPercentage);
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

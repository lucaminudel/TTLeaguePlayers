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
        var tables = new OrderedDictionary<string, DivisionTable> { ["First"] = new("First") };
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
        Assert.Equal(4, first.TeamsLookbackPeriod);
        Assert.Equal(7, first.Teams["A"].Played);
        Assert.Single(tables);
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

    private static void Calculate(OrderedDictionary<string, Division> divisions, IReadOnlyDictionary<string, Player> ranked) =>
        StrategyDataCalculation.CalculateStrategyData(divisions, ranked, new(), new());

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
        var id = 0;
        foreach (var (teamName, names) in teams)
        {
            var team = new Team(teamName, ++id);
            foreach (var player in names) team.Players.Add(player, new Player(player, null));
            division.Teams.Add(teamName, team);
        }
        return division;
    }
}

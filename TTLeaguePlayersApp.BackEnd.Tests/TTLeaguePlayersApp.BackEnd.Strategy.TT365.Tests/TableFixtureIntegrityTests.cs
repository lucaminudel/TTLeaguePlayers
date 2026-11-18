using TTLeaguePlayersApp.BackEnd.Strategy.TT365;
using TTLeaguePlayersApp.BackEnd.TTLeaguePlayersApp.BackEnd.Strategy.Lambdas;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.Tests.Strategy.TT365;

public sealed class TableFixtureIntegrityTests
{
    [Fact]
    public void ComparesBothSidesOfPlayedFixturesAndIgnoresUnplayed()
    {
        var table = new DivisionTable("Division 1");
        table.TeamsStanding.Add("Home", new TeamStanding(1, 6, 4, 0));
        table.TeamsStanding.Add("Away", new TeamStanding(1, 4, 6, 0));
        var tables = new OrderedDictionary<string, DivisionTable> { ["Division 1"] = table };
        var fixtures = new OrderedDictionary<string, List<Fixture>>
        {
            ["division 1"] = [
                new Fixture(new DateOnly(2026, 10, 1), true, "home", "AWAY", 6, 4, [], []),
                new Fixture(new DateOnly(2026, 10, 8), false, "Home", "Away", null, null, [], [])]
        };

        Assert.Empty(new CLTTLStrategy2026Parser().CheckTableFixtureIntegrity(tables, fixtures));
    }

    [Fact]
    public void ReportsTeamValuesForEachKindOfMismatch()
    {
        var table = new DivisionTable("Premier");
        table.TeamsStanding.Add("P", new TeamStanding(2, 6, 4, 0));
        table.TeamsStanding.Add("SF", new TeamStanding(1, 7, 4, 0));
        table.TeamsStanding.Add("SA", new TeamStanding(1, 6, 5, 0));
        var tables = new OrderedDictionary<string, DivisionTable> { ["Premier"] = table };
        var fixtures = new OrderedDictionary<string, List<Fixture>> { ["Premier"] = [
            new Fixture(new DateOnly(2026, 10, 1), true, "P", "Opponent", 6, 4, [], []),
            new Fixture(new DateOnly(2026, 10, 1), true, "SF", "Opponent", 6, 4, [], []),
            new Fixture(new DateOnly(2026, 10, 1), true, "SA", "Opponent", 6, 4, [], [])] };

        var anomalies = new CLTTLStrategy2026Parser().CheckTableFixtureIntegrity(tables, fixtures);

        Assert.Equal(3, anomalies.Count);
        Assert.Contains(anomalies, a => a.Contains("team 'P'") && a.Contains("2/6/4; fixtures = 1/6/4"));
        Assert.Contains(anomalies, a => a.Contains("team 'SF'") && a.Contains("1/7/4; fixtures = 1/6/4"));
        Assert.Contains(anomalies, a => a.Contains("team 'SA'") && a.Contains("1/6/5; fixtures = 1/6/4"));

    }
    [Fact]
    public void AcceptsZeroStandingsForPresentDivisionWithNoPlayedFixtures()
    {
        var table = new DivisionTable("Premier");
        table.TeamsStanding.Add("A", new TeamStanding(0, 0, 0, 0));
        var tables = new OrderedDictionary<string, DivisionTable> { ["Premier"] = table };
        var fixtures = new OrderedDictionary<string, List<Fixture>> { ["Premier"] = [] };

        Assert.Empty(new CLTTLStrategy2026Parser().CheckTableFixtureIntegrity(tables, fixtures));
    }

    [Fact]
    public void RejectsMissingFixtureDivisionEvenForZeroStandings()
    {
        var table = new DivisionTable("Missing");
        table.TeamsStanding.Add("Absent", new TeamStanding(0, 0, 0, 0));
        var tables = new OrderedDictionary<string, DivisionTable> { ["Missing"] = table };
        
        Assert.Throws<InvalidOperationException>(() => new CLTTLStrategy2026Parser().CheckTableFixtureIntegrity(tables, new()));
    }
}

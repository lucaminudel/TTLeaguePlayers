using System.Text.Json;
using TTLeaguePlayersApp.BackEnd.Strategy.TT365;
using TTLeaguePlayersApp.BackEnd.TTLeaguePlayersApp.BackEnd.Strategy.Lambdas;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.Tests.Strategy.TT365;

public sealed class LeagueTablesParserTests
{
    [Fact]
    public void ParseDivisionTables_ReturnsEveryExpectedStanding()
    {
        using var expected = JsonDocument.Parse(ReadScenario("ExpectedStandings.json"));
        var html = ParserPageImpersonator.Fetch("League Tables", ReadFixture());
        var tables = new CLTTLStrategy2026Parser().ParseDivisionTables(html);
        CheckTables(expected.RootElement, tables);
    }

    [Fact]
    public void ParseDivisionTables_ExtractsAllSuppliedDivisionsInStandingsOrder()
    {
        var parser = new CLTTLStrategy2026Parser();

        var tables = parser.ParseDivisionTables(ParserPageImpersonator.Fetch("League Tables", ReadFixture()));

        Assert.Equal(
            ["Premier", "Division 1", "Division 2", "Division 3", "Division 4", "Division 5", "Division 6", "Division 7"],
            tables.Keys);
        Assert.Equal(12, tables["Premier"].TeamsStanding.Count);
        Assert.Equal(11, tables["Division 4"].TeamsStanding.Count);
        Assert.Equal(10, tables["Division 6"].TeamsStanding.Count);
        Assert.Equal(11, tables["Premier"].TeamsLookbackPeriod);
        Assert.Equal(5, tables["Premier"].PlayersLookbackPeriod);
        Assert.Equal(10, tables["Division 4"].TeamsLookbackPeriod);
        Assert.Equal(5, tables["Division 4"].PlayersLookbackPeriod);
        Assert.Equal(
            ["St Katharines Trust 1", "AA Academy 1", "Fusion 1"],
            tables["Premier"].TeamsStanding.Keys.Take(3));

        var firstStanding = tables["Premier"].TeamsStanding["st katharines trust 1"];
        Assert.Equal(6, firstStanding.Played);
        Assert.Equal(55, firstStanding.SetsFor);
        Assert.Equal(5, firstStanding.SetsAgainst);
        Assert.Equal(73, firstStanding.TotalPoints);
        Assert.Equal(6, tables["Premier"].TeamsStanding["AA Academy 1"].Played);
    }

    [Fact]
    public void ParseDivisionTables_PreservesZeroValuesAndNormalizesHtmlNames()
    {
        var html = ReadScenario("PreservesZeroValuesAndNormalizesHtmlNames.html");

        var tables = new CLTTLStrategy2026Parser().ParseDivisionTables(ParserPageImpersonator.Fetch("League Tables", html));

        Assert.Equal(["Division 1"], tables.Keys);
        Assert.Equal(["North & South 1"], tables["Division 1"].TeamsStanding.Keys);
        var standing = tables["Division 1"].TeamsStanding["North & South 1"];
        Assert.Equal(0, standing.Played);
        Assert.Equal(0, standing.SetsFor);
        Assert.Equal(0, standing.SetsAgainst);
        Assert.Equal(0, standing.TotalPoints);
        Assert.Equal(0, tables["Division 1"].TeamsLookbackPeriod);
        Assert.Equal(0, tables["Division 1"].PlayersLookbackPeriod);
    }

    [Theory]
    [InlineData("Empty.html")]
    [InlineData("MalformedStructure1.html")]
    [InlineData("MalformedStructure2.html")]
    [InlineData("MalformedStructure3.html")]
    public void ParseDivisionTables_ThrowsForMissingOrMalformedRequiredStructure(string fixtureName)
    {
        Assert.Throws<InvalidOperationException>(() => new CLTTLStrategy2026Parser().ParseDivisionTables(ParserPageImpersonator.Fetch("League Tables", ReadScenario(fixtureName))));
    }

    [Fact]
    public void ParseDivisionTables_PreservesRowOrderWithoutPositionColumn()
    {
        var html = ReadScenario("PreservesRowOrderWithoutPositionColumn.html");

        var tables = new CLTTLStrategy2026Parser().ParseDivisionTables(ParserPageImpersonator.Fetch("League Tables", html));

        Assert.Equal(["Second alphabetically", "First alphabetically"], tables["Premier"].TeamsStanding.Keys);
        Assert.Equal(1, tables["Premier"].TeamsStanding["First alphabetically"].Played);
    }

    [Fact]
    public void ParseDivisionTables_ThrowsWhenMalformedRowFollowsValidTeam()
    {
        var html = ReadScenario("ThrowsWhenMalformedRowFollowsValidTeam.html");

        Assert.Throws<InvalidOperationException>(() => new CLTTLStrategy2026Parser().ParseDivisionTables(ParserPageImpersonator.Fetch("League Tables", html)));
    }

    [Fact]
    public void ParseDivisionTables_ThrowsForDuplicateHeadersAndTeamNames()
    {
        var duplicateHeaders = ReadScenario("DuplicateHeaders.html");
        var duplicateTeams = ReadScenario("DuplicateTeams.html");

        var parser = new CLTTLStrategy2026Parser();

        Assert.Throws<InvalidOperationException>(() => parser.ParseDivisionTables(ParserPageImpersonator.Fetch("League Tables", duplicateHeaders)));
        Assert.Throws<InvalidOperationException>(() => parser.ParseDivisionTables(ParserPageImpersonator.Fetch("League Tables", duplicateTeams)));
    }

    [Fact]
    public void ParseDivisionTables_RejectsUnequalDivisionSetsForAndAgainst()
    {
        var html = ReadScenario("PreservesZeroValuesAndNormalizesHtmlNames.html");
        var changed = html.Replace("<td>0</td><td>0</td><td>0</td><td>0</td>", "<td>0</td><td>1</td><td>0</td><td>0</td>", StringComparison.Ordinal);
        Assert.NotEqual(html, changed);
        
        Assert.Throws<InvalidOperationException>(() => new CLTTLStrategy2026Parser().ParseDivisionTables(ParserPageImpersonator.Fetch("League Tables", changed)));
    }

    [Fact]
    public void DivisionAndTeam_LeaveStrategyFieldsUnsetUntilStrategyCalculation()
    {
        var division = new Division("Premier");
        var team = new Team("Team");

        Assert.Null(division.TeamsLookbackPeriod);
        Assert.Null(division.PlayersLookbackPeriod);
        Assert.Null(team.Played);
        Assert.Null(team.Points);
        Assert.Null(team.WinPercentage);
    }

    internal static void CheckTables(JsonElement expected, OrderedDictionary<string, DivisionTable> tables)
    {
        Assert.Equal(expected.EnumerateArray().Select(d => DivisionName(d.GetProperty("name").GetString()!)), tables.Keys);
        foreach (var division in expected.EnumerateArray())
        {
            var table = tables[DivisionName(division.GetProperty("name").GetString()!)];
            var teams = division.GetProperty("teams");
            Assert.Equal(teams.EnumerateArray().Select(t => t.GetProperty("name").GetString()), table.TeamsStanding.Keys);
            Assert.Equal(teams.GetArrayLength() - 1, table.TeamsLookbackPeriod);
            Assert.Equal((teams.GetArrayLength() - 1) / 2, table.PlayersLookbackPeriod);
            foreach (var team in teams.EnumerateArray())
            {
                var standing = table.TeamsStanding[team.GetProperty("name").GetString()!];
                Assert.Equal(team.GetProperty("played").GetInt32(), standing.Played);
                Assert.Equal(team.GetProperty("setsFor").GetInt32(), standing.SetsFor);
                Assert.Equal(team.GetProperty("setsAgainst").GetInt32(), standing.SetsAgainst);
                Assert.Equal(team.GetProperty("totalPoints").GetInt32(), standing.TotalPoints);
            }
        }
    }

    private static string DivisionName(string name)
    {
        var words = new[] { "One", "Two", "Three", "Four", "Five", "Six", "Seven" };
        for (var i = 0; i < words.Length; i++)
            if (name == $"Division {words[i]}") return $"Division {i + 1}";
        return name;
    }

    private static string ReadFixture() =>
        File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "LeagueTables", "LeagueTables.html"));
    private static string ReadScenario(string name) => File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "LeagueTables", name));
}

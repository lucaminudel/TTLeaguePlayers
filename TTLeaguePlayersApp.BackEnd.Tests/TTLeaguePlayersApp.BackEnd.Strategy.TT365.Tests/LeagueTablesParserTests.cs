using TTLeaguePlayersApp.BackEnd.Strategy.TT365;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.Tests.Strategy.TT365;

public sealed class LeagueTablesParserTests
{
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
    public void DivisionAndTeam_LeaveStrategyFieldsUnsetUntilStrategyCalculation()
    {
        var division = new Division("Premier");
        var team = new Team("Team", 1);

        Assert.Null(division.TeamsLookbackPeriod);
        Assert.Null(division.PlayersLookbackPeriod);
        Assert.Null(team.Played);
        Assert.Null(team.SetsFor);
        Assert.Null(team.SetsAgainst);
        Assert.Null(team.TotalPoints);
    }

    private static string ReadFixture() =>
        File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "LeagueTables", "LeagueTables.html"));
    private static string ReadScenario(string name) => File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "LeagueTables", name));
}

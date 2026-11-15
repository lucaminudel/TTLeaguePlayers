using TTLeaguePlayersApp.BackEnd.Strategy.TT365;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.Tests.Strategy.TT365;

public sealed class LeagueTablesParserTests
{
    [Fact]
    public void ParseDivisionTables_ExtractsAllSuppliedDivisionsInStandingsOrder()
    {
        var parser = new CLTTLStrategy2026Parser();

        var tables = parser.ParseDivisionTables(ReadFixture());

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
        const string html = """
            <div class="tt-table-section"><h3 class="tt-table-division-title">Division One</h3>
              <table class="tt-league-table"><thead><tr><th>#</th><th>Team</th><th>P</th><th>SF</th><th>SA</th><th>Pts</th></tr></thead>
                <tbody><tr><td>1</td><td><a>North &amp; South&nbsp;1</a></td><td>0</td><td>0</td><td>0</td><td>0</td></tr></tbody>
              </table>
            </div>
            """;

        var tables = new CLTTLStrategy2026Parser().ParseDivisionTables(html);

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
    [InlineData("")]
    [InlineData("<div class='tt-table-section'><h3 class='tt-table-division-title'>Premier</h3></div>")]
    [InlineData("<div class='tt-table-section'><h3 class='tt-table-division-title'>Premier</h3><table class='tt-league-table'><thead><tr><th>#</th><th>Team</th><th>P</th><th>SF</th><th>SA</th><th>Pts</th></tr></thead><tbody></tbody></table></div>")]
    [InlineData("<div class='tt-table-section'><h3 class='tt-table-division-title'>Premier</h3><table class='tt-league-table'><thead><tr><th>#</th><th>Team</th><th>P</th><th>SF</th><th>SA</th><th>Pts</th></tr></thead><tbody><tr><td>1</td><td>Team</td><td>x</td><td>0</td><td>0</td><td>0</td></tr></tbody></table></div>")]
    public void ParseDivisionTables_ThrowsForMissingOrMalformedRequiredStructure(string html)
    {
        Assert.Throws<InvalidOperationException>(() => new CLTTLStrategy2026Parser().ParseDivisionTables(html));
    }

    [Fact]
    public void ParseDivisionTables_PreservesRowOrderWithoutPositionColumn()
    {
        const string html = """
            <div class="tt-table-section"><h3 class="tt-table-division-title">Premier</h3>
              <table class="tt-league-table"><thead><tr><th>Team</th><th>P</th><th>SF</th><th>SA</th><th>Pts</th></tr></thead>
                <tbody><tr><td>Second alphabetically</td><td>0</td><td>0</td><td>0</td><td>0</td></tr>
                <tr><td>First alphabetically</td><td>1</td><td>2</td><td>3</td><td>4</td></tr></tbody>
              </table>
            </div>
            """;

        var tables = new CLTTLStrategy2026Parser().ParseDivisionTables(html);

        Assert.Equal(["Second alphabetically", "First alphabetically"], tables["Premier"].TeamsStanding.Keys);
        Assert.Equal(1, tables["Premier"].TeamsStanding["First alphabetically"].Played);
    }

    [Fact]
    public void ParseDivisionTables_ThrowsWhenMalformedRowFollowsValidTeam()
    {
        const string html = """
            <div class="tt-table-section"><h3 class="tt-table-division-title">Premier</h3>
              <table class="tt-league-table"><thead><tr><th>#</th><th>Team</th><th>P</th><th>SF</th><th>SA</th><th>Pts</th></tr></thead>
                <tbody><tr><td>1</td><td>Team</td><td>0</td><td>0</td><td>0</td><td>0</td></tr><tr></tr></tbody>
              </table>
            </div>
            """;

        Assert.Throws<InvalidOperationException>(() => new CLTTLStrategy2026Parser().ParseDivisionTables(html));
    }

    [Fact]
    public void ParseDivisionTables_ThrowsForDuplicateHeadersAndTeamNames()
    {
        const string duplicateHeaders = """
            <div class="tt-table-section"><h3 class="tt-table-division-title">Premier</h3>
              <table class="tt-league-table"><thead><tr><th>#</th><th>Team</th><th>P</th><th>SF</th><th>SA</th><th>Pts</th><th>Pts</th></tr></thead>
                <tbody><tr><td>1</td><td>Team</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td></tr></tbody></table></div>
            """;
        const string duplicateTeams = """
            <div class="tt-table-section"><h3 class="tt-table-division-title">Premier</h3>
              <table class="tt-league-table"><thead><tr><th>#</th><th>Team</th><th>P</th><th>SF</th><th>SA</th><th>Pts</th></tr></thead>
                <tbody><tr><td>1</td><td>Team</td><td>0</td><td>0</td><td>0</td><td>0</td></tr>
                <tr><td>2</td><td>team</td><td>0</td><td>0</td><td>0</td><td>0</td></tr></tbody></table></div>
            """;

        var parser = new CLTTLStrategy2026Parser();

        Assert.Throws<InvalidOperationException>(() => parser.ParseDivisionTables(duplicateHeaders));
        Assert.Throws<InvalidOperationException>(() => parser.ParseDivisionTables(duplicateTeams));
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
}

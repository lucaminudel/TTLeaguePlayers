using TTLeaguePlayersApp.BackEnd.Strategy.TT365;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.Tests.Strategy.TT365;

public sealed class DivisionsTeamsParserTests
{
    [Fact]
    public void ParseDivisionsAndTeams_PreservesSelectorOrderAndSharesCaseInsensitiveTeamReferences()
    {
        const string html = """
            <select id="teamSelect">
              <option value="">Select a team</option>
              <optgroup label=" Premier ">
                <option value="75301">  Kings &amp; Queens  </option>
                <option value="75302">Wimbledon</option>
              </optgroup>
              <optgroup label="Division One">
                <option value="75410">North &amp; South</option>
              </optgroup>
              <optgroup label="County Cup">
                <option value="75600">Old Town</option>
              </optgroup>
            </select>
            """;
        var parser = new CLTTLStrategy2026Parser();

        var (allDivisions, allTeams) = parser.ParseDivisionsAndTeams(html);

        Assert.Equal(["Premier", "Division 1", "County Cup"], allDivisions.Select(entry => entry.Key));
        Assert.Equal(["Kings & Queens", "Wimbledon", "North & South", "Old Town"], allTeams.Select(entry => entry.Key));
        Assert.Equal(["Kings & Queens", "Wimbledon"], allDivisions["PREMIER"].Teams.Select(entry => entry.Key));
        Assert.Equal(75410, allTeams["north & south"].TeamId);
        Assert.Same(allTeams["NORTH & SOUTH"], allDivisions["division 1"].Teams["North & South"]);
        Assert.Same(allTeams["NORTH & SOUTH"], allDivisions["DIVISION 1"].Teams["north & south"]);
        Assert.Empty(allTeams["North & South"].Players);
    }

    [Theory]
    [InlineData("One", "1")]
    [InlineData("Two", "2")]
    [InlineData("Three", "3")]
    [InlineData("Four", "4")]
    [InlineData("Five", "5")]
    [InlineData("Six", "6")]
    [InlineData("Seven", "7")]
    public void ParseDivisionsAndTeams_NormalizesWordNumberedDivisionLabels(string wordNumber, string numericNumber)
    {
        var parser = new CLTTLStrategy2026Parser();

        var (allDivisions, _) = parser.ParseDivisionsAndTeams(
            Page($"<optgroup label=\"Division {wordNumber}\"><option value=\"1\">Team</option></optgroup>"));

        Assert.Contains($"Division {numericNumber}", allDivisions.Keys);
    }

    [Theory]
    [InlineData("")]
    [InlineData("not-a-number")]
    [InlineData("0")]
    [InlineData("-1")]
    [InlineData("2147483648")]
    public void ParseDivisionsAndTeams_ThrowsWhenATeamIdIsNotPositiveAndNumeric(string teamId)
    {
        var parser = new CLTTLStrategy2026Parser();

        Assert.Throws<InvalidOperationException>(() => parser.ParseDivisionsAndTeams(
            Page($"<optgroup label=\"Premier\"><option value=\"{teamId}\">Team</option></optgroup>")));
    }

    [Fact]
    public void ParseDivisionsAndTeams_IgnoresPlaceholderOptionsOutsideDivisionGroups()
    {
        var parser = new CLTTLStrategy2026Parser();

        var (_, allTeams) = parser.ParseDivisionsAndTeams(
            Page("<option value=\"\">Select a team</option><optgroup label=\"Premier\"><option value=\"1\">Team</option></optgroup>"));

        Assert.Equal(["Team"], allTeams.Keys);
    }

    [Theory]
    [InlineData("<div>missing selector</div>")]
    [InlineData("<select id=\"teamSelect\"></select>")]
    [InlineData("<select id=\"teamSelect\"><optgroup><option value=\"1\">Team</option></optgroup></select>")]
    [InlineData("<select id=\"teamSelect\"><optgroup label=\"Premier\"><option value=\"1\"></option></optgroup></select>")]
    [InlineData("<select id=\"teamSelect\"><optgroup label=\"Premier\"></optgroup></select>")]
    public void ParseDivisionsAndTeams_ThrowsWhenRequiredSelectorStructureIsMissing(string html)
    {
        var parser = new CLTTLStrategy2026Parser();

        Assert.Throws<InvalidOperationException>(() => parser.ParseDivisionsAndTeams(html));
    }

    [Fact]
    public void ParseDivisionsAndTeams_RejectsDivisionNamesThatCollideAfterNormalization()
    {
        var parser = new CLTTLStrategy2026Parser();

        Assert.Throws<InvalidOperationException>(() => parser.ParseDivisionsAndTeams(Page(
            "<optgroup label=\"Division One\"><option value=\"1\">First</option></optgroup>"
            + "<optgroup label=\"division 1\"><option value=\"2\">Second</option></optgroup>")));
    }

    [Theory]
    [InlineData("Division One", "division 1")]
    [InlineData("Division One", "Premier")]
    public void ParseDivisionsAndTeams_RejectsDuplicateTeamNamesAcrossDivisions(string firstDivision, string secondDivision)
    {
        var parser = new CLTTLStrategy2026Parser();

        Assert.Throws<InvalidOperationException>(() => parser.ParseDivisionsAndTeams(Page(
            $"<optgroup label=\"{firstDivision}\"><option value=\"1\">Same Team</option></optgroup>"
            + $"<optgroup label=\"{secondDivision}\"><option value=\"2\">same team</option></optgroup>")));
    }

    private static string Page(string groups) => $"<select id=\"teamSelect\">{groups}</select>";
}

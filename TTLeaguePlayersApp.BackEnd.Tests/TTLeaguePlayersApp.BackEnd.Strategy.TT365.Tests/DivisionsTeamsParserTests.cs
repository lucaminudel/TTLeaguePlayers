using System.Text.Json;
using TTLeaguePlayersApp.BackEnd.Strategy.TT365;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.Tests.Strategy.TT365;

public sealed class DivisionsTeamsParserTests
{
    [Fact]
    public void Eligibility_ParserReturnsEveryExpectedDivisionAndTeam()
    {
        var html = ParserPageImpersonator.Fetch("Divisions Teams List", ReadScenario("CapturedEligibility.html"));
        var (divisions, teams) = new CLTTLStrategy2026Parser().ParseDivisionsAndTeams(html);
        using var expected = JsonDocument.Parse(ReadScenario("ExpectedTeams.json"));
        Assert.Equal(expected.RootElement.GetArrayLength(), divisions.Count);
        Assert.Equal(expected.RootElement.EnumerateArray().Select(d => DivisionName(d.GetProperty("name").GetString()!)), divisions.Keys);
        var expectedTotal = 0;
        foreach (var division in expected.RootElement.EnumerateArray())
        {
            var name = DivisionName(division.GetProperty("name").GetString()!);
            var expectedTeams = division.GetProperty("teams");
            expectedTotal += expectedTeams.GetArrayLength();
            Assert.Equal(expectedTeams.EnumerateArray().Select(t => t.GetProperty("name").GetString()), divisions[name].Teams.Keys);
            foreach (var team in expectedTeams.EnumerateArray())
            {
                var teamName = team.GetProperty("name").GetString()!;
                Assert.Equal(team.GetProperty("id").GetInt32(), teams[teamName].TeamId);
                Assert.Same(teams[teamName], divisions[name].Teams[teamName]);
            }
        }
        Assert.Equal(expectedTotal, teams.Count);
    }

    [Fact]
    public void ParseDivisionsAndTeams_ReadsCapturedEligibilitySelector()
    {
        var html = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "Eligibility", "Eligibility.html"));
        var (_, teams) = new CLTTLStrategy2026Parser().ParseDivisionsAndTeams(ParserPageImpersonator.Fetch("Divisions Teams List", html));

        Assert.Equal(75706, teams["Morpeth 10"].TeamId);
    }

    [Fact]
    public void ParseDivisionsAndTeams_PreservesSelectorOrderAndSharesCaseInsensitiveTeamReferences()
    {
        var html = ReadScenario("PreservesSelectorOrderAndSharesCaseInsensitiveTeamReferences.html");
        var parser = new CLTTLStrategy2026Parser();

        var (allDivisions, allTeams) = parser.ParseDivisionsAndTeams(ParserPageImpersonator.Fetch("Divisions Teams List", html));

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
            Page(Group($"Division {wordNumber}", "1", "Team")));

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
            Page(Group("Premier", teamId, "Team"))));
    }

    [Fact]
    public void ParseDivisionsAndTeams_IgnoresPlaceholderOptionsOutsideDivisionGroups()
    {
        var parser = new CLTTLStrategy2026Parser();

        var (_, allTeams) = parser.ParseDivisionsAndTeams(
            Page(ReadScenario("PlaceholderOption.html") + Group("Premier", "1", "Team")));

        Assert.Equal(["Team"], allTeams.Keys);
    }

    [Theory]
    [InlineData("MalformedStructure1.html")]
    [InlineData("MalformedStructure2.html")]
    [InlineData("MalformedStructure3.html")]
    [InlineData("MalformedStructure4.html")]
    [InlineData("MalformedStructure5.html")]
    public void ParseDivisionsAndTeams_ThrowsWhenRequiredSelectorStructureIsMissing(string fixtureName)
    {
        var parser = new CLTTLStrategy2026Parser();

        Assert.Throws<InvalidOperationException>(() => parser.ParseDivisionsAndTeams(ParserPageImpersonator.Fetch("Divisions Teams List", ReadScenario(fixtureName))));
    }

    [Fact]
    public void ParseDivisionsAndTeams_RejectsDivisionNamesThatCollideAfterNormalization()
    {
        var parser = new CLTTLStrategy2026Parser();

        Assert.Throws<InvalidOperationException>(() => parser.ParseDivisionsAndTeams(Page(
            Group("Division One", "1", "First") + Group("division 1", "2", "Second"))));
    }

    [Theory]
    [InlineData("Division One", "division 1")]
    [InlineData("Division One", "Premier")]
    public void ParseDivisionsAndTeams_RejectsDuplicateTeamNamesAcrossDivisions(string firstDivision, string secondDivision)
    {
        var parser = new CLTTLStrategy2026Parser();

        Assert.Throws<InvalidOperationException>(() => parser.ParseDivisionsAndTeams(Page(
            Group(firstDivision, "1", "Same Team") + Group(secondDivision, "2", "same team"))));
    }

    private static string DivisionName(string name)
    {
        var words = new[] { "One", "Two", "Three", "Four", "Five", "Six", "Seven" };
        for (var i = 0; i < words.Length; i++)
            if (name == $"Division {words[i]}") return $"Division {i + 1}";
        return name;
    }

    private static string Page(string groups) => ParserPageImpersonator.Fetch("Divisions Teams List", ReadScenario("SelectorTemplate.html").Replace("{{GROUPS}}", groups, StringComparison.Ordinal));
    private static string Group(string label, string id, string name) => ReadScenario("GroupTemplate.html")
        .Replace("{{LABEL}}", label, StringComparison.Ordinal)
        .Replace("{{ID}}", id, StringComparison.Ordinal)
        .Replace("{{NAME}}", name, StringComparison.Ordinal);

    private static string ReadScenario(string name) => File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "Eligibility", name));
}

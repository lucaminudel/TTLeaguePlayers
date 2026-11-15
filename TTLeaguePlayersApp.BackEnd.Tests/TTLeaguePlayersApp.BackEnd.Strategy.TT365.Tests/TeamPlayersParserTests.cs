using System.Collections.Generic;
using TTLeaguePlayersApp.BackEnd.Strategy.TT365;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.Tests.Strategy.TT365;

public sealed class TeamPlayersParserTests
{
    [Fact]
    public void ParseTeamPlayers_PreservesRequestedRosterOrderAndDoesNotRequirePlayerIds()
    {
        var requestedTeam = CreateTeam("Requested Team");
        var parser = new CLTTLStrategy2026Parser();

        var anomalies = parser.ParseTeamPlayers(
            """{"teamPlayers":[{"name":"Zulu"},{"id":null,"name":"Alpha"},{"id":"invalid","name":"Middle"}],"otherPlayers":[]}""",
            requestedTeam,
            CreateTeams(requestedTeam));

        Assert.Empty(anomalies);
        Assert.Equal(["Zulu", "Alpha", "Middle"], requestedTeam.Players.Select(entry => entry.Key));
        Assert.All(requestedTeam.Players.Values, player => Assert.Null(player.CurrentRanking));
    }

    [Fact]
    public void ParseTeamPlayers_KeepsValidPlayersAroundMalformedEntriesAndReturnsAnomalies()
    {
        var requestedTeam = CreateTeam("Requested Team");
        var parser = new CLTTLStrategy2026Parser();

        var anomalies = parser.ParseTeamPlayers(
            """{"teamPlayers":[{}, {"name":"Valid Before"}, {"name":"  "}, {"name":"Valid After"}],"otherPlayers":[]}""",
            requestedTeam,
            CreateTeams(requestedTeam));

        Assert.Equal(["Valid Before", "Valid After"], requestedTeam.Players.Select(entry => entry.Key));
        Assert.Equal(2, anomalies.Count);
        Assert.All(anomalies, anomaly => Assert.Contains("player name", anomaly, StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void ParseTeamPlayers_AcceptsAnEmptyRequestedRoster()
    {
        var requestedTeam = CreateTeam("Requested Team");
        var parser = new CLTTLStrategy2026Parser();

        var anomalies = parser.ParseTeamPlayers(
            """{"teamPlayers":[],"otherPlayers":[]}""",
            requestedTeam,
            CreateTeams(requestedTeam));

        Assert.Empty(requestedTeam.Players);
        Assert.Empty(anomalies);
    }

    [Theory]
    [InlineData("""{"teamPlayers":[{}],"otherPlayers":[]}""")]
    [InlineData("""{"teamPlayers":[{"name":" "}],"otherPlayers":[]}""")]
    [InlineData("""{"teamPlayers":[null],"otherPlayers":[]}""")]
    public void ParseTeamPlayers_ThrowsWhenANonemptyRequestedRosterHasNoUsablePlayers(string json)
    {
        var parser = new CLTTLStrategy2026Parser();

        Assert.Throws<InvalidOperationException>(() => parser.ParseTeamPlayers(
            json,
            CreateTeam("Requested Team"),
            CreateTeams(CreateTeam("Requested Team"))));
    }

    [Theory]
    [InlineData("not json")]
    [InlineData("{" )]
    public void ParseTeamPlayers_ThrowsWhenJsonIsInvalid(string json)
    {
        var requestedTeam = CreateTeam("Requested Team");
        var parser = new CLTTLStrategy2026Parser();

        Assert.ThrowsAny<System.Text.Json.JsonException>(() => parser.ParseTeamPlayers(
            json,
            requestedTeam,
            CreateTeams(requestedTeam)));
    }

    [Theory]
    [InlineData("{}")]
    [InlineData("""{"teamPlayers":null}""")]
    [InlineData("""{"teamPlayers":{}}""")]
    public void ParseTeamPlayers_ThrowsWhenRequestedRosterIsMissingOrNotAnArray(string json)
    {
        var requestedTeam = CreateTeam("Requested Team");
        var parser = new CLTTLStrategy2026Parser();

        Assert.Throws<InvalidOperationException>(() => parser.ParseTeamPlayers(
            json,
            requestedTeam,
            CreateTeams(requestedTeam)));
    }

    [Theory]
    [InlineData("""{"teamPlayers":[{"name":"Direct"}]}""")]
    [InlineData("""{"teamPlayers":[{"name":"Direct"}],"otherPlayers":null}""")]
    [InlineData("""{"teamPlayers":[{"name":"Direct"}],"otherPlayers":{}}""")]
    public void ParseTeamPlayers_ReportsUnavailableReusableRostersAndKeepsRequestedPlayers(string json)
    {
        var requestedTeam = CreateTeam("Requested Team");
        var parser = new CLTTLStrategy2026Parser();

        var anomalies = parser.ParseTeamPlayers(json, requestedTeam, CreateTeams(requestedTeam));

        Assert.Equal(["Direct"], requestedTeam.Players.Keys);
        Assert.Contains(anomalies, anomaly => anomaly.Contains("otherPlayers", StringComparison.Ordinal));
    }

    [Fact]
    public void ParseTeamPlayers_GroupsOtherPlayersByCaseInsensitiveTeamNameInApiOrderAcrossDivisions()
    {
        var requestedTeam = CreateTeam("Requested Team", "Division 1", 101);
        var premierTeam = CreateTeam("Premier Team", "Premier", 1);
        var sameDivisionTeam = CreateTeam("Same Division Team", "Division 1", 102);
        var lowerDivisionTeam = CreateTeam("Lower Division Team", "Division 2", 201);
        var allTeams = CreateTeams(requestedTeam, premierTeam, sameDivisionTeam, lowerDivisionTeam);
        var parser = new CLTTLStrategy2026Parser();

        var anomalies = parser.ParseTeamPlayers(
            """{"teamPlayers":[],"otherPlayers":[{"teamName":"lower division team","name":"Lower Player"},{"teamName":"Premier Team","name":"Premier Player"},{"teamName":"SAME DIVISION TEAM","name":"Same One"},{"teamName":"Same Division Team","name":"Same Two"}]}""",
            requestedTeam,
            allTeams);

        Assert.Empty(anomalies);
        Assert.Equal(["Premier Player"], premierTeam.Players.Keys);
        Assert.Equal(["Same One", "Same Two"], sameDivisionTeam.Players.Keys);
        Assert.Equal(["Lower Player"], lowerDivisionTeam.Players.Keys);
    }

    [Fact]
    public void ParseTeamPlayers_SkipsUnknownOtherPlayerTeamsAndRecordsAnAnomaly()
    {
        var requestedTeam = CreateTeam("Requested Team");
        var parser = new CLTTLStrategy2026Parser();

        var anomalies = parser.ParseTeamPlayers(
            """{"teamPlayers":[],"otherPlayers":[{"teamName":"Not In Selector","name":"Unknown Player"}]}""",
            requestedTeam,
            CreateTeams(requestedTeam));

        Assert.Empty(requestedTeam.Players);
        Assert.Contains(anomalies, anomaly => anomaly.Contains("Not In Selector", StringComparison.Ordinal));
    }

    [Fact]
    public void ParseTeamPlayers_MatchesNonbreakingSpaceInOtherTeamName()
    {
        var requestedTeam = CreateTeam("Requested Team");
        var otherTeam = CreateTeam("North South");
        var parser = new CLTTLStrategy2026Parser();

        var anomalies = parser.ParseTeamPlayers(
            """{"teamPlayers":[],"otherPlayers":[{"teamName":"North\u00a0South","name":"Player"}]}""",
            requestedTeam, CreateTeams(requestedTeam, otherTeam));

        Assert.Empty(anomalies);
        Assert.Equal(["Player"], otherTeam.Players.Keys);
    }

    [Fact]
    public void ParseTeamPlayers_KeepsValidPlayersInAPartiallyMalformedReusableGroup()
    {
        var requestedTeam = CreateTeam("Requested Team");
        var reusableTeam = CreateTeam("Reusable Team");
        var parser = new CLTTLStrategy2026Parser();

        var anomalies = parser.ParseTeamPlayers(
            """{"teamPlayers":[],"otherPlayers":[{"teamName":"Reusable Team"},{"teamName":"Reusable Team","name":"Valid Player"}]}""",
            requestedTeam,
            CreateTeams(requestedTeam, reusableTeam));

        Assert.Equal(["Valid Player"], reusableTeam.Players.Keys);
        Assert.Single(anomalies);
    }

    [Fact]
    public void ParseTeamPlayers_ThrowsWhenAReusableGroupContainsNoUsablePlayers()
    {
        var requestedTeam = CreateTeam("Requested Team");
        var reusableTeam = CreateTeam("Reusable Team");
        var parser = new CLTTLStrategy2026Parser();

        Assert.Throws<InvalidOperationException>(() => parser.ParseTeamPlayers(
            """{"teamPlayers":[],"otherPlayers":[{"teamName":"Reusable Team"}]}""",
            requestedTeam,
            CreateTeams(requestedTeam, reusableTeam)));
    }

    [Fact]
    public void ParseTeamPlayers_DoesNotMutateTeamsWhenALaterGroupIsInvalid()
    {
        var requestedTeam = CreateTeam("Requested Team");
        var reusableTeam = CreateTeam("Reusable Team");
        var teams = CreateTeams(requestedTeam, reusableTeam);
        var parser = new CLTTLStrategy2026Parser();

        Assert.Throws<InvalidOperationException>(() => parser.ParseTeamPlayers(
            """{"teamPlayers":[{"name":"Old Player"}],"otherPlayers":[{"teamName":"Reusable Team"}]}""",
            requestedTeam, teams));
        Assert.Empty(requestedTeam.Players);

        parser.ParseTeamPlayers("""{"teamPlayers":[{"name":"Corrected Player"}],"otherPlayers":[]}""", requestedTeam, teams);
        Assert.Equal(["Corrected Player"], requestedTeam.Players.Keys);
    }

    [Fact]
    public void ParseTeamPlayers_DoesNotReplaceOrMergeIntoAPopulatedTeam()
    {
        var requestedTeam = CreateTeam("Requested Team");
        requestedTeam.Players.Add("Existing Player", new Player("Existing Player", 1200));
        var parser = new CLTTLStrategy2026Parser();

        var anomalies = parser.ParseTeamPlayers(
            """{"teamPlayers":[{"name":"Direct Player"}],"otherPlayers":[{"teamName":"Requested Team","name":"Grouped Player"}]}""",
            requestedTeam,
            CreateTeams(requestedTeam));

        Assert.Empty(anomalies);
        Assert.Equal(["Existing Player"], requestedTeam.Players.Keys);
        Assert.Equal(1200, requestedTeam.Players["Existing Player"].CurrentRanking);
    }

    [Theory]
    [InlineData("""{"teamPlayers":[],"otherPlayers":[{}]}""")]
    [InlineData("""{"teamPlayers":[],"otherPlayers":[{"teamName":" "}]}""")]
    public void ParseTeamPlayers_ReportsOtherPlayerEntriesWithoutATeamName(string json)
    {
        var requestedTeam = CreateTeam("Requested Team");
        var parser = new CLTTLStrategy2026Parser();

        var anomalies = parser.ParseTeamPlayers(json, requestedTeam, CreateTeams(requestedTeam));

        Assert.Contains(anomalies, anomaly => anomaly.Contains("team name", StringComparison.OrdinalIgnoreCase));
    }

    private static Team CreateTeam(string name, string divisionName = "Division 1", int teamId = 1) =>
        new(new Division(divisionName), name, teamId);

    private static OrderedDictionary<string, Team> CreateTeams(params Team[] teams)
    {
        var allTeams = new OrderedDictionary<string, Team>(StringComparer.OrdinalIgnoreCase);
        foreach (var team in teams)
            allTeams.Add(team.Name, team);

        return allTeams;
    }
}

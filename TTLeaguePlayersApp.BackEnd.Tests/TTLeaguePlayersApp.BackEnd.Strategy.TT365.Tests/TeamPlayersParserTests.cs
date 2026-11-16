using System.Text.Json;
using System.Collections.Generic;
using TTLeaguePlayersApp.BackEnd.Strategy.TT365;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.Tests.Strategy.TT365;

public sealed class TeamPlayersParserTests
{
    [Fact]
    public void ParseTeamPlayers_ParsesEveryPlayerInCapturedResponse()
    {
        var json = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "Eligibility", "CapturedMorpeth10.json"));
        using var expected = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "Eligibility", "ExpectedCapturedMorpethPlayers.json")));
        var teams = new OrderedDictionary<string, Team>(StringComparer.OrdinalIgnoreCase);
        foreach (var group in expected.RootElement.EnumerateObject())
            teams.Add(group.Name, new Team(group.Name, 1));
        var anomalies = new CLTTLStrategy2026Parser().ParseTeamPlayers(
            ParserPageImpersonator.FetchTeamPlayers(json, "75706"), teams["Morpeth 10"], teams);
        Assert.Empty(anomalies);
        foreach (var group in expected.RootElement.EnumerateObject())
            Assert.Equal(group.Value.EnumerateArray().Select(p => p.GetString()), teams[group.Name].Players.Keys);
    }

    [Fact]
    public void TeamPlayers_ParsesEveryPlayerInCapturedRoster()
    {
        var json = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "Eligibility", "Morpeth10.json"));
        var team = new Team("Morpeth 10", 75706);
        var teams = new OrderedDictionary<string, Team>(StringComparer.OrdinalIgnoreCase) { [team.Name] = team };
        var anomalies = new CLTTLStrategy2026Parser().ParseTeamPlayers(ParserPageImpersonator.FetchTeamPlayers(json, "75706"), team, teams);
        Assert.Empty(anomalies);
        Assert.Equal(Enumerable.Range(1, 6).Select(i => $"Fixture Player {i}"), team.Players.Keys);
        Assert.All(team.Players.Values, player => Assert.Null(player.CurrentRanking));
    }

    [Fact]
    public void ParseTeamPlayers_PreservesRequestedRosterOrderAndDoesNotRequirePlayerIds()
    {
        var requestedTeam = CreateTeam("Requested Team");
        var parser = new CLTTLStrategy2026Parser();

        var anomalies = parser.ParseTeamPlayers(
            FetchFixture("PreservesRequestedRosterOrderAndDoesNotRequirePlayerIds.json"),
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
            FetchFixture("KeepsValidPlayersAroundMalformedEntriesAndReturnsAnomalies.json"),
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
            FetchFixture("AcceptsAnEmptyRequestedRoster.json"),
            requestedTeam,
            CreateTeams(requestedTeam));

        Assert.Empty(requestedTeam.Players);
        Assert.Empty(anomalies);
    }

    [Theory]
    [InlineData("ThrowsWhenANonemptyRequestedRosterHasNoUsablePlayers.json") ]
    [InlineData("ThrowsWhenANonemptyRequestedRosterHasNoUsablePlayers2.json") ]
    [InlineData("ThrowsWhenANonemptyRequestedRosterHasNoUsablePlayers3.json") ]
    public void ParseTeamPlayers_ThrowsWhenANonemptyRequestedRosterHasNoUsablePlayers(string fixtureName)
    {
        var parser = new CLTTLStrategy2026Parser();

        Assert.Throws<InvalidOperationException>(() => parser.ParseTeamPlayers(
            FetchFixture(fixtureName),
            CreateTeam("Requested Team"),
            CreateTeams(CreateTeam("Requested Team"))));
    }

    [Theory]
    [InlineData("ThrowsWhenJsonIsInvalid.json") ]
    [InlineData("ThrowsWhenJsonIsInvalid2.json") ]
    public void ParseTeamPlayers_ThrowsWhenJsonIsInvalid(string fixtureName)
    {
        var requestedTeam = CreateTeam("Requested Team");
        var parser = new CLTTLStrategy2026Parser();

        Assert.ThrowsAny<System.Text.Json.JsonException>(() => parser.ParseTeamPlayers(
            FetchFixture(fixtureName),
            requestedTeam,
            CreateTeams(requestedTeam)));
    }

    [Theory]
    [InlineData("ThrowsWhenRequestedRosterIsMissingOrNotAnArray3.json") ]
    [InlineData("ThrowsWhenRequestedRosterIsMissingOrNotAnArray.json") ]
    [InlineData("ThrowsWhenRequestedRosterIsMissingOrNotAnArray2.json") ]
    public void ParseTeamPlayers_ThrowsWhenRequestedRosterIsMissingOrNotAnArray(string fixtureName)
    {
        var requestedTeam = CreateTeam("Requested Team");
        var parser = new CLTTLStrategy2026Parser();

        Assert.Throws<InvalidOperationException>(() => parser.ParseTeamPlayers(
            FetchFixture(fixtureName),
            requestedTeam,
            CreateTeams(requestedTeam)));
    }

    [Theory]
    [InlineData("ReportsUnavailableReusableRostersAndKeepsRequestedPlayers.json") ]
    [InlineData("ReportsUnavailableReusableRostersAndKeepsRequestedPlayers2.json") ]
    [InlineData("ReportsUnavailableReusableRostersAndKeepsRequestedPlayers3.json") ]
    public void ParseTeamPlayers_ReportsUnavailableReusableRostersAndKeepsRequestedPlayers(string fixtureName)
    {
        var requestedTeam = CreateTeam("Requested Team");
        var parser = new CLTTLStrategy2026Parser();

        var anomalies = parser.ParseTeamPlayers(FetchFixture(fixtureName), requestedTeam, CreateTeams(requestedTeam));

        Assert.Equal(["Direct"], requestedTeam.Players.Keys);
        Assert.Contains(anomalies, anomaly => anomaly.Contains("otherPlayers", StringComparison.Ordinal));
    }

    [Fact]
    public void ParseTeamPlayers_GroupsOtherPlayersByCaseInsensitiveTeamNameInApiOrderAcrossDivisions()
    {
        var requestedTeam = CreateTeam("Requested Team", 101);
        var premierTeam = CreateTeam("Premier Team", 1);
        var sameDivisionTeam = CreateTeam("Same Division Team", 102);
        var lowerDivisionTeam = CreateTeam("Lower Division Team", 201);
        var allTeams = CreateTeams(requestedTeam, premierTeam, sameDivisionTeam, lowerDivisionTeam);
        var parser = new CLTTLStrategy2026Parser();

        var anomalies = parser.ParseTeamPlayers(
            FetchFixture("GroupsOtherPlayersByCaseInsensitiveTeamNameInApiOrderAcrossDivisions.json"),
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
            FetchFixture("SkipsUnknownOtherPlayerTeamsAndRecordsAnAnomaly.json"),
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
            FetchFixture("MatchesNonbreakingSpaceInOtherTeamName.json"),
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
            FetchFixture("KeepsValidPlayersInAPartiallyMalformedReusableGroup.json"),
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
            FetchFixture("ThrowsWhenAReusableGroupContainsNoUsablePlayers.json"),
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
            FetchFixture("DoesNotMutateTeamsWhenALaterGroupIsInvalid.json"),
            requestedTeam, teams));
        Assert.Empty(requestedTeam.Players);

        parser.ParseTeamPlayers(FetchFixture("DoesNotMutateTeamsWhenALaterGroupIsInvalid2.json"), requestedTeam, teams);
        Assert.Equal(["Corrected Player"], requestedTeam.Players.Keys);
    }

    [Fact]
    public void ParseTeamPlayers_DoesNotReplaceOrMergeIntoAPopulatedTeam()
    {
        var requestedTeam = CreateTeam("Requested Team");
        requestedTeam.Players.Add("Existing Player", new Player("Existing Player", 1200));
        var parser = new CLTTLStrategy2026Parser();

        var anomalies = parser.ParseTeamPlayers(
            FetchFixture("DoesNotReplaceOrMergeIntoAPopulatedTeam.json"),
            requestedTeam,
            CreateTeams(requestedTeam));

        Assert.Empty(anomalies);
        Assert.Equal(["Existing Player"], requestedTeam.Players.Keys);
        Assert.Equal(1200, requestedTeam.Players["Existing Player"].CurrentRanking);
    }

    [Theory]
    [InlineData("ReportsOtherPlayerEntriesWithoutATeamName.json") ]
    [InlineData("ReportsOtherPlayerEntriesWithoutATeamName2.json") ]
    public void ParseTeamPlayers_ReportsOtherPlayerEntriesWithoutATeamName(string fixtureName)
    {
        var requestedTeam = CreateTeam("Requested Team");
        var parser = new CLTTLStrategy2026Parser();

        var anomalies = parser.ParseTeamPlayers(FetchFixture(fixtureName), requestedTeam, CreateTeams(requestedTeam));

        Assert.Contains(anomalies, anomaly => anomaly.Contains("team name", StringComparison.OrdinalIgnoreCase));
    }

    private static string FetchFixture(string name)
    {
        var json = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "Eligibility", "TeamPlayers", name));
        return ParserPageImpersonator.FetchTeamPlayers(json, "1");
    }

    private static Team CreateTeam(string name, int teamId = 1) =>
        new(name, teamId);

    private static OrderedDictionary<string, Team> CreateTeams(params Team[] teams)
    {
        var allTeams = new OrderedDictionary<string, Team>(StringComparer.OrdinalIgnoreCase);
        foreach (var team in teams)
            allTeams.Add(team.Name, team);

        return allTeams;
    }
}

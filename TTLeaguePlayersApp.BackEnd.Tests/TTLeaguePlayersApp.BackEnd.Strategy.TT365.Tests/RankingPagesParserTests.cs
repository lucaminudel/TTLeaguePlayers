using TTLeaguePlayersApp.BackEnd.Strategy.TT365;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.Tests.Strategy.TT365;

public class RankingPagesParserTests
{
    [Fact]
    public void ParseRankingPlayers_DecodesEntitiesKeepsZeroSkipsHiddenAndChoosesHigherDuplicateIdAcrossPages()
    {
        var parser = new CLTTLStrategy2026Parser();
        var pages = new[] { ReadFixture("RankingPage1.html"), ReadFixture("RankingPage2.html") };

        var allPlayers = parser.ParseRankingPlayers(pages);

        Assert.Equal(3, allPlayers.Players.Count);
        Assert.Equal("Casey O'Brien", allPlayers.Players["casey o'brien"].Name);
        Assert.Equal(2050, allPlayers.Players["CASEY O'BRIEN"].CurrentRanking);
        Assert.Equal("Riley & Morgan", allPlayers.Players["Riley & Morgan"].Name);
        Assert.Equal(0, allPlayers.Players["Riley & Morgan"].CurrentRanking);
        Assert.Equal("Jordan Smith", allPlayers.Players["Jordan Smith"].Name);
        Assert.False(allPlayers.Players.ContainsKey("Hidden"));
        Assert.Contains(allPlayers.Anomalies, anomaly => anomaly.Contains("Duplicate player name", StringComparison.Ordinal));
        Assert.Contains(allPlayers.Anomalies, anomaly => anomaly.Contains("page 1, row 4", StringComparison.Ordinal));
    }

    [Theory]
    [InlineData("Alex Example", "alex example", "alex example", 9, 200)]
    [InlineData("alex example", "Alex Example", "Alex Example", 9, 200)]
    public void ParseRankingPlayers_UsesHigherIdForCaseInsensitiveDuplicateInEitherOrder(
        string firstName,
        string secondName,
        string retainedName,
        int retainedId,
        int retainedCurrent)
    {
        var parser = new CLTTLStrategy2026Parser();
        var html = RankingPage(Row(firstName, 5, 100) + Row(secondName, retainedId, retainedCurrent));

        var players = parser.ParseRankingPlayers([html]);

        var selected = Assert.Single(players.Players);
        Assert.Equal(retainedName, selected.Key);
        Assert.Equal(retainedName, selected.Value.Name);
        Assert.Equal(retainedCurrent, selected.Value.CurrentRanking);
        Assert.Single(players.Anomalies);
    }

    [Fact]
    public void ParseRankingPlayers_KeepsFirstEntryWhenDuplicateIdsAreEqual()
    {
        var parser = new CLTTLStrategy2026Parser();
        var html = RankingPage(Row("Alex Example", 9, 100) + Row("alex example", 9, 200));

        var players = parser.ParseRankingPlayers([html]);

        Assert.Equal("Alex Example", players.Players["alex example"].Name);
        Assert.Equal(100, players.Players["Alex Example"].CurrentRanking);
        Assert.Contains(players.Anomalies, anomaly => anomaly.Contains("Duplicate player name", StringComparison.Ordinal));
    }

    [Fact]
    public void ParseRankingPlayers_UsesZeroAndReportsMissingOrInvalidMemberIds()
    {
        var parser = new CLTTLStrategy2026Parser();
        var html = RankingPage(Row("No Link", null, 100) + Row("Bad Id", "not-a-number", 200));

        var players = parser.ParseRankingPlayers([html]);

        Assert.Equal(2, players.Players.Count);
        Assert.Equal(2, players.Anomalies.Count);
        Assert.All(players.Anomalies, anomaly => Assert.Contains("using 0", anomaly, StringComparison.Ordinal));
    }

    [Fact]
    public void ParseRankingPlayers_SkipsRowsWithMissingNamesOrNonNumericCurrentAndDescribesEachSkippedRow()
    {
        var parser = new CLTTLStrategy2026Parser();
        var html = RankingPage(Row("Valid Player", 3, 300) + Row("", 1, 100) + Row("Unranked Player", 2, "not ranked"));

        var players = parser.ParseRankingPlayers([html]);

        Assert.Single(players.Players);
        Assert.Equal(2, players.Anomalies.Count);
        Assert.Contains(players.Anomalies, anomaly => anomaly.Contains("missing name", StringComparison.Ordinal));
        Assert.Contains(players.Anomalies, anomaly => anomaly.Contains("numeric Current ranking", StringComparison.Ordinal));
        Assert.Throws<InvalidOperationException>(() => parser.ParseRankingPlayers([RankingPage(Row("", 1, 100))]));
    }

    [Fact]
    public void ParseRankingPlayers_RemovesTheThirdWordAtTheSpecialDoubleSpaceAndPreservesLaterWords()
    {
        var parser = new CLTTLStrategy2026Parser();
        var html = RankingPage(Row("First Second  Removed Fourth Fifth", 1, 1) + Row("First Second Normal Third", 2, 2));

        var players = parser.ParseRankingPlayers([html]);

        Assert.Contains("First Second Fourth Fifth", players.Players.Keys);
        Assert.Contains("First Second Normal Third", players.Players.Keys);
        Assert.Equal(2, players.Players.Count);
    }

    [Fact]
    public void ParseRankingPlayers_ThrowsWhenRankingTableIsMissing()
    {
        var parser = new CLTTLStrategy2026Parser();

        Assert.Throws<InvalidOperationException>(() => parser.ParseRankingPlayers(["<html><body>no ranking table</body></html>"]));
    }

    private static string ReadFixture(string fixtureName) =>
        File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "Ranking", fixtureName));

    private static string Row(string name, object? id, object current)
    {
        var memberLink = id is null
            ? name
            : $"<a href=\"/CentralLondon/Ranking/Member?id={id}\">{name}</a>";
        return $"<tr><td class=\"tt-ranking-col-name\">{memberLink}</td><td class=\"tt-ranking-col-current\">{current}</td></tr>";
    }

    private static string RankingPage(string rows) => $"""
        <!doctype html><html><body>
        <table class="tt-ranking-table"><tbody>{rows}</tbody></table>
        </body></html>
        """;
}

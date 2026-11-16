using System.Globalization;
using System.Text.Json;
using TTLeaguePlayersApp.BackEnd.Strategy.TT365;
using TTLeaguePlayersApp.BackEnd.TTLeaguePlayersApp.BackEnd.Strategy.Lambdas;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.Tests.Strategy.TT365;

public sealed class FixturesProcessorTests
{
    [Fact]
    public async Task GetAllDivisionFixtures_FetchesAndParsesTheCapturedPage()
    {
        var sources = Clttl2026TestConfig.Load().StrategySources;
        var source = sources["Fixtures"];
        var directory = Path.Combine(AppContext.BaseDirectory, "Fixtures", "Fixtures");
        var html = File.ReadAllText(Path.Combine(directory, "CLTTL-2026-fixtures.html"));
        var proxy = new ScraperProxyImpersonator(new Dictionary<Uri, IReadOnlyList<ScraperProxyImpersonatorResponse>>
        {
            [source] = [ScraperProxyImpersonatorResponse.FromContent(html)]
        });

        var divisions = await new CLTTLStrategy2026Processor(proxy, sources).GetAllFixtures();

        using var expected = JsonDocument.Parse(File.ReadAllText(Path.Combine(directory, "CLTTL-2026-fixtures.expected.json")));
        var expectedDivisions = expected.RootElement.EnumerateObject().ToArray();
        Assert.Equal(expectedDivisions.Select(division => division.Name), divisions.Keys);
        foreach (var expectedDivision in expectedDivisions)
        {
            var fixtures = divisions[expectedDivision.Name];
            var expectedFixtures = expectedDivision.Value.EnumerateArray().ToArray();
            Assert.Equal(expectedFixtures.Length, fixtures.Count);
            for (var i = 0; i < fixtures.Count; i++)
            {
                var fixture = fixtures[i];
                var item = expectedFixtures[i];
                Assert.Equal(DateOnly.ParseExact(item.GetProperty("date").GetString()!, "yyyy-MM-dd", CultureInfo.InvariantCulture), fixture.Date);
                Assert.Equal(item.GetProperty("played").GetBoolean(), fixture.Played);
                Assert.Equal(item.GetProperty("homeTeamName").GetString(), fixture.HomeTeamName);
                Assert.Equal(item.GetProperty("awayTeamName").GetString(), fixture.AwayTeamName);
                Assert.Equal(Score(item, "homeTeamScore"), fixture.HomeTeamScore);
                Assert.Equal(Score(item, "awayTeamScore"), fixture.AwayTeamScore);
                AssertPlayers(item.GetProperty("homeTeamPlayersScore"), fixture.HomeTeamPlayersScore);
                AssertPlayers(item.GetProperty("awayTeamPlayersScore"), fixture.AwayTeamPlayersScore);
            }
        }
        Assert.Equal([source], proxy.RequestedUrls);
    }

    private static int? Score(JsonElement fixture, string name) =>
        fixture.GetProperty(name).ValueKind == JsonValueKind.Null ? null : fixture.GetProperty(name).GetInt32();

    private static void AssertPlayers(JsonElement expected, IReadOnlyList<PlayerScore> players) =>
        Assert.Equal(expected.EnumerateArray().Select(player => (player.GetProperty("name").GetString()!, player.GetProperty("won").GetInt32(), player.GetProperty("played").GetInt32())),
            players.Select(player => (player.Name, player.Won, player.Played)));
}

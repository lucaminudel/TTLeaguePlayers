using System.Net;
using System.Text;
using Amazon.Lambda.TestUtilities;
using FluentAssertions;
using TTLeaguePlayersApp.BackEnd.Configuration.DataStore;
using TTLeaguePlayersApp.BackEnd.Strategy.Lambdas;
using TTLeaguePlayersApp.BackEnd.Tests.Strategy.TT365;
using TTLeaguePlayersApp.BackEnd.TTLeaguePlayersApp.BackEnd.Strategy.Lambdas;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.Tests.Strategy.Lambdas;

public sealed class StrategyLambdasTests
{
    private static Dictionary<string, string> Claims() => new() { ["sub"] = "test-user" };

    private static ActiveSeasonStrategyConfig Config() => Clttl2026TestConfig.Load();

    private static bool IsPlayersUri(Uri uri) =>
        uri.OriginalString.StartsWith(Config().StrategySources["Divisions Teams Players List"].OriginalString, StringComparison.Ordinal);

    private static string ValidHtml(string? title = "League")
        => $"<html><head><title>{title}</title></head><body>{new string('x', 10_001)}</body></html>";

    private static string HtmlOfByteCount(int byteCount, bool includeTitle = true, bool includeBody = true)
    {
        var prefix = $"<html><head>{(includeTitle ? "<title>League</title>" : string.Empty)}</head>{(includeBody ? "<body>" : string.Empty)}";
        var suffix = includeBody ? "</body></html>" : "</html>";
        return prefix + new string('x', byteCount - Encoding.UTF8.GetByteCount(prefix) - Encoding.UTF8.GetByteCount(suffix)) + suffix;
    }

    private static TableProjectionsLambda Projection(
        Func<Uri, Task<string>> fetch,
        SpyLoggerObserver? observer = null)
        => new(observer ?? new SpyLoggerObserver(), [Config()], fetch);

    [Fact]
    public async Task TeamComparisons_ValidatesInputsAndLogsPendingCompletion()
    {
        var observer = new SpyLoggerObserver();
        var processor = new StrategyProcessorFake();
        var division = new Division("Division 4");
        var team = new Team("Home");
        team.Players.Add("One", new Player("One", null));
        team.Players.Add("Two", new Player("Two", null));
        division.Teams.Add(team.Name, team);
        processor.Divisions.Add(division.Name, division);
        var table = new DivisionTable(division.Name);
        table.TeamsStanding.Add("Home", new TeamStanding(4, 6, 2, 10));
        processor.Tables.Add(division.Name, table);
        processor.Rankings = new Dictionary<string, Player> { ["One"] = new("One", 100), ["Two"] = new("Two", 200) };
        var lambda = new TeamComparisonsLambda(observer, [Config()], _ => processor);
        var context = new TestLambdaContext();

        await lambda.HandleAsync(new("CLTTL", "2026-2027", "Division 4", "Home", "Away"), Claims(), context);
        processor.Calls.Should().Equal("divisions", "rankings", "tables", "fixtures");
        team.Players["One"].NormalisedRanking.Should().Be(0m);
        team.Players["Two"].NormalisedRanking.Should().Be(100m);
        team.Played.Should().Be(4);
        team.TotalPoints.Should().Be(10);
        team.WinPercentage.Should().Be(75m);
        division.TeamsLookbackPeriod.Should().Be(0);
        division.PlayersLookbackPeriod.Should().Be(0);

        observer.RuntimeRegularEvents.Should().ContainSingle()
            .Which.EventName.Should().Be("GET TEAM COMPARISONS COMPLETED");
        observer.RuntimeRegularClaims.Should().ContainSingle().Which.Should().BeEquivalentTo(Claims());
        var unknown = () => lambda.HandleAsync(new("CLTTL", "1900-1901", "Division 4", "Home", "Away"), Claims(), context);
        await unknown.Should().ThrowAsync<KeyNotFoundException>();
    }

    [Fact]
    public async Task TeamComparisons_LogsSourceAnomaliesWithTheOperationEventName()
    {
        var observer = new SpyLoggerObserver();
        var processor = new StrategyProcessorFake { RosterAnomalies = ["incomplete roster", "duplicate player"], RankingAnomalies = ["missing ranking"] };
        var lambda = new TeamComparisonsLambda(observer, [Config()], _ => processor);

        await lambda.HandleAsync(new("CLTTL", "2026-2027", "Division 4", "Home", "Away"), Claims(), new TestLambdaContext());

        var anomaly = observer.RuntimeIrregularEvents.Should().ContainSingle().Subject;
        anomaly.EventName.Should().Be("GET TEAM COMPARISONS COMPLETED WITH ANOMALIES");
        anomaly.Parameters.Should().Contain("Detail", "incomplete roster\nduplicate player\nmissing ranking");
        anomaly.Parameters.Should().Contain("League", "CLTTL").And.Contain("Season", "2026-2027").And.Contain("Division", "Division 4");
        observer.RuntimeIrregularClaims.Should().ContainSingle().Which.Should().BeEquivalentTo(Claims());
        observer.RuntimeRegularEvents.Should().BeEmpty();
    }

    [Fact]
    public async Task TeamComparisons_PropagatesSourceFailureWithoutLoggingCompletion()
    {
        var observer = new SpyLoggerObserver();
        var processor = new StrategyProcessorFake { FixtureFailure = new InvalidOperationException("fixture failure") };
        var lambda = new TeamComparisonsLambda(observer, [Config()], _ => processor);

        var act = () => lambda.HandleAsync(new("CLTTL", "2026-2027", "Division 4", "Home", "Away"), Claims(), new TestLambdaContext());

        await act.Should().ThrowAsync<InvalidOperationException>().WithMessage("fixture failure");
        observer.RuntimeRegularEvents.Should().BeEmpty();
    }

    [Fact]
    public async Task TableProjections_ValidatesFiveSourcesAndAppendsConfiguredTeamId()
    {
        var requested = new List<Uri>();
        var observer = new SpyLoggerObserver();
        var lambda = Projection(uri =>
        {
            requested.Add(uri);
            return Task.FromResult(uri.ToString().Contains("teamId=", StringComparison.Ordinal)
                ? "{\"teamPlayers\":[] }"
                : ValidHtml());
        }, observer);

        await lambda.HandleAsync(new("CLTTL", "2026-2027", "Division 4"), Claims(), new TestLambdaContext());

        requested.Should().HaveCount(5);
        requested[1].OriginalString.Should().Be(Config().StrategySources["Divisions Teams Players List"].OriginalString + "75774");
        observer.RuntimeRegularEvents.Should().ContainSingle()
            .Which.EventName.Should().Be("TABLE PROJECTIONS SOURCES VALIDATED");
        observer.RuntimeRegularClaims.Should().ContainSingle().Which.Should().BeEquivalentTo(Claims());
    }

    [Theory]
    [InlineData(9_999, true, true)]
    [InlineData(10_000, true, true)]
    [InlineData(10_001, false, true)]
    [InlineData(10_001, true, false)]
    public async Task TableProjections_RejectsHtmlThatMissesRequiredBoundary(int byteCount, bool includeTitle, bool includeBody)
    {
        var invalidHtml = HtmlOfByteCount(byteCount, includeTitle, includeBody);
        Encoding.UTF8.GetByteCount(invalidHtml).Should().Be(byteCount);
        var requestIndex = 0;
        var lambda = Projection(_ => Task.FromResult(requestIndex++ switch
        {
            0 => invalidHtml,
            1 => "{\"teamPlayers\":[]}",
            _ => ValidHtml()
        }));

        var act = () => lambda.HandleAsync(new("CLTTL", "2026-2027", "Division 4"), Claims(), new TestLambdaContext());

        var failure = await act.Should().ThrowAsync<StrategySourceCheckException>();
        failure.Which.SourceName.Should().Be("Divisions Teams List");
    }

    [Theory]
    [InlineData("{\"teamPlayers\":[]}")]
    [InlineData("[1]")]
    [InlineData("{}")]
    [InlineData("[]")]
    [InlineData("42")]
    [InlineData("null")]
    [InlineData("not json")]
    public async Task TableProjections_RequiresNonEmptyObjectOrArrayForPlayersJson(string playerJson)
    {
        var lambda = Projection(uri => Task.FromResult(IsPlayersUri(uri) ? playerJson : ValidHtml()));

        var act = () => lambda.HandleAsync(new("CLTTL", "2026-2027", "Division 4"), Claims(), new TestLambdaContext());

        if (playerJson is "{\"teamPlayers\":[]}" or "[1]")
            await act();
        else
            (await act.Should().ThrowAsync<StrategySourceCheckException>()).Which.SourceName.Should().Be("Divisions Teams Players List");
    }

    [Fact]
    public async Task TableProjections_FailureLogsSourceAndDoesNotLogSuccessfulCompletion()
    {
        var observer = new SpyLoggerObserver();
        var lambda = Projection(_ => Task.FromResult("<html><body>short</body></html>"), observer);

        var act = () => lambda.HandleAsync(new("CLTTL", "2026-2027", "Division 4"), Claims(), new TestLambdaContext());

        var failure = await act.Should().ThrowAsync<StrategySourceCheckException>();
        failure.Which.SourceName.Should().Be("Divisions Teams List");
        observer.RuntimeErrors.Should().ContainSingle();
        observer.RuntimeErrorClaims.Should().ContainSingle().Which.Should().BeEquivalentTo(Claims());
        observer.RuntimeErrors[0].Message.Should().Contain("Divisions Teams List");
        observer.RuntimeRegularEvents.Should().BeEmpty();
    }

    [Fact]
    public async Task TableProjections_ReportsTheConfiguredSourceWhenFetchThrows()
    {
        var observer = new SpyLoggerObserver();
        var lambda = Projection(_ => throw new HttpRequestException("upstream unavailable", null, HttpStatusCode.Forbidden), observer);

        var act = () => lambda.HandleAsync(new("CLTTL", "2026-2027", "Division 4"), Claims(), new TestLambdaContext());

        var failure = await act.Should().ThrowAsync<StrategySourceCheckException>();
        failure.Which.SourceName.Should().Be("Divisions Teams List");
        observer.RuntimeErrors.Should().ContainSingle();
        observer.RuntimeRegularEvents.Should().BeEmpty();
    }
}

using System.Net;
using System.Text;
using Amazon.Lambda.TestUtilities;
using FluentAssertions;
using TTLeaguePlayersApp.BackEnd.Configuration.DataStore;
using TTLeaguePlayersApp.BackEnd.Strategy.Lambdas;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.Tests.Strategy.Lambdas;

public sealed class StrategyLambdasTests
{
    private static readonly string[] SourceNames =
    [
        "Divisions Teams List",
        "Divisions Teams Players List",
        "League Tables",
        "Ranking",
        "Fixtures"
    ];

    private static ActiveSeasonStrategyConfig Config()
    {
        var sources = SourceNames.ToDictionary(
            name => name,
            name => new Uri(name == "Divisions Teams Players List"
                ? "https://example.test/players?teamId="
                : $"https://example.test/{Uri.EscapeDataString(name)}"),
            StringComparer.Ordinal);
        return new("CLTTL", "2026-2027", "TT365.CLTTLStrategy2026Processor", sources);
    }

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
        var lambda = new TeamComparisonsLambda(observer, [Config()]);
        var context = new TestLambdaContext();

        await lambda.HandleAsync(new("CLTTL", "2026-2027", "Division 4", "Home", "Away"), context);

        observer.RuntimeRegularEvents.Should().ContainSingle()
            .Which.EventName.Should().Be("TEAM COMPARISONS PENDING");
        var unknown = () => lambda.HandleAsync(new("CLTTL", "1900-1901", "Division 4", "Home", "Away"), context);
        await unknown.Should().ThrowAsync<KeyNotFoundException>();
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

        await lambda.HandleAsync(new("CLTTL", "2026-2027", "Division 4"), new TestLambdaContext());

        requested.Should().HaveCount(5);
        requested[1].Query.Should().Be("?teamId=75774");
        observer.RuntimeRegularEvents.Should().ContainSingle()
            .Which.EventName.Should().Be("TABLE PROJECTIONS SOURCES VALIDATED");
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

        var act = () => lambda.HandleAsync(new("CLTTL", "2026-2027", "Division 4"), new TestLambdaContext());

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
        var lambda = Projection(uri => Task.FromResult(uri.Query.Length > 0 ? playerJson : ValidHtml()));

        var act = () => lambda.HandleAsync(new("CLTTL", "2026-2027", "Division 4"), new TestLambdaContext());

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

        var act = () => lambda.HandleAsync(new("CLTTL", "2026-2027", "Division 4"), new TestLambdaContext());

        var failure = await act.Should().ThrowAsync<StrategySourceCheckException>();
        failure.Which.SourceName.Should().Be("Divisions Teams List");
        observer.RuntimeErrors.Should().ContainSingle();
        observer.RuntimeErrors[0].Message.Should().Contain("Divisions Teams List");
        observer.RuntimeRegularEvents.Should().BeEmpty();
    }

    [Fact]
    public async Task TableProjections_ReportsTheConfiguredSourceWhenFetchThrows()
    {
        var observer = new SpyLoggerObserver();
        var lambda = Projection(_ => throw new HttpRequestException("upstream unavailable", null, HttpStatusCode.Forbidden), observer);

        var act = () => lambda.HandleAsync(new("CLTTL", "2026-2027", "Division 4"), new TestLambdaContext());

        var failure = await act.Should().ThrowAsync<StrategySourceCheckException>();
        failure.Which.SourceName.Should().Be("Divisions Teams List");
        observer.RuntimeErrors.Should().ContainSingle();
        observer.RuntimeRegularEvents.Should().BeEmpty();
    }
}

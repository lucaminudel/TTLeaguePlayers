using System.Net;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.TestUtilities;
using FluentAssertions;
using TTLeaguePlayersApp.BackEnd.APIGateway;
using TTLeaguePlayersApp.BackEnd.Configuration.DataStore;
using TTLeaguePlayersApp.BackEnd.Strategy.Lambdas;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.Tests.APIGateway;

public sealed class StrategyGatewayTests
{
    private static readonly string[] SourceNames =
    [
        "Divisions Teams List",
        "Divisions Teams Players List",
        "League Tables",
        "Ranking",
        "Fixtures"
    ];

    private static ActiveSeasonStrategyConfig SeasonConfig()
        => new(
            "CLTTL",
            "2026-2027",
            "TT365.CLTTLStrategy2026Processor",
            SourceNames.ToDictionary(
                name => name,
                name => new Uri(name == "Divisions Teams Players List"
                    ? "https://example.test/players?teamId="
                    : $"https://example.test/{Uri.EscapeDataString(name)}"),
                StringComparer.Ordinal));

    private static ApiGatewayProxyHandler Handler(
        SpyLoggerObserver observer,
        Func<Uri, Task<string>>? fetch = null)
    {
        var season = SeasonConfig();
        var teams = new TeamComparisonsLambda(observer, [season]);
        var projections = new TableProjectionsLambda(
            observer,
            [season],
            fetch ?? (_ => Task.FromResult($"<html><head><title>League</title></head><body>{new string('x', 10_001)}</body></html>")));

        return new ApiGatewayProxyHandler(
            null!, null!, null!, null!, null!, null!, null!, null!, null!, null!, null!, "*",
            teamComparisonsLambda: teams,
            tableProjectionsLambda: projections,
            observer: observer);
    }

    private static APIGatewayProxyRequest Request(string method, string path, Dictionary<string, string>? query = null)
        => new() { HttpMethod = method, Path = path, QueryStringParameters = query };

    private static Dictionary<string, string> ComparisonQuery()
        => new()
        {
            ["league"] = "CLTTL",
            ["season"] = "2026-2027",
            ["team_division"] = "Division 4",
            ["team_name"] = "Home",
            ["opponent_team_name"] = "Away"
        };

    private static Dictionary<string, string> ProjectionQuery()
        => new()
        {
            ["league"] = "CLTTL",
            ["season"] = "2026-2027",
            ["team_division"] = "Division 4"
        };

    [Fact]
    public async Task TeamComparisons_ReturnsPendingWithRetryAfterAndExposedCorsHeader()
    {
        var observer = new SpyLoggerObserver();
        var handler = Handler(observer);

        var response = await handler.Dispatch(Request("GET", "/strategy/team-comparisons", ComparisonQuery()), new TestLambdaContext());

        response.StatusCode.Should().Be((int)HttpStatusCode.Accepted);
        response.Headers.Should().ContainKey("Retry-After").WhoseValue.Should().Be("16");
        response.Headers.Should().ContainKey("Access-Control-Expose-Headers").WhoseValue.Should().Contain("Retry-After");
        observer.RuntimeRegularEvents.Should().Contain(e => e.EventName == "GET TEAM COMPARISONS COMPLETED");
    }

    [Fact]
    public async Task TeamComparisons_RejectsUnknownSeason()
    {
        var observer = new SpyLoggerObserver();
        var handler = Handler(observer);
        var unknown = ComparisonQuery();
        unknown["season"] = "1900-1901";
        var notFound = await handler.Dispatch(Request("GET", "/strategy/team-comparisons", unknown), new TestLambdaContext());

        notFound.StatusCode.Should().Be((int)HttpStatusCode.NotFound);
        observer.RuntimeRegularEvents.Count(e => e.EventName == "GET TEAM COMPARISONS COMPLETED").Should().Be(1);
    }

    [Theory]
    [InlineData("/strategy/team-comparisons", "league")]
    [InlineData("/strategy/team-comparisons", "season")]
    [InlineData("/strategy/team-comparisons", "team_division")]
    [InlineData("/strategy/team-comparisons", "team_name")]
    [InlineData("/strategy/team-comparisons", "opponent_team_name")]
    [InlineData("/strategy/table-projections", "league")]
    [InlineData("/strategy/table-projections", "season")]
    [InlineData("/strategy/table-projections", "team_division")]
    public async Task StrategyRoutes_RejectEachMissingRequiredInput(string path, string missingParameter)
    {
        var query = path == "/strategy/team-comparisons" ? ComparisonQuery() : ProjectionQuery();
        query.Remove(missingParameter);

        var response = await Handler(new SpyLoggerObserver()).Dispatch(
            Request("GET", path, query),
            new TestLambdaContext());

        response.StatusCode.Should().Be((int)HttpStatusCode.BadRequest);
        response.Body.Should().Contain(missingParameter);
    }

    [Theory]
    [InlineData("/strategy/team-comparisons")]
    [InlineData("/strategy/table-projections")]
    public async Task StrategyOptions_IsUnauthenticatedPreflightWithGetAllowed(string path)
    {
        var response = await Handler(new SpyLoggerObserver()).Dispatch(Request("OPTIONS", path), new TestLambdaContext());

        response.StatusCode.Should().Be((int)HttpStatusCode.OK);
        response.Headers["Access-Control-Allow-Methods"].Should().Contain("GET");
        response.Headers["Access-Control-Expose-Headers"].Should().Contain("Retry-After");
    }

    [Theory]
    [InlineData("POST", "/strategy/team-comparisons")]
    [InlineData("POST", "/strategy/table-projections")]
    public async Task StrategyRoutes_RejectUnsupportedMethods(string method, string path)
    {
        var response = await Handler(new SpyLoggerObserver()).Dispatch(Request(method, path), new TestLambdaContext());

        response.StatusCode.Should().Be((int)HttpStatusCode.MethodNotAllowed);
    }

    [Fact]
    public async Task TableProjections_ReturnsEmptyObjectOnlyAfterAllSourcesPass()
    {
        var requested = new List<Uri>();
        var observer = new SpyLoggerObserver();
        var fetch = (Uri uri) =>
        {
            requested.Add(uri);
            return Task.FromResult(uri.Query.Length > 0 ? "{\"players\":[1]}" : $"<html><head><title>League</title></head><body>{new string('x', 10_001)}</body></html>");
        };

        var response = await Handler(observer, fetch).Dispatch(Request("GET", "/strategy/table-projections", ProjectionQuery()), new TestLambdaContext());

        response.StatusCode.Should().Be((int)HttpStatusCode.OK);
        response.Body.Should().Be("{}");
        requested.Should().HaveCount(5);
        observer.RuntimeRegularEvents.Should().Contain(e => e.EventName == "GET TABLE PROJECTIONS COMPLETED");
    }

    [Fact]
    public async Task TableProjections_Returns503WithSourceOnFailure()
    {
        var failingObserver = new SpyLoggerObserver();
        var failing = await Handler(failingObserver, _ => Task.FromResult("<html><body>challenge</body></html>"))
            .Dispatch(Request("GET", "/strategy/table-projections", ProjectionQuery()), new TestLambdaContext());

        failing.StatusCode.Should().Be((int)HttpStatusCode.ServiceUnavailable);
        failing.Body.Should().Contain("Divisions Teams List");
        failing.Body.Should().NotContain("challenge");
        failingObserver.RuntimeRegularEvents.Should().Contain(e => e.EventName == "GET TABLE PROJECTIONS COMPLETED");
    }
}

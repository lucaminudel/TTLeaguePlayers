using System.Net;
using System.Text.Json;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.TestUtilities;
using FluentAssertions;
using TTLeaguePlayersApp.BackEnd.APIGateway;
using TTLeaguePlayersApp.BackEnd.Configuration.DataStore;
using TTLeaguePlayersApp.BackEnd.Strategy.Lambdas;
using TTLeaguePlayersApp.BackEnd.Tests.Strategy.TT365;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.Tests.APIGateway;

public sealed class StrategyGatewayTests
{
    private static ActiveSeasonStrategyConfig SeasonConfig() => Clttl2026TestConfig.Load();

    private static ApiGatewayProxyHandler Handler(
        SpyLoggerObserver observer,
        Func<Uri, Task<string>>? fetch = null)
    {
        var season = SeasonConfig();
        var teams = new TeamComparisonsLambda(observer, [season], _ => new StrategyProcessorFake());
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
    public async Task StrategyRoutes_PassAuthorizerClaimsToLambdaLogs()
    {
        foreach (var (path, query, eventName) in new[]
        {
            ("/strategy/team-comparisons", ComparisonQuery(), "GET TEAM COMPARISONS COMPLETED"),
            ("/strategy/table-projections", ProjectionQuery(), "TABLE PROJECTIONS SOURCES VALIDATED")
        })
        {
            var observer = new SpyLoggerObserver();
            var request = JsonSerializer.Deserialize<APIGatewayProxyRequest>("""{"requestContext":{"authorizer":{"claims":{"sub":"claim-user"}}}}""", new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;
            request.HttpMethod = "GET";
            request.Path = path;
            request.QueryStringParameters = query;
            await Handler(observer, uri => Task.FromResult(uri.OriginalString.Contains("teamId=") ? "{\"players\":[1]}" : $"<html><head><title>League</title></head><body>{new string('x', 10_001)}</body></html>"))
                .Dispatch(request, new TestLambdaContext());

            var lambdaClaims = observer.RuntimeRegularEvents.Zip(observer.RuntimeRegularClaims)
                .Where(entry => entry.First.EventName == eventName)
                .Select(entry => entry.Second)
                .OfType<Dictionary<string, string>>();
            lambdaClaims.Should().ContainSingle().Which.Should().Contain("sub", "claim-user");
        }
    }

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
            return Task.FromResult(uri.OriginalString.StartsWith(SeasonConfig().StrategySources["Divisions Teams Players List"].OriginalString, StringComparison.Ordinal) ? "{\"players\":[1]}" : $"<html><head><title>League</title></head><body>{new string('x', 10_001)}</body></html>");
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

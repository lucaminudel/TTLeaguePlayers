using System.Net;
using System.Text.Json;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.TestUtilities;
using CurlImpersonate.Enums;
using CurlImpersonate.Http;
using FluentAssertions;
using TTLeaguePlayersApp.BackEnd.APIGateway;
using TTLeaguePlayersApp.BackEnd.Configuration.DataStore;
using TTLeaguePlayersApp.BackEnd.Strategy.Lambdas;
using TTLeaguePlayersApp.BackEnd.Strategy.TT365;
using TTLeaguePlayersApp.BackEnd.Tests.Strategy.TT365;
using TTLeaguePlayersApp.BackEnd.Strategy.Lambdas;
using ScraperProxyClient = TTLeaguePlayersApp.BackEnd.Strategy.ScraperProxy.ScraperProxy;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.Tests.APIGateway;

public sealed class StrategyGatewayTests
{
    private static ActiveSeasonStrategyConfig SeasonConfig() => Clttl2026TestConfig.Load();

    private static ApiGatewayProxyHandler Handler(
        ILoggerObserver observer,
        Func<Uri, Task<string>>? fetch = null,
        Func<ActiveSeasonStrategyConfig, IStrategyProcessor>? processorFactory = null,
        ActiveSeasonStrategyConfig? configuration = null)
    {
        var season = configuration ?? SeasonConfig();
        var teams = new TeamComparisonsLambda(observer, [season], processorFactory ?? (_ => new StrategyProcessorFake()));
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
    public async Task TeamComparisons_ReturnsFullSeasonTreeWithCalculatedStats()
    {
        var observer = new SpyLoggerObserver();
        var processor = new StrategyProcessorFake
        {
            Rankings = new Dictionary<string, Player> { ["One"] = new("One", 100), ["Two"] = new("Two", 200) }
        };
        var comparisonDivision = new Division("Division 4");
        var comparisonTable = new DivisionTable(comparisonDivision.Name);
        foreach (var teamName in new[] { "Home", "Away", "Other" })
        {
            comparisonDivision.Teams.Add(teamName, new Team(teamName));
            comparisonTable.TeamsStanding.Add(teamName, new TeamStanding(0, 0, 0, 0));
        }
        var home = comparisonDivision.Teams["Home"];
        home.Players.Add("One", new Player("One", null));
        home.Players.Add("Two", new Player("Two", null));
        comparisonTable.TeamsStanding["Home"] = new TeamStanding(4, 6, 2, 10);
        processor.Divisions.Add(comparisonDivision.Name, comparisonDivision);
        processor.Tables.Add(comparisonTable.Name, comparisonTable);

        var otherDivision = new Division("Division 5");
        var otherTeam = new Team("Unrelated");
        otherTeam.Players.Add("Three", new Player("Three", null));
        otherDivision.Teams.Add(otherTeam.Name, otherTeam);
        var otherTable = new DivisionTable(otherDivision.Name);
        otherTable.TeamsStanding.Add(otherTeam.Name, new TeamStanding(0, 0, 0, 0));
        processor.Divisions.Add(otherDivision.Name, otherDivision);
        processor.Tables.Add(otherTable.Name, otherTable);

        var handler = Handler(observer, processorFactory: _ => processor);

        var response = await handler.Dispatch(Request("GET", "/strategy/team-comparisons", ComparisonQuery()), new TestLambdaContext());

        response.StatusCode.Should().Be((int)HttpStatusCode.OK);
        response.Headers["Content-Type"].Should().Be("application/json; charset=utf-8");
        response.Headers.Should().NotContainKey("Retry-After");
        observer.RuntimeRegularEvents.Should().Contain(e => e.EventName == "GET TEAM COMPARISONS COMPLETED");

        using var body = JsonDocument.Parse(response.Body);
        var divisions = body.RootElement.GetProperty("divisions");
        var teams = divisions.GetProperty("Division 4").GetProperty("teams");
        teams.TryGetProperty("Away", out _).Should().BeTrue();
        teams.TryGetProperty("Other", out _).Should().BeTrue();
        var homeTeam = teams.GetProperty("Home");
        homeTeam.GetProperty("points").GetInt32().Should().Be(10);
        var players = homeTeam.GetProperty("players");
        players.GetProperty("One").GetProperty("currentRanking").GetInt32().Should().Be(100);
        players.GetProperty("One").GetProperty("normalisedRanking").GetDecimal().Should().Be(0m);
        players.GetProperty("Two").GetProperty("currentRanking").GetInt32().Should().Be(200);
        var unrelatedPlayers = divisions.GetProperty("Division 5").GetProperty("teams").GetProperty("Unrelated").GetProperty("players");
        unrelatedPlayers.GetProperty("Three").GetProperty("currentRanking").ValueKind.Should().Be(JsonValueKind.Null);
    }

    [Theory]
    [InlineData("/strategy/team-comparisons", "GET TEAM COMPARISONS COMPLETED")]
    [InlineData("/strategy/table-projections", "GET TABLE PROJECTIONS COMPLETED")]
    public async Task StrategyRoutes_RejectUnknownSeason(string path, string completionEvent)
    {
        var observer = new SpyLoggerObserver();
        var handler = Handler(observer);
        var unknown = StrategyQuery(path);
        unknown["season"] = "1900-1901";
        var notFound = await handler.Dispatch(Request("GET", path, unknown), new TestLambdaContext());

        notFound.StatusCode.Should().Be((int)HttpStatusCode.NotFound);
        observer.RuntimeRegularEvents.Count(e => e.EventName == completionEvent).Should().Be(1);
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
        var query = StrategyQuery(path);
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

    [Theory]
    [InlineData("/strategy/team-comparisons", "GET TEAM COMPARISONS", "The divisions and teams page has no team selector.")]
    [InlineData("/strategy/table-projections", "GET TABLE PROJECTIONS", "The HTML response did not contain the required page markers and size.")]
    public async Task StrategyRoutes_Return502ForMalformedSourceAndLogItsCause(string path, string operation, string causeMessage)
    {
        var (response, context) = await DispatchWithFirstSource(
            path, ScraperProxyImpersonatorResponse.FromContent("<html><body>challenge</body></html>"));

        AssertStrategyError(response, context, HttpStatusCode.BadGateway, "strategy_source_error", "League data could not be loaded.");
        var diagnostic = FailureLog(context, "ERROR", nameof(StrategySourceCheckException), causeMessage, expectedSubject: "claim-user");
        diagnostic.GetProperty("Operation").GetString().Should().Be(operation);
        diagnostic.GetProperty("League").GetString().Should().Be("CLTTL");
        diagnostic.GetProperty("Season").GetString().Should().Be("2026-2027");
        diagnostic.GetProperty("Division").GetString().Should().Be("Division 4");
        diagnostic.GetProperty("Source").GetString().Should().Be("Divisions Teams List");
        diagnostic.GetProperty("Stage").GetString().Should().Be("parse");
    }

    [Theory]
    [InlineData("/strategy/team-comparisons")]
    [InlineData("/strategy/table-projections")]
    public async Task StrategyRoutes_Return502AndLogTheOriginalInvalidCharsetException(string path)
    {
        using var proxy = new ScraperProxyClient(
            new InvalidCharsetHandler(), disposeHandler: true, _ => Task.CompletedTask, () => DateTimeOffset.UtcNow);
        var handler = Handler(new LoggerObserver(), proxy.FetchAsync, config => StrategyProcessorFactory.Create(config, proxy));
        var context = new TestLambdaContext { AwsRequestId = "strategy-invalid-charset-request" };

        var response = await handler.Dispatch(Request("GET", path, StrategyQuery(path)), context);

        AssertStrategyError(response, context, HttpStatusCode.BadGateway, "strategy_source_error", "League data could not be loaded.");
        var diagnostic = FailureLog(context, "ERROR", nameof(InvalidOperationException),
            "The character set provided in ContentType is invalid.", exactMessage: false);
        diagnostic.GetProperty("Source").GetString().Should().Be("Divisions Teams List");
        diagnostic.GetProperty("Stage").GetString().Should().Be("fetch");
    }

    [Theory]
    [InlineData("/strategy/team-comparisons", HttpStatusCode.Forbidden)]
    [InlineData("/strategy/team-comparisons", HttpStatusCode.GatewayTimeout)]
    [InlineData("/strategy/table-projections", HttpStatusCode.Forbidden)]
    [InlineData("/strategy/table-projections", HttpStatusCode.GatewayTimeout)]
    public async Task StrategyRoutes_Return502ForAnUpstreamHttpErrorResponse(string path, HttpStatusCode upstreamStatus)
    {
        const string causeMessage = "Upstream response failure with diagnostic detail";
        var cause = new HttpRequestException(causeMessage, null, upstreamStatus);
        var (response, context) = await DispatchWithFirstSource(path, ScraperProxyImpersonatorResponse.FromException(cause));

        AssertStrategyError(response, context, HttpStatusCode.BadGateway, "strategy_source_error", "League data could not be loaded.");
        var diagnostic = FailureLog(context, "ERROR", nameof(HttpRequestException), causeMessage);
        diagnostic.GetProperty("Source").GetString().Should().Be("Divisions Teams List");
        diagnostic.GetProperty("Stage").GetString().Should().Be("fetch");
        diagnostic.GetProperty("UpstreamStatus").GetString().Should().Be(((int)upstreamStatus).ToString());
    }

    [Theory]
    [InlineData("/strategy/team-comparisons")]
    [InlineData("/strategy/table-projections")]
    public async Task StrategyRoutes_Return504ForAConfirmedFetchTimeout(string path)
    {
        const string causeMessage = "Curl request did not complete";
        var cause = new HttpRequestException(causeMessage, new CurlException(CurlCode.OperationTimedOut));
        var (response, context) = await DispatchWithFirstSource(path, ScraperProxyImpersonatorResponse.FromException(cause));

        AssertStrategyError(response, context, HttpStatusCode.GatewayTimeout, "strategy_source_timeout", "League data did not arrive in time.");
        var diagnostic = FailureLog(context, "ERROR", nameof(HttpRequestException), causeMessage);
        diagnostic.GetProperty("Source").GetString().Should().Be("Divisions Teams List");
        diagnostic.GetProperty("CurlCode").GetString().Should().Be(nameof(CurlCode.OperationTimedOut));
    }

    [Theory]
    [InlineData("/strategy/team-comparisons", nameof(InvalidOperationException))]
    [InlineData("/strategy/team-comparisons", nameof(TaskCanceledException))]
    [InlineData("/strategy/team-comparisons", nameof(KeyNotFoundException))]
    [InlineData("/strategy/table-projections", nameof(InvalidOperationException))]
    [InlineData("/strategy/table-projections", nameof(TaskCanceledException))]
    [InlineData("/strategy/table-projections", nameof(KeyNotFoundException))]
    public async Task StrategyRoutes_ReturnSafe500ForUnexpectedExecutionFailures(string path, string exceptionType)
    {
        const string causeMessage = "Internal diagnostic detail";
        Exception cause = exceptionType switch
        {
            nameof(TaskCanceledException) => new TaskCanceledException(causeMessage),
            nameof(KeyNotFoundException) => new KeyNotFoundException(causeMessage),
            _ => new InvalidOperationException(causeMessage)
        };
        var (response, context) = await DispatchWithFirstSource(path, ScraperProxyImpersonatorResponse.FromException(cause));

        AssertStrategyError(response, context, HttpStatusCode.InternalServerError, "strategy_internal_error", "Strategy data could not be prepared.");
        FailureLog(context, "CRITICAL", exceptionType, causeMessage);
    }

    [Theory]
    [InlineData("/strategy/team-comparisons", nameof(ArgumentException), "The strategy source 'Ranking' is required.")]
    [InlineData("/strategy/table-projections", nameof(InvalidOperationException), "The configured strategy source 'Divisions Teams List' is missing.")]
    public async Task StrategyRoutes_ReturnSafe500ForMissingSourceConfiguration(string path, string exceptionType, string causeMessage)
    {
        var season = SeasonConfig() with { StrategySources = new Dictionary<string, Uri>() };
        var proxy = new ScraperProxyImpersonator(new Dictionary<Uri, IReadOnlyList<ScraperProxyImpersonatorResponse>>());
        var context = new TestLambdaContext { AwsRequestId = "strategy-missing-source-request" };
        var handler = Handler(new LoggerObserver(), proxy.FetchAsync, config => StrategyProcessorFactory.Create(config, proxy), season);

        var response = await handler.Dispatch(Request("GET", path, StrategyQuery(path)), context);

        AssertStrategyError(response, context, HttpStatusCode.InternalServerError, "strategy_internal_error", "Strategy data could not be prepared.");
        FailureLog(context, "CRITICAL", exceptionType, causeMessage, exactMessage: false);
        proxy.RequestedUrls.Should().BeEmpty();
    }

    private static Dictionary<string, string> StrategyQuery(string path) =>
        path == "/strategy/team-comparisons" ? ComparisonQuery() : ProjectionQuery();

    private static async Task<(APIGatewayProxyResponse Response, TestLambdaContext Context)> DispatchWithFirstSource(
        string path, ScraperProxyImpersonatorResponse firstSourceResponse)
    {
        var season = SeasonConfig();
        var proxy = new ScraperProxyImpersonator(new Dictionary<Uri, IReadOnlyList<ScraperProxyImpersonatorResponse>>
        {
            [season.StrategySources["Divisions Teams List"]] = [firstSourceResponse]
        });
        var handler = Handler(new LoggerObserver(), proxy.FetchAsync, config => StrategyProcessorFactory.Create(config, proxy), season);
        var context = new TestLambdaContext { AwsRequestId = "strategy-source-request" };
        var request = Request("GET", path, StrategyQuery(path));
        request.RequestContext = new APIGatewayProxyRequest.ProxyRequestContext
        {
            Authorizer = new APIGatewayCustomAuthorizerContext { Claims = new Dictionary<string, string> { ["sub"] = "claim-user" } }
        };

        return (await handler.Dispatch(request, context), context);
    }

    private static void AssertStrategyError(
        APIGatewayProxyResponse response, TestLambdaContext context, HttpStatusCode status, string code, string message)
    {
        response.StatusCode.Should().Be((int)status);
        response.Headers.Should().NotContainKey("Retry-After");
        using var body = JsonDocument.Parse(response.Body);
        body.RootElement.EnumerateObject().Select(property => property.Name)
            .Should().BeEquivalentTo(new[] { "message", "code", "request_id" });
        body.RootElement.GetProperty("message").GetString().Should().Be(message);
        body.RootElement.GetProperty("code").GetString().Should().Be(code);
        body.RootElement.GetProperty("request_id").GetString().Should().Be(context.AwsRequestId);
    }

    private static JsonElement FailureLog(
        TestLambdaContext context, string level, string exceptionType, string message, bool exactMessage = true, string? expectedSubject = null)
    {
        var lines = ((TestLambdaLogger)context.Logger).Buffer.ToString().Split('\n', StringSplitOptions.RemoveEmptyEntries);
        var diagnostic = lines.Select(line => JsonSerializer.Deserialize<JsonElement>(line))
            .Where(entry => entry.GetProperty("log_level").GetString() is "ERROR" or "CRITICAL")
            .Should().ContainSingle().Which;
        diagnostic.GetProperty("log_level").GetString().Should().Be(level);
        diagnostic.GetProperty("requestId").GetString().Should().Be(context.AwsRequestId);
        var exception = diagnostic.GetProperty("exception");
        exception.GetProperty("name").GetString().Should().Be(exceptionType);
        if (exactMessage)
            exception.GetProperty("message").GetString().Should().Be(message);
        else
            exception.GetProperty("message").GetString().Should().StartWith(message);
        if (expectedSubject is not null)
            diagnostic.GetProperty("user_claims").GetProperty("sub").GetString().Should().Be(expectedSubject);
        return diagnostic.GetProperty("parameters");
    }

    private sealed class InvalidCharsetHandler : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var content = new StringContent("<html></html>");
            content.Headers.ContentType!.CharSet = "invalid-source-charset";
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = content });
        }
    }
}

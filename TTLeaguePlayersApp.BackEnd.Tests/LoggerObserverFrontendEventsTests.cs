using System.Text;
using System.Text.Json;
using Amazon.Lambda.TestUtilities;
using TTLeaguePlayersApp.BackEnd.FrontendEvents;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.Tests;

public class LoggerObserverFrontendEventsTests
{
    [Theory]
    [InlineData(false, "ERROR", "FRONTEND_API_CALL_ERROR")]
    [InlineData(true, "WARN", "FRONTEND_API_CALL_IRREGULAR")]
    public void FrontendDiagnosticPreservesOriginalFieldsAndSeparatesIngestionContext(bool irregular, string level, string category)
    {
        var context = new TestLambdaContext { AwsRequestId = "backend-request", FunctionName = "gateway", FunctionVersion = "7" };
        var originalTime = DateTimeOffset.Parse("2026-10-01T12:34:56Z");
        var body = new string('x', 80 * 1024) + "\n<raw>\"é</raw>";
        var diagnostic = JsonSerializer.Deserialize<FrontendApiCallDiagnostic>(JsonSerializer.Serialize(new
        {
            event_id = "event-123", timestamp = originalTime,
            event_category = irregular ? "FRONTEND_API_CALL_IRREGULAR" : "FRONTEND_API_CALL_ERROR",
            client_api_type = "TT365", operation = "getTeamFixtures", event_name = "fetch failed",
            source = new { file = "fetch.ts", function = "fetchPage", line = 12, column = 3 },
            exception = new { name = "TypeError", message = "original error", stackTrace = "original JS stack" },
            request = new { method = "POST", url = "https://example.test/path", headers = new Dictionary<string, string> { ["X-Request"] = "request header" }, parameters = new { team = "one" }, body = "{\"request\":true}", body_original_length = 16, body_truncated = false, attempts = 3 },
            response = new { status = 503, status_text = "Unavailable", headers = new Dictionary<string, string> { ["X-Response"] = "response header" }, body, body_original_length = Encoding.UTF8.GetByteCount(body), body_truncated = false },
            user_claims = new { sub = "original-sub", username = "original-user", email = "original@example.test", extra = new { roles = new[] { "captain" }, active = true } },
            page = "/fixtures", app_version = "1.2"
        }))!;
        var before = DateTimeOffset.UtcNow;
        var observer = new LoggerObserver();
        if (irregular) observer.OnFrontendApiCallIrregularEvent(diagnostic, context);
        else observer.OnFrontendApiCallError(diagnostic, context);
        var after = DateTimeOffset.UtcNow;

        var output = ((TestLambdaLogger)context.Logger).Buffer.ToString();
        using var document = JsonDocument.Parse(output);
        var log = document.RootElement;
        Assert.Equal(level, log.GetProperty("log_level").GetString());
        Assert.Equal(category, log.GetProperty("event_category").GetString());
        Assert.Equal(originalTime, log.GetProperty("timestamp").GetDateTimeOffset());
        var parameters = log.GetProperty("parameters");
        Assert.InRange(parameters.GetProperty("ingestion_timestamp").GetDateTimeOffset(), before, after);
        Assert.Equal("event-123", parameters.GetProperty("event_id").GetString());
        Assert.Equal("TT365", parameters.GetProperty("client_api_type").GetString());
        Assert.Equal("getTeamFixtures", parameters.GetProperty("operation").GetString());
        Assert.Equal("fetch failed", parameters.GetProperty("event_name").GetString());
        Assert.Equal("fetch.ts", parameters.GetProperty("source").GetProperty("file").GetString());
        Assert.Equal(12, parameters.GetProperty("source").GetProperty("line").GetInt32());
        if (irregular)
        {
            Assert.Equal("fetch failed", log.GetProperty("event_name").GetString());
            Assert.Equal("fetch.ts", log.GetProperty("source").GetProperty("file").GetString());
            Assert.False(log.TryGetProperty("exception", out _));
        }
        else
        {
            Assert.Equal("TypeError", log.GetProperty("exception").GetProperty("name").GetString());
            Assert.Equal("original error", log.GetProperty("exception").GetProperty("message").GetString());
            Assert.Equal("original JS stack", log.GetProperty("exception").GetProperty("stackTrace").GetString());
        }
        var request = parameters.GetProperty("request");
        Assert.Equal("POST", request.GetProperty("method").GetString());
        Assert.Equal("https://example.test/path", request.GetProperty("url").GetString());
        Assert.Equal("request header", request.GetProperty("headers").GetProperty("X-Request").GetString());
        Assert.Equal("one", request.GetProperty("parameters").GetProperty("team").GetString());
        Assert.Equal("{\"request\":true}", request.GetProperty("body").GetString());
        Assert.Equal(3, request.GetProperty("attempts").GetInt32());
        var response = parameters.GetProperty("response");
        Assert.Equal(503, response.GetProperty("status").GetInt32());
        Assert.Equal("Unavailable", response.GetProperty("status_text").GetString());
        Assert.Equal("response header", response.GetProperty("headers").GetProperty("X-Response").GetString());
        Assert.Equal(body, response.GetProperty("body").GetString());
        Assert.Equal(Encoding.UTF8.GetByteCount(body), response.GetProperty("body_original_length").GetInt32());
        Assert.False(response.GetProperty("body_truncated").GetBoolean());
        Assert.False(parameters.TryGetProperty("user_claims", out _));
        Assert.False(log.TryGetProperty("uploader_user_claims", out _));
        var claims = log.GetProperty("user_claims");
        Assert.Equal("original-sub", claims.GetProperty("sub").GetString());
        Assert.Equal("original-user", claims.GetProperty("username").GetString());
        Assert.Equal("original@example.test", claims.GetProperty("email").GetString());
        Assert.Equal("captain", claims.GetProperty("extra").GetProperty("roles")[0].GetString());
        Assert.True(claims.GetProperty("extra").GetProperty("active").GetBoolean());
        Assert.Equal("backend-request", log.GetProperty("requestId").GetString());
        Assert.Equal("gateway", log.GetProperty("functionName").GetString());
        Assert.Equal("7", log.GetProperty("functionVersion").GetString());
        Assert.Equal("/fixtures", parameters.GetProperty("page").GetString());
        Assert.Equal("1.2", parameters.GetProperty("app_version").GetString());
    }

    [Fact]
    public void ArbitraryNestedPropertiesSurviveDeserializationValidationAndLogging()
    {
        var json = """
            {"event_id":"event-1","timestamp":"2026-10-27T12:00:00Z","event_category":"FRONTEND_API_CALL_ERROR",
             "client_api_type":"TT365","operation":"fixtures","event_name":"failure",
             "source":{"line":"unknown"},"exception":{"details":[true,42]},
             "request":{"attempts":"several","body_truncated":"unknown"},
             "response":{"status":"unavailable","extra":{"retry":false}}}
            """;
        var diagnostic = JsonSerializer.Deserialize<FrontendApiCallDiagnostic>(json)!;
        FrontendApiCallDiagnosticValidator.Validate(diagnostic);
        var context = new TestLambdaContext();
        new LoggerObserver().OnFrontendApiCallError(diagnostic, context);
        using var document = JsonDocument.Parse(((TestLambdaLogger)context.Logger).Buffer.ToString());
        var log = document.RootElement;
        var parameters = log.GetProperty("parameters");
        Assert.Equal("unknown", parameters.GetProperty("source").GetProperty("line").GetString());
        Assert.True(parameters.GetProperty("exception").GetProperty("details")[0].GetBoolean());
        Assert.Equal(42, parameters.GetProperty("exception").GetProperty("details")[1].GetInt32());
        Assert.Equal("several", parameters.GetProperty("request").GetProperty("attempts").GetString());
        Assert.Equal("unknown", parameters.GetProperty("request").GetProperty("body_truncated").GetString());
        Assert.Equal("unavailable", parameters.GetProperty("response").GetProperty("status").GetString());
        Assert.False(parameters.GetProperty("response").GetProperty("extra").GetProperty("retry").GetBoolean());
    }

    [Fact]
    public void ExistingBusinessEventKeepsItsLogShape()
    {
        var context = new TestLambdaContext { AwsRequestId = "request", FunctionName = "function", FunctionVersion = "1" };
        new LoggerObserver().OnBusinessEvent("created", context, new() { ["id"] = "42" }, new { sub = "user" });
        using var document = JsonDocument.Parse(((TestLambdaLogger)context.Logger).Buffer.ToString());
        var log = document.RootElement;
        Assert.Equal("INFO", log.GetProperty("log_level").GetString());
        Assert.Equal("BUSINESS_EVENT", log.GetProperty("event_category").GetString());
        Assert.Equal("created", log.GetProperty("event_name").GetString());
        Assert.Equal("42", log.GetProperty("parameters").GetProperty("id").GetString());
        Assert.Equal("user", log.GetProperty("user_claims").GetProperty("sub").GetString());
        Assert.Equal("request", log.GetProperty("requestId").GetString());
        Assert.Equal("function", log.GetProperty("functionName").GetString());
        Assert.Equal("1", log.GetProperty("functionVersion").GetString());
        Assert.True(log.TryGetProperty("timestamp", out _));
        Assert.False(log.TryGetProperty("ingestion_timestamp", out _));
        Assert.False(log.TryGetProperty("uploader_user_claims", out _));
        Assert.False(log.TryGetProperty("exception", out _));
    }
}

using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.TestUtilities;
using System.Text.Json;
using FluentAssertions;
using TTLeaguePlayersApp.BackEnd.APIGateway;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.FrontendEvents.Tests;

public class FrontendEventsHandlerTests
{
    private static ApiGatewayProxyHandler Handler() => new(null!, null!, null!, null!, null!, null!, null!, null!, null!, null!, null!, "*");
    private static APIGatewayProxyRequest Request(string method, string body = "") => new()
    {
        Path = "/frontend-events", HttpMethod = method, Body = body,
        Headers = new Dictionary<string, string> { ["Content-Type"] = "application/json" }
    };

    [Fact]
    public async Task Dispatch_ReturnsEmpty204AndCorsForValidDiagnostic()
    {
        var request = Request("POST", """{"event_id":"one","timestamp":"2026-10-27T12:00:00Z","event_category":"FRONTEND_API_CALL_ERROR","client_api_type":"TT365","operation":"fixtures","event_name":"failure","source":{},"exception":{}}""");
        var response = await Handler().Dispatch(request, new TestLambdaContext());
        response.StatusCode.Should().Be(204);
        response.Body.Should().BeEmpty();
        response.Headers.Should().ContainKey("Access-Control-Allow-Origin");
    }

    [Theory]
    [InlineData("FRONTEND_API_CALL_ERROR", "ERROR", "FRONTEND_API_CALL_ERROR")]
    [InlineData("FRONTEND_API_CALL_IRREGULAR", "WARN", "FRONTEND_API_CALL_IRREGULAR")]
    public async Task Dispatch_LogsFilterableDiagnosticWithRequiredFields(string diagnosticType, string level, string category)
    {
        var requestBody = JsonSerializer.Serialize(new { event_category = diagnosticType, client_api_type = "TT365" });
        var context = new TestLambdaContext();
        var response = await Handler().Dispatch(Request("POST", requestBody), context);
        response.StatusCode.Should().Be(204);
        var logs = ((TestLambdaLogger)context.Logger).Buffer.ToString();
        logs.Should().Contain($"\"log_level\":\"{level}\"");
        logs.Should().Contain($"\"event_category\":\"{category}\"");
    }

    [Fact]
    public async Task Dispatch_PreflightAndUnsupportedMethodHaveExpectedResponses()
    {
        var handler = Handler();
        var options = await handler.Dispatch(Request("OPTIONS"), new TestLambdaContext());
        options.StatusCode.Should().Be(200);
        options.Headers["Access-Control-Allow-Methods"].Should().Contain("POST");
        var get = await handler.Dispatch(Request("GET"), new TestLambdaContext());
        get.StatusCode.Should().Be(405);
    }

    [Fact]
    public async Task Dispatch_LogsDiagnosticLargerThanTheFormerApplicationLimit()
    {
        var body = new string('x', 300 * 1024);
        var requestBody = JsonSerializer.Serialize(new
        {
            event_id = "large-event", timestamp = "2026-10-27T12:00:00Z", event_category = "FRONTEND_API_CALL_ERROR",
            client_api_type = "TT365", operation = "fixtures", event_name = "failure",
            source = new { }, exception = new { }, response = new { body }
        });
        var context = new TestLambdaContext();
        var response = await Handler().Dispatch(Request("POST", requestBody), context);
        response.StatusCode.Should().Be(204);
        ((TestLambdaLogger)context.Logger).Buffer.ToString().Should().Contain(body);
    }
    [Fact]
    public async Task Dispatch_RejectsMalformedBase64AndUnsupportedContentType()
    {
        var invalidEncoding = Request("POST", "not base64!");
        invalidEncoding.IsBase64Encoded = true;
        var invalidResponse = await Handler().Dispatch(invalidEncoding, new TestLambdaContext());
        invalidResponse.StatusCode.Should().Be(400);

        var unsupported = Request("POST", "{}");
        unsupported.Headers["Content-Type"] = "text/plain";
        var unsupportedResponse = await Handler().Dispatch(unsupported, new TestLambdaContext());
        unsupportedResponse.StatusCode.Should().Be(415);
    }

}

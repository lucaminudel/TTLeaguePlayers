using System.Text.Json;
using FluentAssertions;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.FrontendEvents.Tests;

public class FrontendApiCallDiagnosticTests
{
    [Theory]
    [InlineData("FRONTEND_API_CALL_ERROR")]
    [InlineData("FRONTEND_API_CALL_IRREGULAR")]
    public void Diagnostic_RoundTripsPropertyBagsAndRawBodies(string diagnosticType)
    {
        var diagnostic = JsonSerializer.Deserialize<FrontendApiCallDiagnostic>("""
            {"event_id":"event-1","timestamp":"2026-10-27T12:00:00Z","event_category":"FRONTEND_API_CALL_ERROR",
             "client_api_type":"TT365","operation":"getTeamFixtures","event_name":"request failed",
             "source":{"file":"fetcher.ts"},"exception":{"name":"Error","stack":"stack"},
             "request":{"method":"POST","headers":{"Accept":"text/html"},"body":"{\"x\":1}","body_original_length":7},
             "response":{"status":500,"body":"<h1>é</h1>"},"user_claims":{"sub":"original-user"},
             "page":"/fixtures","app_version":"1"}
            """)!;
        diagnostic.EventCategory = diagnosticType;

        var json = JsonSerializer.Serialize(diagnostic);
        var result = JsonSerializer.Deserialize<FrontendApiCallDiagnostic>(json)!;

        FrontendApiCallDiagnosticValidator.Validate(result);
        JsonSerializer.Serialize(result).Should().Be(json);
        json.Should().Contain("\"event_category\"").And.Contain("\"body_original_length\"");
    }

    [Fact]
    public void Validate_RejectsUnknownEventCategory()
    {
        var diagnostic = new FrontendApiCallDiagnostic { EventCategory = "unknown", ClientApiType = "TT365" };
        var act = () => FrontendApiCallDiagnosticValidator.Validate(diagnostic);
        var errors = act.Should().Throw<ValidationException>().Which.Errors;
        errors.Should().Contain(e => e.Contains("event_category"));
    }

    [Theory]
    [InlineData("FRONTEND_API_CALL_ERROR")]
    [InlineData("FRONTEND_API_CALL_IRREGULAR")]
    public void Validate_AcceptsEventCategoryWithRequiredApiType(string diagnosticType)
    {
        var diagnostic = new FrontendApiCallDiagnostic { EventCategory = diagnosticType, ClientApiType = "TT365" };
        var act = () => FrontendApiCallDiagnosticValidator.Validate(diagnostic);
        act.Should().NotThrow();
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Validate_RejectsMissingOrBlankCategory(string? category)
    {
        var diagnostic = new FrontendApiCallDiagnostic { EventCategory = category, ClientApiType = "TT365" };
        var act = () => FrontendApiCallDiagnosticValidator.Validate(diagnostic);
        act.Should().Throw<ValidationException>().Which.Errors.Should().Contain(e => e.Contains("event_category"));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Validate_RejectsMissingOrBlankApiType(string? apiType)
    {
        var diagnostic = new FrontendApiCallDiagnostic { EventCategory = "FRONTEND_API_CALL_ERROR", ClientApiType = apiType };
        var act = () => FrontendApiCallDiagnosticValidator.Validate(diagnostic);
        act.Should().Throw<ValidationException>().Which.Errors.Should().Contain(e => e.Contains("client_api_type"));
    }

    [Theory]
    [InlineData("Cognito")]
    [InlineData("Backend API")]
    public void Validate_AcceptsOtherApiTypes(string apiType)
    {
        var diagnostic = new FrontendApiCallDiagnostic { EventCategory = "FRONTEND_API_CALL_ERROR", ClientApiType = apiType };
        var act = () => FrontendApiCallDiagnosticValidator.Validate(diagnostic);
        act.Should().NotThrow();
    }

    [Theory]
    [InlineData("{\"timestamp\":\"not a timestamp\"}")]
    public void Deserialize_RejectsIncorrectFieldTypes(string json)
    {
        var act = () => JsonSerializer.Deserialize<FrontendApiCallDiagnostic>(json);
        act.Should().Throw<JsonException>();
    }

    [Fact]
    public void Validate_RejectsNullDiagnostic()
    {
        var missing = () => FrontendApiCallDiagnosticValidator.Validate(null);
        missing.Should().Throw<ValidationException>();
    }
}

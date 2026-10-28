using System.Text.Json;
using Amazon.Lambda.TestUtilities;
using Amazon.Lambda.Core;
using FluentAssertions;
using TTLeaguePlayersApp.BackEnd.Tests;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.FrontendEvents.Tests;

public class FrontendEventsLambdaTests
{
    [Theory]
    [InlineData("FRONTEND_API_CALL_ERROR", true)]
    [InlineData("FRONTEND_API_CALL_IRREGULAR", false)]
    public async Task HandleAsync_DispatchesTypeWithOriginalClaims(string type, bool error)
    {
        var observer = new SpyLoggerObserver();
        var diagnostic = ValidDiagnostic();
        diagnostic.EventId = "one";
        diagnostic.EventCategory = type;
        await new FrontendEventsLambda(observer).HandleAsync(diagnostic, new TestLambdaContext());
        var received = error ? observer.FrontendApiCallErrors : observer.FrontendApiCallIrregularEvents;
        received.Should().ContainSingle();
        received[0].Should().BeSameAs(diagnostic);
        (error ? observer.FrontendApiCallIrregularEvents : observer.FrontendApiCallErrors).Should().BeEmpty();
    }

    [Fact]
    public async Task HandleAsync_RejectsInvalidDiagnosticBeforeEmitting()
    {
        var observer = new SpyLoggerObserver();
        var action = () => new FrontendEventsLambda(observer).HandleAsync(new FrontendApiCallDiagnostic(), new TestLambdaContext());
        await action.Should().ThrowAsync<ValidationException>();
        observer.FrontendApiCallErrors.Should().BeEmpty();
        observer.FrontendApiCallIrregularEvents.Should().BeEmpty();
        observer.RuntimeErrors.Should().BeEmpty();
    }

    [Fact]
    public async Task HandleAsync_LogsUnexpectedEmissionFailureAndRethrows()
    {
        var observer = new ThrowingObserver();
        var diagnostic = ValidDiagnostic();
        var action = () => new FrontendEventsLambda(observer).HandleAsync(diagnostic, new TestLambdaContext());
        await action.Should().ThrowAsync<InvalidOperationException>();
        observer.Error.Should().BeOfType<InvalidOperationException>();
        observer.Parameters.Should().Contain("event_id", "event-1").And.Contain("operation", "fixtures");
    }

    private static FrontendApiCallDiagnostic ValidDiagnostic() => JsonSerializer.Deserialize<FrontendApiCallDiagnostic>("""
        {"event_id":"event-1","timestamp":"2026-10-27T12:00:00Z","event_category":"FRONTEND_API_CALL_ERROR",
         "client_api_type":"TT365","operation":"fixtures","event_name":"failure","source":{},"exception":{}}
        """)!;

    private sealed class ThrowingObserver : ILoggerObserver
    {
        public Exception? Error { get; private set; }
        public Dictionary<string, string>? Parameters { get; private set; }
        public void OnFrontendApiCallError(IFrontendApiCallDiagnostic diagnostic, ILambdaContext context) => throw new InvalidOperationException("emission failed");
        public void OnFrontendApiCallIrregularEvent(IFrontendApiCallDiagnostic diagnostic, ILambdaContext context) => throw new InvalidOperationException("emission failed");
        public void OnRuntimeError(Exception ex, ILambdaContext context, Dictionary<string, string>? parameters = null, object? userClaims = null) { Error = ex; Parameters = parameters; }
        public void OnBusinessEvent(string eventName, ILambdaContext context, Dictionary<string, string>? parameters = null, object? userClaims = null) { }
        public void OnSecurityError(Exception ex, ILambdaContext context, Dictionary<string, string>? parameters = null, object? userClaims = null) { }
        public void OnSecurityIrregularEvent(string eventName, Dictionary<string, string> source, ILambdaContext context, Dictionary<string, string>? parameters = null, object? userClaims = null) { }
        public void OnSecurityRegularEvent(string eventName, Dictionary<string, string> source, ILambdaContext context, Dictionary<string, string>? parameters = null, object? userClaims = null) { }
        public void OnRuntimeCriticalError(Exception ex, ILambdaContext context, Dictionary<string, string>? parameters = null, object? userClaims = null) { }
        public void OnRuntimeIrregularEvent(string eventName, Dictionary<string, string> source, ILambdaContext context, Dictionary<string, string>? parameters = null, object? userClaims = null) { }
        public void OnRuntimeRegularEvent(string eventName, Dictionary<string, string> source, ILambdaContext context, Dictionary<string, string>? parameters = null, object? userClaims = null) { }
    }
}

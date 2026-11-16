using Amazon.Lambda.Core;
using TTLeaguePlayersApp.BackEnd.FrontendEvents;

namespace TTLeaguePlayersApp.BackEnd.Tests;

public sealed class SpyLoggerObserver : ILoggerObserver
{
    public List<Exception> SecurityErrors { get; } = new();

    public void OnSecurityError(Exception ex, ILambdaContext context, Dictionary<string, string>? parameters = null, object? userClaims = null)
        => SecurityErrors.Add(ex);

    public void OnBusinessEvent(string eventName, ILambdaContext context, Dictionary<string, string>? parameters = null, object? userClaims = null) { }
    public void OnSecurityIrregularEvent(string eventName, Dictionary<string, string> source, ILambdaContext context, Dictionary<string, string>? parameters = null, object? userClaims = null) { }
    public void OnSecurityRegularEvent(string eventName, Dictionary<string, string> source, ILambdaContext context, Dictionary<string, string>? parameters = null, object? userClaims = null) { }
    public void OnRuntimeCriticalError(Exception ex, ILambdaContext context, Dictionary<string, string>? parameters = null, object? userClaims = null) { }
    public List<Exception> RuntimeErrors { get; } = new();
    public List<object?> RuntimeErrorClaims { get; } = new();

    public void OnRuntimeError(Exception ex, ILambdaContext context, Dictionary<string, string>? parameters = null, object? userClaims = null)
    {
        RuntimeErrors.Add(ex);
        RuntimeErrorClaims.Add(userClaims);
    }
    public List<(string EventName, Dictionary<string, string>? Parameters)> RuntimeIrregularEvents { get; } = new();
    public List<object?> RuntimeIrregularClaims { get; } = new();

    public void OnRuntimeIrregularEvent(string eventName, Dictionary<string, string> source, ILambdaContext context, Dictionary<string, string>? parameters = null, object? userClaims = null)
    {
        RuntimeIrregularEvents.Add((eventName, parameters));
        RuntimeIrregularClaims.Add(userClaims);
    }
    public List<(string EventName, Dictionary<string, string>? Parameters)> RuntimeRegularEvents { get; } = new();
    public List<object?> RuntimeRegularClaims { get; } = new();
    public void OnRuntimeRegularEvent(string eventName, Dictionary<string, string> source, ILambdaContext context, Dictionary<string, string>? parameters = null, object? userClaims = null)
    {
        RuntimeRegularEvents.Add((eventName, parameters));
        RuntimeRegularClaims.Add(userClaims);
    }

    public List<IFrontendApiCallDiagnostic> FrontendApiCallErrors { get; } = new();
    public List<IFrontendApiCallDiagnostic> FrontendApiCallIrregularEvents { get; } = new();

    public void OnFrontendApiCallError(IFrontendApiCallDiagnostic diagnostic, ILambdaContext context)
        => FrontendApiCallErrors.Add(diagnostic);
    public void OnFrontendApiCallIrregularEvent(IFrontendApiCallDiagnostic diagnostic, ILambdaContext context)
        => FrontendApiCallIrregularEvents.Add(diagnostic);
}

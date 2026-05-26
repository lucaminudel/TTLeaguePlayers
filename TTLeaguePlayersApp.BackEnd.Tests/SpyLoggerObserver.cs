using Amazon.Lambda.Core;

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

    public void OnRuntimeError(Exception ex, ILambdaContext context, Dictionary<string, string>? parameters = null, object? userClaims = null)
        => RuntimeErrors.Add(ex);
    public void OnRuntimeIrregularEvent(string eventName, Dictionary<string, string> source, ILambdaContext context, Dictionary<string, string>? parameters = null, object? userClaims = null) { }
    public void OnRuntimeRegularEvent(string eventName, Dictionary<string, string> source, ILambdaContext context, Dictionary<string, string>? parameters = null, object? userClaims = null) { }
}

using Amazon.Lambda.Core;
using TTLeaguePlayersApp.BackEnd.FrontendEvents;

namespace TTLeaguePlayersApp.BackEnd;

public interface ILoggerObserver
{
    void OnBusinessEvent(string eventName, ILambdaContext context, Dictionary<string, string>? parameters = null, object? userClaims = null);

    void OnSecurityError(Exception ex, ILambdaContext context, Dictionary<string, string>? parameters = null, object? userClaims = null);
    void OnSecurityIrregularEvent(string eventName, Dictionary<string, string> source, ILambdaContext context, Dictionary<string, string>? parameters = null, object? userClaims = null);
    void OnSecurityRegularEvent(string eventName, Dictionary<string, string> source, ILambdaContext context, Dictionary<string, string>? parameters = null, object? userClaims = null);

    void OnRuntimeCriticalError(Exception ex, ILambdaContext context, Dictionary<string, string>? parameters = null, object? userClaims = null);
    void OnRuntimeError(Exception ex, ILambdaContext context, Dictionary<string, string>? parameters = null, object? userClaims = null);
    void OnRuntimeIrregularEvent(string eventName, Dictionary<string, string> source, ILambdaContext context, Dictionary<string, string>? parameters = null, object? userClaims = null);
    void OnRuntimeRegularEvent(string eventName, Dictionary<string, string> source, ILambdaContext context, Dictionary<string, string>? parameters = null, object? userClaims = null);
    
    void OnFrontendApiCallError(IFrontendApiCallDiagnostic diagnostic, ILambdaContext context);
    void OnFrontendApiCallIrregularEvent(IFrontendApiCallDiagnostic diagnostic, ILambdaContext context);
}
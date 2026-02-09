using Amazon.Lambda.Core;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.Encodings.Web;

namespace TTLeaguePlayersApp.BackEnd;

public class LoggerObserver : ILoggerObserver
{
    public void OnBusinessEvent(string eventName, ILambdaContext context, Dictionary<string, string>? parameters = null, object? userClaims = null)
        => Log(context, "INFO", "BUSINESS_EVENT", eventName, parameters: parameters, userClaims: userClaims);

    public void OnSecurityError(Exception ex, ILambdaContext context, Dictionary<string, string>? parameters = null, object? userClaims = null)
        => Log(context, "ERROR", "SECURITY_ERROR", ex: ex, parameters: parameters, userClaims: userClaims);

    public void OnSecurityIrregularEvent(string eventName, Dictionary<string, string> source, ILambdaContext context, Dictionary<string, string>? parameters = null, object? userClaims = null)
        => Log(context, "WARN", "SECURITY_IRREGULAR", eventName, source, parameters: parameters, userClaims: userClaims);

    public void OnSecurityRegularEvent(string eventName, Dictionary<string, string> source, ILambdaContext context, Dictionary<string, string>? parameters = null, object? userClaims = null)
        => Log(context, "INFO", "SECURITY_REGULAR", eventName, source, parameters: parameters, userClaims: userClaims);

    public void OnRuntimeCriticalError(Exception ex, ILambdaContext context, Dictionary<string, string>? parameters = null, object? userClaims = null)
        => Log(context, "CRITICAL", "RUNTIME_CRITICAL_ERROR", ex: ex, parameters: parameters, userClaims: userClaims);

    public void OnRuntimeError(Exception ex, ILambdaContext context, Dictionary<string, string>? parameters = null, object? userClaims = null)
        => Log(context, "ERROR", "RUNTIME_ERROR", ex: ex, parameters: parameters, userClaims: userClaims);

    public void OnRuntimeIrregularEvent(string eventName, Dictionary<string, string> source, ILambdaContext context, Dictionary<string, string>? parameters = null, object? userClaims = null)
        => Log(context, "WARN", "RUNTIME_IRREGULAR", eventName, source, parameters: parameters, userClaims: userClaims);

    public void OnRuntimeRegularEvent(string eventName, Dictionary<string, string> source, ILambdaContext context, Dictionary<string, string>? parameters = null, object? userClaims = null)
        => Log(context, "INFO", "RUNTIME_REGULAR", eventName, source, parameters: parameters, userClaims: userClaims);

    private void Log(ILambdaContext context, string level, string category, string? eventName = null, Dictionary<string, string>? source = null, Exception? ex = null, Dictionary<string, string>? parameters = null, object? userClaims = null)
    {
        var exception = (ex == null) ? null : new
        {
            name = ex.GetType().Name,
            message = ex.Message,
            stackTrace = ex.StackTrace
        };

        var logEntry = new
        {
            timestamp = DateTime.UtcNow,
            log_level = level,
            event_category = category,
            event_name = eventName,
            source,
            exception,
            parameters,
            userClaims,
            requestId = context.AwsRequestId,
            functionName = context.FunctionName,
            functionVersion = context.FunctionVersion
        };
        
        context.Logger.LogLine(JsonSerializer.Serialize(logEntry, JsonOptions));
    }
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping
    };

}
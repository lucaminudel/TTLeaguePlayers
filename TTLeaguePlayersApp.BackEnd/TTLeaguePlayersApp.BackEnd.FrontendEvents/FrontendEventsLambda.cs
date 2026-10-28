using Amazon.Lambda.Core;

namespace TTLeaguePlayersApp.BackEnd.FrontendEvents;

public class FrontendEventsLambda(ILoggerObserver observer)
{
    public Task HandleAsync(IFrontendApiCallDiagnostic diagnostic, ILambdaContext context)
    {
        FrontendApiCallDiagnosticValidator.Validate(diagnostic);
        try
        {
            if (diagnostic.EventCategory == "FRONTEND_API_CALL_ERROR")
                observer.OnFrontendApiCallError(diagnostic, context);
            else
                observer.OnFrontendApiCallIrregularEvent(diagnostic, context);
        }
        catch (Exception ex)
        {
            observer.OnRuntimeError(ex, context, new Dictionary<string, string>
            {
                ["event_id"] = diagnostic.EventId ?? string.Empty,
                ["operation"] = diagnostic.Operation ?? string.Empty
            });
            throw;
        }
        return Task.CompletedTask;
    }
}

namespace TTLeaguePlayersApp.BackEnd.FrontendEvents;

public static class FrontendApiCallDiagnosticValidator
{
    public static void Validate(IFrontendApiCallDiagnostic? diagnostic)
    {
        if (diagnostic == null) throw new ValidationException(["diagnostic is required"]);
        if (diagnostic.EventCategory is not ("FRONTEND_API_CALL_ERROR" or "FRONTEND_API_CALL_IRREGULAR"))
            throw new ValidationException(["event_category must be FRONTEND_API_CALL_ERROR or FRONTEND_API_CALL_IRREGULAR"]);
        if (string.IsNullOrWhiteSpace(diagnostic.ClientApiType))
            throw new ValidationException(["client_api_type is required"]);
    }
}

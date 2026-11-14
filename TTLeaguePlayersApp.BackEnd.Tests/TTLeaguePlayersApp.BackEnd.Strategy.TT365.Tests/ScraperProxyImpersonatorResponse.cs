namespace TTLeaguePlayersApp.BackEnd.Tests.Strategy.TT365;

public sealed record ScraperProxyImpersonatorResponse
{
    private ScraperProxyImpersonatorResponse(string? content, Exception? exception)
    {
        Content = content;
        Exception = exception;
    }

    public string? Content { get; }
    public Exception? Exception { get; }

    public static ScraperProxyImpersonatorResponse FromContent(string content)
    {
        ArgumentNullException.ThrowIfNull(content);
        return new ScraperProxyImpersonatorResponse(content, null);
    }

    public static ScraperProxyImpersonatorResponse FromException(Exception exception)
    {
        ArgumentNullException.ThrowIfNull(exception);
        return new ScraperProxyImpersonatorResponse(null, exception);
    }
}

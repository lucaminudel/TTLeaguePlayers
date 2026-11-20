namespace TTLeaguePlayersApp.BackEnd.Strategy.Lambdas;

public sealed class StrategySourceCheckException : Exception
{
    public StrategySourceCheckException(
        string sourceName,
        string message,
        Exception? innerException = null,
        string stage = "parse",
        bool isTimeout = false)
        : base(message, innerException)
    {
        SourceName = sourceName;
        Stage = stage;
        IsTimeout = isTimeout;
    }

    public string SourceName { get; }
    public string Stage { get; }
    public bool IsTimeout { get; }
}

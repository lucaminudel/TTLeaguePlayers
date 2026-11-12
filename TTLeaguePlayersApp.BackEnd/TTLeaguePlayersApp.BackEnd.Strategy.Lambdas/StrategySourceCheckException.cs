namespace TTLeaguePlayersApp.BackEnd.Strategy.Lambdas;

public sealed class StrategySourceCheckException : Exception
{
    public StrategySourceCheckException(string sourceName, string message, Exception? innerException = null)
        : base(message, innerException)
    {
        SourceName = sourceName;
    }

    public string SourceName { get; }
}

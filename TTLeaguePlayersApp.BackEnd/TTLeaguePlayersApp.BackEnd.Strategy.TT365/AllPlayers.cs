namespace TTLeaguePlayersApp.BackEnd.Strategy.TT365;

public sealed class AllPlayers
{
    public AllPlayers(IReadOnlyDictionary<string, Player> players, IReadOnlyList<string> anomalies)
    {
        ArgumentNullException.ThrowIfNull(players);
        ArgumentNullException.ThrowIfNull(anomalies);

        Players = players;
        Anomalies = anomalies;
    }

    public IReadOnlyDictionary<string, Player> Players { get; }

    public IReadOnlyList<string> Anomalies { get; }
}

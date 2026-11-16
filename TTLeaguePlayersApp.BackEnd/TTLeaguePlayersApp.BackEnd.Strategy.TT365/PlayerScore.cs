namespace TTLeaguePlayersApp.BackEnd.Strategy.TT365;

public sealed class PlayerScore(string name, int won)
{
    public string Name { get; } = name;
    public int Won { get; } = won;
}

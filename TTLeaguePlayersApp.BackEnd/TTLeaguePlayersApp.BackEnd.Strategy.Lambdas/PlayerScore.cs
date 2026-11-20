namespace TTLeaguePlayersApp.BackEnd.Strategy.Lambdas;

public sealed class PlayerScore(string name, int won, int played)
{
    public string Name { get; } = name;
    public int Won { get; } = won;
    public int Played { get; } = played;
}

namespace TTLeaguePlayersApp.BackEnd.TTLeaguePlayersApp.BackEnd.Strategy.Lambdas;

public sealed class Division
{
    public Division(string name)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        Name = name;
        Teams = new OrderedDictionary<string, Team>(StringComparer.OrdinalIgnoreCase);
    }

    public string Name { get; }

    public OrderedDictionary<string, Team> Teams { get; }

    public int? TeamsLookbackPeriod { get; set; }

    public int? PlayersLookbackPeriod { get; set; }
}

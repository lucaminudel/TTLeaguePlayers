namespace TTLeaguePlayersApp.BackEnd.TTLeaguePlayersApp.BackEnd.Strategy.Lambdas;

public sealed class Team
{
    public Team(string name)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        Name = name;
        Players = new OrderedDictionary<string, Player>(StringComparer.OrdinalIgnoreCase);
    }


    public string Name { get; }

    public OrderedDictionary<string, Player> Players { get; }

    public int? Played { get; set; }

    public int? TotalPoints { get; set; }

    public decimal? TeamWinPercentage { get; set; }
}

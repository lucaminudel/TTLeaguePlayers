namespace TTLeaguePlayersApp.BackEnd.Strategy.TT365;

public sealed class DivisionTable
{
    public DivisionTable(string name)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        Name = name;
        TeamsStanding = new OrderedDictionary<string, TeamStanding>(StringComparer.OrdinalIgnoreCase);
    }

    public string Name { get; }

    public OrderedDictionary<string, TeamStanding> TeamsStanding { get; }

    public int TeamsLookbackPeriod => TeamsStanding.Count - 1;

    public int PlayersLookbackPeriod => TeamsLookbackPeriod / 2;
}

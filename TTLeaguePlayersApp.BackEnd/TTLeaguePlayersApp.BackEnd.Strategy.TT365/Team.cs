using System.Collections.Generic;

namespace TTLeaguePlayersApp.BackEnd.Strategy.TT365;

public sealed class Team
{
    public Team(string name, int teamId)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        if (teamId <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(teamId), teamId, "A team ID must be positive.");
        }

        Name = name;
        TeamId = teamId;
        Players = new OrderedDictionary<string, Player>(StringComparer.OrdinalIgnoreCase);
    }


    public string Name { get; }

    public int TeamId { get; }

    public OrderedDictionary<string, Player> Players { get; }

    public int? Played { get; set; }

    public int? SetsFor { get; set; }

    public int? SetsAgainst { get; set; }

    public int? TotalPoints { get; set; }
}

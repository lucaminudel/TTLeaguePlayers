using System.Collections.Generic;

namespace TTLeaguePlayersApp.BackEnd.Strategy.TT365;

public sealed class Team
{
    public Team(Division division, string name, int teamId)
    {
        ArgumentNullException.ThrowIfNull(division);
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        if (teamId <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(teamId), teamId, "A team ID must be positive.");
        }

        Division = division;
        Name = name;
        TeamId = teamId;
        Players = new OrderedDictionary<string, Player>(StringComparer.OrdinalIgnoreCase);
    }

    public Division Division { get; }

    public string Name { get; }

    public int TeamId { get; }

    public OrderedDictionary<string, Player> Players { get; }
}

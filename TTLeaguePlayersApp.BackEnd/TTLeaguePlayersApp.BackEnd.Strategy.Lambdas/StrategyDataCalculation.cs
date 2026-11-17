namespace TTLeaguePlayersApp.BackEnd.TTLeaguePlayersApp.BackEnd.Strategy.Lambdas;

public static class StrategyDataCalculation
{
    public static OrderedDictionary<string, Division> CalculateStrategyData(
        OrderedDictionary<string, Division> divisions,
        IReadOnlyDictionary<string, Player> rankedPlayers,
        OrderedDictionary<string, DivisionTable> tables,
        OrderedDictionary<string, List<Fixture>> fixtures)
    {
        ArgumentNullException.ThrowIfNull(divisions);
        ArgumentNullException.ThrowIfNull(rankedPlayers);
        ArgumentNullException.ThrowIfNull(tables);
        ArgumentNullException.ThrowIfNull(fixtures);

        ValidateTables(divisions, tables);

        foreach (var (divisionName, division) in divisions)
        {
            var table = tables[divisionName];
            division.TeamsLookbackPeriod = division.Teams.Count - 1;
            division.PlayersLookbackPeriod = (int)decimal.Floor(division.TeamsLookbackPeriod.Value * 0.7m);
            foreach (var (teamName, team) in division.Teams)
            {
                var standing = table.TeamsStanding[teamName];
                var totalSets = (decimal)standing.SetsFor + standing.SetsAgainst;
                team.Played = standing.Played;
                team.TotalPoints = standing.TotalPoints;
                team.TeamWinPercentage = totalSets == 0 ? null : 100m * standing.SetsFor / totalSets;
            }

            var players = division.Teams.Values
                .SelectMany(team => team.Players.Select(entry => (Team: team, Key: entry.Key, Player: entry.Value)))
                .ToArray();
            var rankings = players.Select(entry => rankedPlayers.TryGetValue(entry.Player.Name, out var ranked)
                ? ranked.CurrentRanking : null).ToArray();
            var eligible = rankings.Where(ranking => ranking.HasValue && ranking.Value != 0)
                .Select(ranking => ranking!.Value).ToArray();
            int? lower = eligible.Length == 0 ? null : eligible.Min();
            int? higher = eligible.Length == 0 ? null : eligible.Max();

            for (var i = 0; i < players.Length; i++)
            {
                var ranking = rankings[i];
                decimal? normalized = ranking.HasValue && ranking.Value != 0 && lower != higher
                    ? 100m * ((decimal)ranking.Value - lower!.Value) / ((decimal)higher!.Value - lower.Value)
                    : null;
                var entry = players[i];
                entry.Team.Players[entry.Key] = entry.Player with
                {
                    CurrentRanking = ranking,
                    NormalisedCurrentRanking = normalized
                };
            }
        }

        return divisions;
    }

    private static void ValidateTables(
        OrderedDictionary<string, Division> divisions,
        OrderedDictionary<string, DivisionTable> tables)
    {
        foreach (var (name, division) in divisions)
        {
            if (!tables.TryGetValue(name, out var table))
                throw new InvalidOperationException($"Division '{name}' is missing from the tables.");
            if (division.Teams.Count == 0)
                throw new InvalidOperationException($"Division '{name}' has no teams.");
            foreach (var team in division.Teams.Keys)
                if (!table.TeamsStanding.ContainsKey(team))
                    throw new InvalidOperationException($"Team '{team}' in division '{name}' is missing from the League Table.");
            foreach (var team in table.TeamsStanding.Keys)
                if (!division.Teams.ContainsKey(team))
                    throw new InvalidOperationException($"Team '{team}' in division '{name}' is missing from the Divisions Teams roster.");
        }

        foreach (var name in tables.Keys)
            if (!divisions.ContainsKey(name))
                throw new InvalidOperationException($"Division '{name}' is missing from the Divisions Teams roster.");
    }
}

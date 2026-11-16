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

        foreach (var division in divisions.Values)
        {
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
}

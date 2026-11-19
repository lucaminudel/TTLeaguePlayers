namespace TTLeaguePlayersApp.BackEnd.TTLeaguePlayersApp.BackEnd.Strategy.Lambdas;

public sealed class StrategyDataCalculator
{
    private readonly OrderedDictionary<string, Division> _divisions;

    public StrategyDataCalculator(OrderedDictionary<string, Division> seasonRoster)
    {
        ArgumentNullException.ThrowIfNull(seasonRoster);
        _divisions = seasonRoster;
    }

    public void UpdateStrategyDataWith(
        IReadOnlyDictionary<string, Player> leagueRankedPlayers,
        OrderedDictionary<string, DivisionTable> tables,
        OrderedDictionary<string, List<Fixture>> fixtures)
    {
        ArgumentNullException.ThrowIfNull(leagueRankedPlayers);
        ArgumentNullException.ThrowIfNull(tables);
        ArgumentNullException.ThrowIfNull(fixtures);

        ValidateTables(_divisions, tables);
        ValidateFixtures(_divisions, fixtures);

        foreach (var (divisionName, division) in _divisions)
        {
            var table = tables[divisionName];
            division.TeamsLookbackPeriod = division.Teams.Count - 1;
            division.PlayersLookbackPeriod = (int)decimal.Floor(division.TeamsLookbackPeriod.Value * 0.7m);
            foreach (var (teamName, team) in division.Teams)
            {
                var standing = table.TeamsStanding[teamName];
                var totalSets = (decimal)standing.SetsFor + standing.SetsAgainst;
                team.Played = standing.Played;
                team.Points = standing.TotalPoints;
                team.WinPercentage = totalSets == 0 ? null : 100m * standing.SetsFor / totalSets;
            }

            var players = division.Teams.Values
                .SelectMany(team => team.Players.Select(entry => (Team: team, Key: entry.Key, Player: entry.Value)))
                .ToArray();
            var rankings = players.Select(entry => leagueRankedPlayers.TryGetValue(entry.Player.Name, out var ranked)
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
                    NormalisedRanking = normalized
                };
            }

            var divisionFixtures = fixtures
                .Where(entry => string.Equals(entry.Key, divisionName, StringComparison.OrdinalIgnoreCase))
                .SelectMany(entry => entry.Value);
            CalculateFixtureStatistics(division, divisionFixtures);
            CalculateStrengthGroups(division);
        }
    }

    private static void CalculateStrengthGroups(Division division)
    {
        division.StrengthGroupsNumber = null;
        division.StrengthGroupsGaps = null;
        var teams = division.Teams.Values.ToArray();
        foreach (var team in teams)
            team.RecentStrengthGroup = null;

        if (teams.Length == 0 || teams.Any(team => !team.RecentStrength.HasValue))
            return;

        var ordered = teams.OrderByDescending(team => team.RecentStrength!.Value).ToArray();
        if (ordered.Length == 1)
        {
            ordered[0].RecentStrengthGroup = 1;
            division.StrengthGroupsNumber = 1;
            division.StrengthGroupsGaps = [];
            return;
        }

        int maxGroups = Math.Min(ordered.Length / 2, ordered.Select(team => team.RecentStrength!.Value).Distinct().Count());
        var gaps = ordered.Zip(ordered.Skip(1), (stronger, weaker) =>
            stronger.RecentStrength!.Value - weaker.RecentStrength!.Value).ToArray();
        var rankedGaps = gaps.OrderByDescending(gap => gap).Take(maxGroups).ToArray();
        var drops = rankedGaps.Zip(rankedGaps.Skip(1), (higher, lower) => higher - lower)
            .Select((drop, index) => (Drop: drop, Index: index))
            .Where(item => item.Drop > 0)
            .OrderByDescending(item => item.Drop)
            .ThenBy(item => item.Index)
            .ToArray();

        decimal? threshold = null;
        if (drops.Length > 0)
        {
            var selected = drops[0].Index == 0 && drops.Length > 1 ? drops[1] : drops[0];
            threshold = rankedGaps[selected.Index];
        }

        var groupGaps = threshold.HasValue
            ? gaps.Where(gap => gap >= threshold.Value).Reverse().ToArray()
            : [];
        division.StrengthGroupsNumber = groupGaps.Length + 1;
        division.StrengthGroupsGaps = groupGaps;
        int group = division.StrengthGroupsNumber.Value;
        for (int i = 0; i < ordered.Length; i++)
        {
            ordered[i].RecentStrengthGroup = group;
            if (i < gaps.Length && threshold.HasValue && gaps[i] >= threshold.Value)
                group--;
        }
    }

    private static void ValidateFixtures(
        OrderedDictionary<string, Division> divisions,
        OrderedDictionary<string, List<Fixture>> fixtures)
    {
        foreach (var (name, matches) in fixtures)
        {
            var division = divisions.FirstOrDefault(entry =>
                string.Equals(entry.Key, name, StringComparison.OrdinalIgnoreCase)).Value;
            if (division is null)
                throw new InvalidOperationException($"Fixture division '{name}' is missing from the Divisions Teams roster.");

            foreach (var match in matches)
                foreach (var team in new[] { match.HomeTeamName, match.AwayTeamName })
                    if (!division.Teams.ContainsKey(team))
                        throw new InvalidOperationException($"Fixture team '{team}' in division '{name}' is missing from the Divisions Teams roster.");
        }
    }

    private static void CalculateFixtureStatistics(Division division, IEnumerable<Fixture> fixtures)
    {
        int teamLimit = division.TeamsLookbackPeriod!.Value;
        int playerLimit = division.PlayersLookbackPeriod!.Value;
        var teamHistory = division.Teams.Values.ToDictionary(team => team, _ => new Queue<(decimal Own, decimal Total)>());
        var playerHistory = division.Teams.Values.ToDictionary(team => team,
            team => team.Players.Keys.ToDictionary(name => name, _ => new Queue<PlayerScore>(), StringComparer.OrdinalIgnoreCase));

        foreach (var fixture in fixtures.Where(fixture => fixture.Played))
        {
            var home = division.Teams[fixture.HomeTeamName];
            var away = division.Teams[fixture.AwayTeamName];
            decimal homeScore = fixture.HomeTeamScore ?? throw new InvalidOperationException("A played fixture has no home score.");
            decimal awayScore = fixture.AwayTeamScore ?? throw new InvalidOperationException("A played fixture has no away score.");
            AddBounded(teamHistory[home], (homeScore, homeScore + awayScore), teamLimit);
            AddBounded(teamHistory[away], (awayScore, homeScore + awayScore), teamLimit);
            AddPlayers(playerHistory[home], fixture.HomeTeamPlayersScore, playerLimit);
            AddPlayers(playerHistory[away], fixture.AwayTeamPlayersScore, playerLimit);
        }

        foreach (var team in division.Teams.Values)
        {
            foreach (var (name, history) in playerHistory[team])
            {
                var player = team.Players[name];
                int sets = history.Aggregate(0, (sum, score) => checked(sum + score.Played));
                decimal wins = history.Sum(score => (decimal)score.Won);
                decimal? percentage = sets == 0 ? null : 100m * wins / sets;
                team.Players[name] = player with
                {
                    RecentSetsPlayed = sets,
                    RecentWinsPercentage = percentage,
                    RecentStrength = Blend(player.NormalisedRanking, percentage, history.Count, playerLimit)
                };
            }

            var teamMatches = teamHistory[team];
            decimal total = teamMatches.Sum(item => item.Total);
            team.RecentWinsPercentage = total == 0 ? null : 100m * teamMatches.Sum(item => item.Own) / total;
            var strengths = team.Players.Values.Where(player => player.RecentStrength.HasValue && player.RecentSetsPlayed > 0)
                .Select(player => (Value: player.RecentStrength!.Value, Weight: (decimal)player.RecentSetsPlayed)).ToArray();
            (team.WeightedAveragePlayersRecentStrength, team.PlayersRecentStrengthCoefficientOfVariation) = Statistics(strengths);
            team.RecentStrength = Blend(team.WeightedAveragePlayersRecentStrength, team.RecentWinsPercentage, teamMatches.Count, teamLimit);
            var rankings = team.Players.Values.Where(player => player.NormalisedRanking.HasValue)
                .Select(player => (Value: player.NormalisedRanking!.Value, Weight: 1m)).ToArray();
            (team.AverageNormalisedPlayersRanking, team.AverageNormalisedPlayersRankingCoefficientOfVariation) = Statistics(rankings);
            team.PlayersWithUnknownStrengthCount = team.Players.Values.Count(player => !player.RecentStrength.HasValue);
        }
    }

    private static void AddPlayers(Dictionary<string, Queue<PlayerScore>> histories, IReadOnlyList<PlayerScore> scores, int limit)
    {
        foreach (var score in scores)
            if (histories.TryGetValue(score.Name, out var history))
                AddBounded(history, score, limit);
    }

    private static void AddBounded<T>(Queue<T> history, T item, int limit)
    {
        if (limit <= 0) return;
        if (history.Count == limit) history.Dequeue();
        history.Enqueue(item);
    }

    private static decimal? Blend(decimal? baseline, decimal? recent, int count, int limit)
    {
        if (!baseline.HasValue) return recent;
        if (!recent.HasValue) return baseline;
        decimal fraction = (decimal)count / limit;
        decimal weight = 1.4m * fraction - 0.4m * fraction * fraction;
        return (1m - weight) * baseline.Value + weight * recent.Value;
    }

    private static (decimal? Mean, decimal? Coefficient) Statistics((decimal Value, decimal Weight)[] values)
    {
        decimal weight = values.Sum(item => item.Weight);
        if (weight == 0) return (null, null);
        decimal mean = values.Sum(item => item.Value * item.Weight) / weight;
        if (mean == 0) return (mean, null);
        decimal variance = values.Sum(item => item.Weight * (item.Value - mean) * (item.Value - mean)) / weight;
        return (mean, SquareRoot(variance) / mean);
    }

    private static decimal SquareRoot(decimal value)
    {
        if (value == 0) return 0;
        decimal estimate = (decimal)Math.Sqrt((double)value);
        for (var i = 0; i < 8; i++)
        {
            decimal next = (estimate + value / estimate) / 2m;
            if (next == estimate) break;
            estimate = next;
        }
        return estimate;
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

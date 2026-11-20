namespace TTLeaguePlayersApp.BackEnd.Strategy.Lambdas;

using LookbackFixtures = (Dictionary< Team, Queue<(decimal Own, decimal Total)>> forTeams, Dictionary<Team, Dictionary<string, Queue<PlayerScore>>> forPlayers);

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
            //
            // Set Divisions, teams, and players stats data
            //  

            SetDivisionAndTeamsStatsDataFromTable(division, tables[divisionName]);

            SetPlayersRankingsFromLeagueRankings(division, leagueRankedPlayers);

            var divisionFixtures = fixtures
                .Where(entry => string.Equals(entry.Key, divisionName, StringComparison.OrdinalIgnoreCase))
                .SelectMany(entry => entry.Value);
                
            SetTeamsAndPlayersStatsDataFromFixture(division, divisionFixtures);

            //
            // Calculate more Divison and teams stats data
            //
            
            CalculateTeamsStrengthGroups(division);

            CalculateDivisonsPayOffMatrix(division, division.StrengthGroupsCount);

            ForecastTeamsFinalPointsWithPayOffMatrixAndStrengthGroup(division, divisionFixtures);
        }
    }

    private static void SetDivisionAndTeamsStatsDataFromTable(Division division, DivisionTable table)
    {
        //
        // Set Divisions look back periods
        //

        division.TeamsLookbackPeriod = table.TeamsLookbackPeriod;
        division.PlayersLookbackPeriod = table.PlayersLookbackPeriod;

        foreach (var (teamName, team) in division.Teams)
        {
            var standing = table.TeamsStanding[teamName];
            var totalSets = (decimal)standing.SetsFor + standing.SetsAgainst;

            //
            // Set Teams stats data
            //
            team.Played = standing.Played;
            team.Points = standing.TotalPoints;
            team.WinPercentage = totalSets == 0 ? null : 100m * standing.SetsFor / totalSets;
        }
    }

    private static void SetPlayersRankingsFromLeagueRankings(Division division, IReadOnlyDictionary<string, Player> leagueRankedPlayers)
    {
        // 
        // Select not null, not zero (elegilble) league ranking for division players
        //

        var divisionPlayers = division.Teams.Values
            .SelectMany(team => team.Players.Select(entry => (Team: team, Key: entry.Key, Player: entry.Value)))
            .ToArray();

        var leagueRankingsForDivisonPlayers = divisionPlayers
            .Select(entry => leagueRankedPlayers.TryGetValue(entry.Player.Name, out var ranked) ? ranked.CurrentRanking : null)
            .ToArray();

        var eligibleLeagueRankingsForDivisonPlayers = leagueRankingsForDivisonPlayers
            .Where(ranking => ranking.HasValue && ranking.Value != 0)
            .Select(ranking => ranking!.Value).ToArray();



        //
        // Normalise the rankings to a 0-100
        //

        int? lower = eligibleLeagueRankingsForDivisonPlayers.Length == 0 ? null : eligibleLeagueRankingsForDivisonPlayers.Min();
        int? higher = eligibleLeagueRankingsForDivisonPlayers.Length == 0 ? null : eligibleLeagueRankingsForDivisonPlayers.Max();

        for (var i = 0; i < divisionPlayers.Length; i++)
        {
            var ranking = leagueRankingsForDivisonPlayers[i];
            decimal? normalized = ranking.HasValue && ranking.Value != 0 && lower != higher
                ? 100m * ((decimal)ranking.Value - lower!.Value) / ((decimal)higher!.Value - lower.Value)
                : null;
            var entry = divisionPlayers[i];
            entry.Team.Players[entry.Key] = entry.Player with
            {
                CurrentRanking = ranking,
                NormalisedRanking = normalized
            };
        }
    }

    private static void ForecastTeamsFinalPointsWithPayOffMatrixAndStrengthGroup(Division division, IEnumerable<Fixture> fixtures)
    {
        // 
        // Initialise the forecast with the points made from the fixtures already played
        //

        foreach (var team in division.Teams.Values)
            team.FinalPointsForecast = team.Points;

        foreach (var fixture in fixtures.Where(fixture => !fixture.Played))
        {
            // Cleanup in case UpdateStrategyDataWith() is called multiple times for the same division. 
    
            var home = division.Teams[fixture.HomeTeamName];
            var away = division.Teams[fixture.AwayTeamName];
            if (division.PayOffMatrix is null)
            {
                home.FinalPointsForecast = null;
                away.FinalPointsForecast = null;
                continue;
            }


            //
            // Forecast the remaining fixtures result with the division's payoff matrix and the teams' strength groups
            //

            var homeGroup = home.RecentStrengthGroup!.Value - 1;
            var awayGroup = away.RecentStrengthGroup!.Value - 1;

            checked
            {
                if (home.FinalPointsForecast.HasValue)
                    home.FinalPointsForecast += division.PayOffMatrix[homeGroup][awayGroup] + 
                                                division.BonusPointsPerMatchPlayed;
                if (away.FinalPointsForecast.HasValue)
                    away.FinalPointsForecast += division.PayOffMatrix[awayGroup][homeGroup] + 
                                                division.BonusPointsPerMatchPlayed;
            }
        }
    }

    private static void CalculateDivisonsPayOffMatrix(Division division, int? matrixNumber)
    {
        division.PayOffMatrix = null;
        if (!matrixNumber.HasValue)
            return;

        // Compact pay off matrix representation: one line per matrix where
        // each entry is the stronger team's advantage over five by group distance.
        int[] advantages = matrixNumber.Value switch
        {
            1 => [0],
            2 => [0, 2],
            3 => [0, 2, 4],
            4 => [0, 2, 3, 4],
            5 => [0, 1, 2, 3, 4],
            6 => [0, 1, 2, 3, 4, 5],
            7 => [0, 1, 2, 3, 4, 5, 5],
            8 => [0, 1, 1, 2, 3, 4, 5, 5],
            _ => throw new InvalidOperationException(
                $"Division '{division.Name}' has {division.StrengthGroupsCount} strength groups; payoff matrices support at most 8.")
        };

        division.PayOffMatrix = Enumerable.Range(0, advantages.Length)
            .Select(row => Enumerable.Range(0, advantages.Length)
                .Select(column => 5 + Math.Sign(row - column) * advantages[Math.Abs(row - column)])
                .ToArray())
            .ToArray();
    }

    #region CalculateTeamsStrengthGroups
    private static void CalculateTeamsStrengthGroups(Division division)
    {
        // Cleanup in case UpdateStrategyDataWith() is called multiple times for the same division. 
        division.StrengthGroupsCount = null;
        division.StrengthGroupsGaps = null;
        var teams = division.Teams.Values.ToArray();
        foreach (var team in teams)
            team.RecentStrengthGroup = null;

        if (teams.Length == 0 || teams.Any(team => !team.RecentStrength.HasValue))
            return;

        var teamsByDescendingStrength = teams.OrderByDescending(team => team.RecentStrength!.Value).ToArray();

        // Special case: if there is only one team
        if (teamsByDescendingStrength.Length == 1)
        {
            teamsByDescendingStrength[0].RecentStrengthGroup = 1;
            division.StrengthGroupsCount = 1;
            division.StrengthGroupsGaps = [];
            return;
        }

        int gapsNumberCutOff = Math.Min(
            teamsByDescendingStrength.Length / 2,
            teamsByDescendingStrength.Select(team => team.RecentStrength!.Value).Distinct().Count());

        var gapsBetweenDescendingStrengths = teamsByDescendingStrength
            .Zip(teamsByDescendingStrength.Skip(1), (stronger, weaker) =>
                stronger.RecentStrength!.Value - weaker.RecentStrength!.Value)
            .ToArray();

        var largestGaps = gapsBetweenDescendingStrengths.OrderByDescending(gap => gap).Take(gapsNumberCutOff).ToArray();

        var lastGap = SelectGapBeforeLargestDropWithFirstGapAsFallback(largestGaps);
        AssignTeamsToStrengthGroupsAndSetDivisionGroupsCount(division, teamsByDescendingStrength, gapsBetweenDescendingStrengths, lastGap);
    }

    private static decimal? SelectGapBeforeLargestDropWithFirstGapAsFallback(decimal[] largestGaps)
    {
        var dropsBySize = largestGaps.Zip(largestGaps.Skip(1), (larger, smaller) => larger - smaller)
            .Select((drop, index) => (Drop: drop, Index: index))
            .Where(item => item.Drop > 0)
            .OrderByDescending(item => item.Drop)
            .ThenBy(item => item.Index)
            .ToArray();

        if (dropsBySize.Length == 0)
            return null;

        // If the largest drop follows the first gap, use the next largest positive drop when available.
        var selectedDrop = dropsBySize[0].Index == 0 && dropsBySize.Length > 1 ? dropsBySize[1] : dropsBySize[0];
        return largestGaps[selectedDrop.Index];
    }

    private static void AssignTeamsToStrengthGroupsAndSetDivisionGroupsCount(
        Division division,
        Team[] teamsByDescendingStrength,
        decimal[] gapsBetweenDescendingStrengths,
        decimal? lastGap)
    {
        // Select the gaps that are >= the last gap, and sort from strongest to weakest
        var groupBoundaryGaps = lastGap.HasValue
            ? gapsBetweenDescendingStrengths.Where(gap => gap >= lastGap.Value).Reverse().ToArray()
            : [];

        division.StrengthGroupsCount = groupBoundaryGaps.Length + 1;
        division.StrengthGroupsGaps = groupBoundaryGaps;

        int strengthGroups = division.StrengthGroupsCount.Value;
        for (int i = 0; i < teamsByDescendingStrength.Length; i++)
        {
            teamsByDescendingStrength[i].RecentStrengthGroup = strengthGroups;
            if (i < gapsBetweenDescendingStrengths.Length && lastGap.HasValue && gapsBetweenDescendingStrengths[i] >= lastGap.Value)
                strengthGroups--;
        }
    }

    #endregion

    #region 
    private static void SetTeamsAndPlayersStatsDataFromFixture(Division division, IEnumerable<Fixture> fixtures)
    {
        int teamLookback = division.TeamsLookbackPeriod!.Value;
        int playerLookback = division.PlayersLookbackPeriod!.Value;
        var (teamResults, playerScores) = SelectPlayedFixturesInLoopbackPeriod(division, fixtures);

        //
        // Select Teams' and Players' played fixtures within their look back period 
        //

        foreach (var team in division.Teams.Values)
        {
            SetPlayerStatsFromLookbackFixtures(team, playerScores[team], playerLookback);
            SetTeamStatsFromLookbackFixtures(team, teamResults[team], teamLookback);
        }
    }

    private static LookbackFixtures SelectPlayedFixturesInLoopbackPeriod(Division division, IEnumerable<Fixture> fixtures)
    {
        int teamLookback = division.TeamsLookbackPeriod!.Value;
        int playerLookback = division.PlayersLookbackPeriod!.Value;

        var teamsResults = division.Teams.Values.ToDictionary(team => team, _ => new Queue<(decimal Own, decimal Total)>());
        var playerScores = division.Teams.Values.ToDictionary(team => team,
            team => team.Players.Keys.ToDictionary(name => name, _ => new Queue<PlayerScore>(), StringComparer.OrdinalIgnoreCase));

        // Each team and each rostered player has an independent lookback window in fixture order.
        foreach (var fixture in fixtures.Where(fixture => fixture.Played))
        {
            var home = division.Teams[fixture.HomeTeamName];
            var away = division.Teams[fixture.AwayTeamName];
            decimal homeScore = fixture.HomeTeamScore ?? throw new StrategySourceCheckException("Fixtures", "A played fixture has no home score.", stage: "integrate");
            decimal awayScore = fixture.AwayTeamScore ?? throw new StrategySourceCheckException("Fixtures", "A played fixture has no away score.", stage: "integrate");

            AddBounded(teamsResults[home], (homeScore, homeScore + awayScore), teamLookback);
            AddBounded(teamsResults[away], (awayScore, homeScore + awayScore), teamLookback);
            AddRosteredPlayerScores(playerScores[home], fixture.HomeTeamPlayersScore, playerLookback);
            AddRosteredPlayerScores(playerScores[away], fixture.AwayTeamPlayersScore, playerLookback);
        }

        return (teamsResults, playerScores);
    }

    private static void SetPlayerStatsFromLookbackFixtures(Team team,Dictionary<string, Queue<PlayerScore>> playerScores, int playerLookback)
    {
        foreach (var (name, recentScores) in playerScores)
        {
            var player = team.Players[name];
            int setsPlayed = recentScores.Aggregate(0, (sum, score) => checked(sum + score.Played));
            decimal setsWon = recentScores.Sum(score => (decimal)score.Won);
            decimal? winPercentage = setsPlayed == 0 ? null : 100m * setsWon / setsPlayed;
            team.Players[name] = player with
            {
                RecentSetsPlayed = setsPlayed,
                RecentWinsPercentage = winPercentage,
                RecentStrength = BlendStrengthByLookbackCoverage(player.NormalisedRanking, winPercentage, recentScores.Count, playerLookback)
            };
        }
    }

    private static void SetTeamStatsFromLookbackFixtures(Team team, Queue<(decimal Own, decimal Total)> recentTeamResults, int teamLookback)
    {
        decimal totalSets = recentTeamResults.Sum(result => result.Total);
        team.RecentWinsPercentage = totalSets == 0 ? null : 100m * recentTeamResults.Sum(result => result.Own) / totalSets;

        var playerStrengthsWeightedBySetsPlayed = team.Players.Values
            .Where(player => player.RecentStrength.HasValue && player.RecentSetsPlayed > 0)
            .Select(player => (Value: player.RecentStrength!.Value, Weight: (decimal)player.RecentSetsPlayed))
            .ToArray();
        (team.WeightedAveragePlayersRecentStrength, team.PlayersRecentStrengthCoefficientOfVariation) =
            WeightedMeanAndCoefficientVariation(playerStrengthsWeightedBySetsPlayed);
        team.RecentStrength = BlendStrengthByLookbackCoverage(
            team.WeightedAveragePlayersRecentStrength, team.RecentWinsPercentage, recentTeamResults.Count, teamLookback);

        var equallyWeightedPlayerRankings = team.Players.Values
            .Where(player => player.NormalisedRanking.HasValue)
            .Select(player => (Value: player.NormalisedRanking!.Value, Weight: 1m))
            .ToArray();
        (team.AverageNormalisedPlayersRanking, team.AverageNormalisedPlayersRankingCoefficientOfVariation) =
            WeightedMeanAndCoefficientVariation(equallyWeightedPlayerRankings);
        team.PlayersWithUnknownStrengthCount = team.Players.Values.Count(player => !player.RecentStrength.HasValue);
    }

    private static void AddRosteredPlayerScores(Dictionary<string, Queue<PlayerScore>> histories, IReadOnlyList<PlayerScore> scores, int limit)
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

    private static decimal? BlendStrengthByLookbackCoverage(decimal? baseline, decimal? recent, int count, int limit)
    {
        if (!baseline.HasValue) return recent;
        if (!recent.HasValue) return baseline;
        decimal fraction = (decimal)count / limit;
        decimal weight = 1.4m * fraction - 0.4m * fraction * fraction;
        return (1m - weight) * baseline.Value + weight * recent.Value;
    }

    private static (decimal? Mean, decimal? Coefficient) WeightedMeanAndCoefficientVariation((decimal Value, decimal Weight)[] values)
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
    
    #endregion

    private static void ValidateFixtures(
        OrderedDictionary<string, Division> divisions,
        OrderedDictionary<string, List<Fixture>> fixtures)
    {
        foreach (var (name, matches) in fixtures)
        {
            var division = divisions.FirstOrDefault(entry =>
                string.Equals(entry.Key, name, StringComparison.OrdinalIgnoreCase)).Value;
            if (division is null)
                throw new StrategySourceCheckException("Divisions Teams List, Fixtures", $"Fixture division '{name}' is missing from the Divisions Teams roster.", stage: "integrate");

            foreach (var match in matches)
                foreach (var team in new[] { match.HomeTeamName, match.AwayTeamName })
                    if (!division.Teams.ContainsKey(team))
                        throw new StrategySourceCheckException("Divisions Teams List, Fixtures", $"Fixture team '{team}' in division '{name}' is missing from the Divisions Teams roster.", stage: "integrate");
        }
    }

    private static void ValidateTables(
        OrderedDictionary<string, Division> divisions,
        OrderedDictionary<string, DivisionTable> tables)
    {
        foreach (var (name, division) in divisions)
        {
            if (!tables.TryGetValue(name, out var table))
                throw new StrategySourceCheckException("Divisions Teams List, League Tables", $"Division '{name}' is missing from the tables.", stage: "integrate");
            if (division.Teams.Count == 0)
                throw new StrategySourceCheckException("Divisions Teams List", $"Division '{name}' has no teams.", stage: "integrate");
            foreach (var team in division.Teams.Keys)
                if (!table.TeamsStanding.ContainsKey(team))
                    throw new StrategySourceCheckException("Divisions Teams List, League Tables", $"Team '{team}' in division '{name}' is missing from the League Table.", stage: "integrate");
            foreach (var team in table.TeamsStanding.Keys)
                if (!division.Teams.ContainsKey(team))
                    throw new StrategySourceCheckException("Divisions Teams List, League Tables", $"Team '{team}' in division '{name}' is missing from the Divisions Teams roster.", stage: "integrate");
        }

        foreach (var name in tables.Keys)
            if (!divisions.ContainsKey(name))
                throw new StrategySourceCheckException("Divisions Teams List, League Tables", $"Division '{name}' is missing from the Divisions Teams roster.", stage: "integrate");
    }
}

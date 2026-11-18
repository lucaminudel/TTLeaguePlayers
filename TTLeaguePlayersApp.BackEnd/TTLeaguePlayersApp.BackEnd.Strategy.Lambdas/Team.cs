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

    public int? Points { get; set; }

    public decimal? WinPercentage { get; set; }

    public decimal? RecentWinsPercentage { get; set; }

    public decimal? WeightedAveragePlayersRecentStrength { get; set; }

    public decimal? PlayersRecentStrengthCoefficientOfVariation { get; set; }
    
    public decimal? AverageNormalisedPlayersRanking { get; set; }

    public decimal? AverageNormalisedPlayersRankingCoefficientOfVariation { get; set; }

    // Blends weighted player strength and recent win percentage: (1-k)*strength + k*wins,
    // where j (0..1) is fixtures in the player window / player lookback and 
    // k(j) = 1.4*j - 0.4*j² grows a little faster than j (for j = 0.5, k = 0.6).
    // If either input is missing, uses the other; null if both are missing.
    public decimal? RecentStrength { get; set; }

    public int PlayersWithUnknownStrengthCount { get; set; }
}

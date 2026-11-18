namespace TTLeaguePlayersApp.BackEnd.TTLeaguePlayersApp.BackEnd.Strategy.Lambdas;

public sealed record Player(string Name, int? CurrentRanking)
{
    public decimal? NormalisedRanking { get; init; }

    public decimal? RecentWinsPercentage { get; init; }

    public int RecentSetsPlayed { get; init; }

    // Blends normalised ranking and recent win percentage: (1-k)*ranking + k*wins,
    // where j (0..1) is fixtures in the player window / player lookback and 
    // k(j) = 1.4*j - 0.4*j² grows a little faster than j (for j = 0.5, k = 0.6).
    // If either input is missing, uses the other; null if both are missing.
    public decimal? RecentStrength { get; init; }
}

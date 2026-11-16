namespace TTLeaguePlayersApp.BackEnd.TTLeaguePlayersApp.BackEnd.Strategy.Lambdas;

public sealed record Player(string Name, int? CurrentRanking)
{
    public decimal? NormalisedCurrentRanking { get; init; }
}

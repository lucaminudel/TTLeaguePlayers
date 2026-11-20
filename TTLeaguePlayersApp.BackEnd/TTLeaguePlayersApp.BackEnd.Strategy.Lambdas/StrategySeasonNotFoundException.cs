namespace TTLeaguePlayersApp.BackEnd.Strategy.Lambdas;

internal sealed class StrategySeasonNotFoundException(string message) : KeyNotFoundException(message);

namespace TTLeaguePlayersApp.BackEnd.Strategy.Lambdas;

public sealed record TableProjectionsRequest(
    string? League,
    string? Season,
    string? TeamDivision);

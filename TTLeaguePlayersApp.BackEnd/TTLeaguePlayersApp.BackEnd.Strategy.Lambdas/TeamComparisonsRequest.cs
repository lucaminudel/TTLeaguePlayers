namespace TTLeaguePlayersApp.BackEnd.Strategy.Lambdas;

public sealed record TeamComparisonsRequest(
    string? League,
    string? Season,
    string? TeamDivision,
    string? TeamName,
    string? OpponentTeamName);

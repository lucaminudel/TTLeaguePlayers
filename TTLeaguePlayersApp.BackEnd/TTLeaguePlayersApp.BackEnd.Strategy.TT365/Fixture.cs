namespace TTLeaguePlayersApp.BackEnd.Strategy.TT365;

public sealed class Fixture(
    DateOnly date,
    bool played,
    string homeTeamName,
    string awayTeamName,
    int? homeTeamScore,
    int? awayTeamScore,
    IReadOnlyList<PlayerScore> homeTeamPlayersScore,
    IReadOnlyList<PlayerScore> awayTeamPlayersScore)
{
    public DateOnly Date { get; } = date;
    public bool Played { get; } = played;
    public string HomeTeamName { get; } = homeTeamName;
    public string AwayTeamName { get; } = awayTeamName;
    public int? HomeTeamScore { get; } = homeTeamScore;
    public int? AwayTeamScore { get; } = awayTeamScore;
    public IReadOnlyList<PlayerScore> HomeTeamPlayersScore { get; } = homeTeamPlayersScore;
    public IReadOnlyList<PlayerScore> AwayTeamPlayersScore { get; } = awayTeamPlayersScore;
}

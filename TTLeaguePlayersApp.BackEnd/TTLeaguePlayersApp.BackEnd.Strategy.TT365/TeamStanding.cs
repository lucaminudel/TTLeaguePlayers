namespace TTLeaguePlayersApp.BackEnd.Strategy.TT365;

public sealed class TeamStanding
{
    public TeamStanding(int played, int setsFor, int setsAgainst, int totalPoints)
    {
        Played = played;
        SetsFor = setsFor;
        SetsAgainst = setsAgainst;
        TotalPoints = totalPoints;
    }

    public int Played { get; }

    public int SetsFor { get; }

    public int SetsAgainst { get; }

    public int TotalPoints { get; }
}

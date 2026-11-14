namespace TTLeaguePlayersApp.BackEnd.Strategy.TT365;

public sealed record RankingPageMetadata(
    DateOnly LastUpdated,
    DateOnly PeriodEnding,
    int RangeStart,
    int RangeEnd,
    int TotalPlayers,
    int CurrentPage,
    int LastPage,
    int NextPage,
    bool IsNextDisabled);

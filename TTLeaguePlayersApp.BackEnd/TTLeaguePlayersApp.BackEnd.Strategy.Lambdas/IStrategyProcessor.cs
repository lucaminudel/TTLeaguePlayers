namespace TTLeaguePlayersApp.BackEnd.TTLeaguePlayersApp.BackEnd.Strategy.Lambdas;

public interface IStrategyProcessor
{
    Task<OrderedDictionary<string, List<Fixture>>> GetAllFixtures();
    Task<(OrderedDictionary<string, Division> AllDivisionsTeamsAndPlayers, IReadOnlyList<string> Anomalies)> GetAllDivisionsWithTeamsAndPlayers();
    Task<OrderedDictionary<string, DivisionTable>> GetAllTables();
    Task<(IReadOnlyDictionary<string, Player> AllRankedPlayers, IReadOnlyList<string> Anomalies)> GetAllRankingPlayers();
}

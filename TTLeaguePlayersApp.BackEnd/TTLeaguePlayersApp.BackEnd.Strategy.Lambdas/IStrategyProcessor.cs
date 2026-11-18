namespace TTLeaguePlayersApp.BackEnd.TTLeaguePlayersApp.BackEnd.Strategy.Lambdas;

public interface IStrategyProcessor
{
    Task<(OrderedDictionary<string, Division> AllDivisionsTeamsAndPlayers, IReadOnlyList<string> Anomalies)> GetAllDivisionsWithTeamsAndPlayers();
    Task<(OrderedDictionary<string, DivisionTable> Tables, OrderedDictionary<string, List<Fixture>> Fixtures, IReadOnlyList<string> Anomalies)> GetAllTablesAndFixtures(OrderedDictionary<string, Division> divisions);
    Task<(IReadOnlyDictionary<string, Player> AllRankedPlayers, IReadOnlyList<string> Anomalies)> GetAllRankingPlayers();
}

using TTLeaguePlayersApp.BackEnd.TTLeaguePlayersApp.BackEnd.Strategy.Lambdas;

namespace TTLeaguePlayersApp.BackEnd.Tests;

public sealed class StrategyProcessorFake : IStrategyProcessor
{
    public OrderedDictionary<string, Division> Divisions { get; } = new();
    public IReadOnlyDictionary<string, Player> Rankings { get; set; } = new Dictionary<string, Player>();
    public List<string> Calls { get; } = new();
    public Exception? FixtureFailure { get; set; }
    public IReadOnlyList<string> RosterAnomalies { get; set; } = Array.Empty<string>();
    public IReadOnlyList<string> RankingAnomalies { get; set; } = Array.Empty<string>();
    public Task<OrderedDictionary<string, List<Fixture>>> GetAllFixtures() { Calls.Add("fixtures"); return FixtureFailure is null ? Task.FromResult(new OrderedDictionary<string, List<Fixture>>()) : Task.FromException<OrderedDictionary<string, List<Fixture>>>(FixtureFailure); }
    public Task<(OrderedDictionary<string, Division>, IReadOnlyList<string>)> GetAllDivisionsWithTeamsAndPlayers() { Calls.Add("divisions"); return Task.FromResult((Divisions, RosterAnomalies)); }
    public Task<OrderedDictionary<string, DivisionTable>> GetAllTables() { Calls.Add("tables"); return Task.FromResult(new OrderedDictionary<string, DivisionTable>()); }
    public Task<(IReadOnlyDictionary<string, Player>, IReadOnlyList<string>)> GetAllRankingPlayers() { Calls.Add("rankings"); return Task.FromResult((Rankings, RankingAnomalies)); }
}

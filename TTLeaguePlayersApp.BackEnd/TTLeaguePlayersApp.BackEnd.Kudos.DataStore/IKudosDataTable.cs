using TTLeaguePlayersApp.BackEnd.Kudos.Lambdas;

namespace TTLeaguePlayersApp.BackEnd.Kudos.DataStore;

public interface IKudosDataTable
{
    Task SaveKudosAsync(Kudos kudos);
    Task<Kudos> RetrieveKudosAsync(string league, string season, string division, string receivingTeam, string homeTeam, string awayTeam, string giverPersonSub);
    Task<KudosSummary> RetrieveSummaryAsync(string league, string season, string division, string receivingTeam, string homeTeam, string awayTeam);
    Task DeleteKudosAsync(string league, string season, string division, string receivingTeam, string homeTeam, string awayTeam, string giverPersonSub);
    Task<List<Kudos>> RetrieveKudosGivenByPlayerAsync(string league, string season, string giverPersonSub, string division, string giverTeam);
    Task<List<KudosSummary>> RetrieveKudosAwardedToTeamAsync(string league, string season, string division, string teamName);
    Task<List<KudosSummary>> RetrieveKudosAwardedToAllDivisionTeams(string league, string season, string division);
}

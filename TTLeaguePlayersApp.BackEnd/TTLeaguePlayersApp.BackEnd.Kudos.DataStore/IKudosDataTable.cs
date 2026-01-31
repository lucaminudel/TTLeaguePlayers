using System.Threading.Tasks;
using TTLeaguePlayersApp.BackEnd.Kudos.Lambdas;

namespace TTLeaguePlayersApp.BackEnd.Kudos.DataStore;

public interface IKudosDataTable
{
    Task SaveKudosAsync(TTLeaguePlayersApp.BackEnd.Kudos.Lambdas.Kudos kudos);
    Task<TTLeaguePlayersApp.BackEnd.Kudos.Lambdas.Kudos> RetrieveKudosAsync(string league, string season, string division, string receivingTeam, string homeTeam, string awayTeam, string giverPersonSub);
    Task<TTLeaguePlayersApp.BackEnd.Kudos.Lambdas.KudosSummary> RetrieveSummaryAsync(string league, string season, string division, string receivingTeam, string homeTeam, string awayTeam);
}

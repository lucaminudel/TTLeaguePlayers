using Amazon.Lambda.Core;
using TTLeaguePlayersApp.BackEnd.ClubsAndTournaments.DataStore;

namespace TTLeaguePlayersApp.BackEnd.ClubsAndTournaments.Lambdas;

public class RetrieveTournamentLambda
{
    private readonly ILoggerObserver _observer;
    private readonly IClubsAndTournamentsDataTable _dataTable;

    public RetrieveTournamentLambda(ILoggerObserver observer, IClubsAndTournamentsDataTable dataTable)
    {
        _observer = observer;
        _dataTable = dataTable;
    }

    public async Task<Tournament> HandleAsync(string location, string clubName, string tournamentName, ILambdaContext context)
    {
        try
        {
            var tournament = await _dataTable.RetrieveTournamentAsync(location, clubName, tournamentName);

            _observer.OnRuntimeRegularEvent("RETRIEVE TOURNAMENT COMPLETED",
                source: new() { ["Class"] = nameof(RetrieveTournamentLambda), ["Method"] = nameof(HandleAsync) },
                context,
                parameters: new() { ["location"] = location, ["club_name"] = clubName, ["tournament_name"] = tournamentName, ["Found"] = true.ToString() });

            return tournament;
        }
        catch (KeyNotFoundException)
        {
            _observer.OnRuntimeRegularEvent("RETRIEVE TOURNAMENT COMPLETED",
                source: new() { ["Class"] = nameof(RetrieveTournamentLambda), ["Method"] = nameof(HandleAsync) },
                context,
                parameters: new() { ["location"] = location, ["club_name"] = clubName, ["tournament_name"] = tournamentName, ["Found"] = false.ToString() });

            throw;
        }
    }
}

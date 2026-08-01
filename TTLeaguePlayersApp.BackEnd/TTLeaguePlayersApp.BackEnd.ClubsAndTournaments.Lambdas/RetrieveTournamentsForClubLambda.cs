using Amazon.Lambda.Core;
using TTLeaguePlayersApp.BackEnd.ClubsAndTournaments.DataStore;

namespace TTLeaguePlayersApp.BackEnd.ClubsAndTournaments.Lambdas;

public class RetrieveTournamentsForClubLambda
{
    private readonly ILoggerObserver _observer;
    private readonly IClubsAndTournamentsDataTable _dataTable;

    public RetrieveTournamentsForClubLambda(ILoggerObserver observer, IClubsAndTournamentsDataTable dataTable)
    {
        _observer = observer;
        _dataTable = dataTable;
    }

    public async Task<List<TournamentResponse>> HandleAsync(string location, string clubName, ILambdaContext context)
    {
        var tournaments = await _dataTable.RetrieveTournamentsForClubAsync(location, clubName);
        var response = tournaments.Select(RetrieveAllClubsWithTournamentsLambda.MapTournament).ToList();

        _observer.OnRuntimeRegularEvent("RETRIEVE TOURNAMENTS FOR CLUB COMPLETED",
            source: new() { ["Class"] = nameof(RetrieveTournamentsForClubLambda), ["Method"] = nameof(HandleAsync) },
            context,
            parameters: new() { ["location"] = location, ["club_name"] = clubName, ["TournamentsCount"] = response.Count.ToString() });

        return response;
    }
}

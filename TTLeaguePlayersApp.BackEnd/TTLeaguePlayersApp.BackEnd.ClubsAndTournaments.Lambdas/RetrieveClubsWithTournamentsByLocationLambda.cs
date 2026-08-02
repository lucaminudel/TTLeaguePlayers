using Amazon.Lambda.Core;
using TTLeaguePlayersApp.BackEnd.ClubsAndTournaments.DataStore;

namespace TTLeaguePlayersApp.BackEnd.ClubsAndTournaments.Lambdas;

public class RetrieveClubsWithTournamentsByLocationLambda
{
    private readonly ILoggerObserver _observer;
    private readonly IClubsAndTournamentsDataTable _dataTable;

    public RetrieveClubsWithTournamentsByLocationLambda(ILoggerObserver observer, IClubsAndTournamentsDataTable dataTable)
    {
        _observer = observer;
        _dataTable = dataTable;
    }

    public async Task<List<ClubWithTournamentsResponse>> HandleAsync(string location, ILambdaContext context)
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();

        List<(Club Club, List<Tournament> Tournaments)> results;
        try
        {
            results = await _dataTable.RetrieveClubsWithActiveTournamentsByLocationAsync(location, now);
        }
        catch (Exception ex)
        {
            _observer.OnRuntimeError(ex, context, new() { ["location"] = location });
            throw;
        }

        var response = results.Select(RetrieveAllClubsWithTournamentsLambda.MapToResponse).ToList();

        _observer.OnRuntimeRegularEvent("RETRIEVE CLUBS WITH TOURNAMENTS BY LOCATION COMPLETED",
            source: new() { ["Class"] = nameof(RetrieveClubsWithTournamentsByLocationLambda), ["Method"] = nameof(HandleAsync) },
            context,
            parameters: new() { ["location"] = location, ["ClubsCount"] = response.Count.ToString() });

        return response;
    }
}

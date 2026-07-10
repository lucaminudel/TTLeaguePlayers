using Amazon.Lambda.Core;
using TTLeaguePlayersApp.BackEnd.ClubsAndTournaments.DataStore;

namespace TTLeaguePlayersApp.BackEnd.ClubsAndTournaments.Lambdas;

public class RetrieveClubLambda
{
    private readonly ILoggerObserver _observer;
    private readonly IClubsAndTournamentsDataTable _dataTable;

    public RetrieveClubLambda(ILoggerObserver observer, IClubsAndTournamentsDataTable dataTable)
    {
        _observer = observer;
        _dataTable = dataTable;
    }

    public async Task<Club> HandleAsync(string location, string clubName, ILambdaContext context)
    {
        try
        {
            var club = await _dataTable.RetrieveClubAsync(location, clubName);

            _observer.OnRuntimeRegularEvent("RETRIEVE CLUB COMPLETED",
                source: new() { ["Class"] = nameof(RetrieveClubLambda), ["Method"] = nameof(HandleAsync) },
                context,
                parameters: new() { ["location"] = location, ["club_name"] = clubName, ["Found"] = true.ToString() });

            return club;
        }
        catch (KeyNotFoundException)
        {
            _observer.OnRuntimeRegularEvent("RETRIEVE CLUB COMPLETED",
                source: new() { ["Class"] = nameof(RetrieveClubLambda), ["Method"] = nameof(HandleAsync) },
                context,
                parameters: new() { ["location"] = location, ["club_name"] = clubName, ["Found"] = false.ToString() });

            throw;
        }
    }
}

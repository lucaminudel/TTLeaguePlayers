using Amazon.Lambda.Core;
using TTLeaguePlayersApp.BackEnd.ClubsAndTournaments.DataStore;

namespace TTLeaguePlayersApp.BackEnd.ClubsAndTournaments.Lambdas;

public class DeleteClubLambda
{
    private readonly ILoggerObserver _observer;
    private readonly IClubsAndTournamentsDataTable _dataTable;

    public DeleteClubLambda(ILoggerObserver observer, IClubsAndTournamentsDataTable dataTable)
    {
        _observer = observer;
        _dataTable = dataTable;
    }

    public async Task HandleAsync(string location, string clubName, Dictionary<string, string> userClaims, ILambdaContext context)
    {
        try
        {
            ClubManagerSecurityCheck.Validate(location, clubName, userClaims);
        }
        catch (SecurityValidationException ex)
        {
            _observer.OnSecurityError(ex, context, new() { ["location"] = location, ["club_name"] = clubName }, userClaims);
        }

        await _dataTable.DeleteClubAsync(location, clubName);

        _observer.OnRuntimeRegularEvent("DELETE CLUB COMPLETED",
            source: new() { ["Class"] = nameof(DeleteClubLambda), ["Method"] = nameof(HandleAsync) },
            context,
            parameters: new() { ["location"] = location, ["club_name"] = clubName });
    }
}

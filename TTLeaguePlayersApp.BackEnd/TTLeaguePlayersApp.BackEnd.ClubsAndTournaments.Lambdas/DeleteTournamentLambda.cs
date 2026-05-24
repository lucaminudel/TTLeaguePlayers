using Amazon.Lambda.Core;
using TTLeaguePlayersApp.BackEnd.ClubsAndTournaments.DataStore;

namespace TTLeaguePlayersApp.BackEnd.ClubsAndTournaments.Lambdas;

public class DeleteTournamentLambda
{
    private readonly ILoggerObserver _observer;
    private readonly IClubsAndTournamentsDataTable _dataTable;

    public DeleteTournamentLambda(ILoggerObserver observer, IClubsAndTournamentsDataTable dataTable)
    {
        _observer = observer;
        _dataTable = dataTable;
    }

    public async Task HandleAsync(string location, string clubName, string tournamentName, Dictionary<string, string> userClaims, ILambdaContext context)
    {
        try
        {
            ClubManagerSecurityCheck.Validate(location, clubName, userClaims);
        }
        catch (SecurityValidationException ex)
        {
            _observer.OnSecurityError(ex, context, new() { ["location"] = location, ["club_name"] = clubName, ["tournament_name"] = tournamentName }, userClaims);
        }

        await _dataTable.DeleteTournamentAsync(location, clubName, tournamentName);

        _observer.OnRuntimeRegularEvent("DELETE TOURNAMENT COMPLETED",
            source: new() { ["Class"] = nameof(DeleteTournamentLambda), ["Method"] = nameof(HandleAsync) },
            context,
            parameters: new() { ["location"] = location, ["club_name"] = clubName, ["tournament_name"] = tournamentName });
    }
}

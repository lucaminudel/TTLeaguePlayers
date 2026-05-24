using Amazon.Lambda.Core;
using System.Text.Json;
using TTLeaguePlayersApp.BackEnd.ClubsAndTournaments.DataStore;

namespace TTLeaguePlayersApp.BackEnd.ClubsAndTournaments.Lambdas;

public class UpsertTournamentLambda
{
    private readonly ILoggerObserver _observer;
    private readonly IClubsAndTournamentsDataTable _dataTable;

    public UpsertTournamentLambda(ILoggerObserver observer, IClubsAndTournamentsDataTable dataTable)
    {
        _observer = observer;
        _dataTable = dataTable;
    }

    public async Task HandleAsync(string location, string clubName, string tournamentName, UpsertTournamentRequest request, Dictionary<string, string> userClaims, ILambdaContext context)
    {
        try
        {
            ClubManagerSecurityCheck.Validate(location, clubName, userClaims);
        }
        catch (SecurityValidationException ex)
        {
            _observer.OnSecurityError(ex, context, new() { ["location"] = location, ["club_name"] = clubName, ["tournament_name"] = tournamentName }, userClaims);
        }

        ValidateRequest(request);

        var tournament = new Tournament
        {
            Location       = location,
            ClubName       = clubName,
            TournamentName = tournamentName,
            TournamentInfo = new Uri(request.TournamentInfo),
            Instagram      = request.Instagram != null ? new Uri(request.Instagram) : null,
            Facebook       = request.Facebook  != null ? new Uri(request.Facebook)  : null,
            StartDate      = request.StartDate,
            EndDate        = request.EndDate,
        };

        try
        {
            await _dataTable.UpsertTournamentAsync(tournament);
        }
        catch (Exception ex)
        {
            _observer.OnRuntimeError(ex, context, new() { 
                ["location"] = location, 
                ["club_name"] = clubName,
                ["tournament_name"] = tournamentName,
                ["RequestBody"] = JsonSerializer.Serialize(request)
            }, userClaims);
            throw;
        }

        _observer.OnRuntimeRegularEvent("CREATE/UPDATE TOURNAMENT COMPLETED",
            source: new() { ["Class"] = nameof(UpsertTournamentLambda), ["Method"] = nameof(HandleAsync) },
            context,
            parameters: new() { ["location"] = location, ["club_name"] = clubName, ["tournament_name"] = tournamentName });
    }

    private static void ValidateRequest(UpsertTournamentRequest request)
    {
        var errors = new List<string>();

        if (!IsValidAbsoluteUri(request.TournamentInfo))
            errors.Add($"{JsonFieldName.For<UpsertTournamentRequest>(nameof(request.TournamentInfo))} must be a valid absolute URI");
        if (request.Instagram != null && !IsValidAbsoluteUri(request.Instagram))
            errors.Add($"{JsonFieldName.For<UpsertTournamentRequest>(nameof(request.Instagram))} must be a valid absolute URI");
        if (request.Facebook != null && !IsValidAbsoluteUri(request.Facebook))
            errors.Add($"{JsonFieldName.For<UpsertTournamentRequest>(nameof(request.Facebook))} must be a valid absolute URI");

        if (errors.Count > 0) throw new ValidationException(errors);
    }

    private static bool IsValidAbsoluteUri(string? value)
        => !string.IsNullOrWhiteSpace(value) && Uri.TryCreate(value, UriKind.Absolute, out _);
}

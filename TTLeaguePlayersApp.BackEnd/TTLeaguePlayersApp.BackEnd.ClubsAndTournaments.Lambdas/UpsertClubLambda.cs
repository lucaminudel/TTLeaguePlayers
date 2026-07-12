using Amazon.Lambda.Core;
using System.Text.Json;
using TTLeaguePlayersApp.BackEnd.ClubsAndTournaments.DataStore;

namespace TTLeaguePlayersApp.BackEnd.ClubsAndTournaments.Lambdas;

public class UpsertClubLambda
{
    private readonly ILoggerObserver _observer;
    private readonly IClubsAndTournamentsDataTable _dataTable;

    public UpsertClubLambda(ILoggerObserver observer, IClubsAndTournamentsDataTable dataTable)
    {
        _observer = observer;
        _dataTable = dataTable;
    }

    public async Task<Club> HandleAsync(string location, string clubName, UpsertClubRequest request, Dictionary<string, string> userClaims, ILambdaContext context)
    {
        try
        {
            ClubManagerSecurityCheck.Validate(location, clubName, userClaims);
        }
        catch (SecurityValidationException ex)
        {
            _observer.OnSecurityError(ex, context, new() { ["location"] = location, ["club_name"] = clubName }, userClaims);
        }

        ValidateRequest(request);

        var club = new Club
        {
            Location  = location,
            ClubName  = clubName,
            Homepage  = new Uri(request.Homepage),
            Instagram = request.Instagram != null ? new Uri(request.Instagram) : null,
            Facebook  = request.Facebook  != null ? new Uri(request.Facebook)  : null,
            Youtube   = request.Youtube   != null ? new Uri(request.Youtube)   : null,
        };

        try
        {
            await _dataTable.UpsertClubAsync(club);
        }
        catch (Exception ex)
        {
            _observer.OnRuntimeError(ex, context, new() { 
                ["location"] = location, 
                ["club_name"] = clubName,
                ["RequestBody"] = JsonSerializer.Serialize(request)
            }, userClaims);
            throw;
        }

        _observer.OnRuntimeRegularEvent("CREATE/UPDATE CLUB COMPLETED",
            source: new() { ["Class"] = nameof(UpsertClubLambda), ["Method"] = nameof(HandleAsync) },
            context,
            parameters: new() { ["location"] = location, ["club_name"] = clubName });

        return club;
    }

    private static void ValidateRequest(UpsertClubRequest request)
    {
        var errors = new List<string>();

        if (!IsValidAbsoluteUri(request.Homepage))
            errors.Add($"{JsonFieldName.For<UpsertClubRequest>(nameof(request.Homepage))} must be a valid absolute URI");
        if (request.Instagram != null && !IsValidAbsoluteUri(request.Instagram))
            errors.Add($"{JsonFieldName.For<UpsertClubRequest>(nameof(request.Instagram))} must be a valid absolute URI");
        if (request.Facebook != null && !IsValidAbsoluteUri(request.Facebook))
            errors.Add($"{JsonFieldName.For<UpsertClubRequest>(nameof(request.Facebook))} must be a valid absolute URI");
        if (request.Youtube != null && !IsValidAbsoluteUri(request.Youtube))
            errors.Add($"{JsonFieldName.For<UpsertClubRequest>(nameof(request.Youtube))} must be a valid absolute URI");

        if (errors.Count > 0) throw new ValidationException(errors);
    }

    private static bool IsValidAbsoluteUri(string? value)
        => !string.IsNullOrWhiteSpace(value) && Uri.TryCreate(value, UriKind.Absolute, out _);
}

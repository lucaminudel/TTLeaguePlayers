using Amazon.Lambda.Core;
using TTLeaguePlayersApp.BackEnd.ClubsAndTournaments.DataStore;

namespace TTLeaguePlayersApp.BackEnd.ClubsAndTournaments.Lambdas;

public class RetrieveAllClubsWithTournamentsLambda
{
    private readonly ILoggerObserver _observer;
    private readonly IClubsAndTournamentsDataTable _dataTable;

    public RetrieveAllClubsWithTournamentsLambda(ILoggerObserver observer, IClubsAndTournamentsDataTable dataTable)
    {
        _observer = observer;
        _dataTable = dataTable;
    }

    public async Task<List<ClubWithTournamentsResponse>> HandleAsync(ILambdaContext context)
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();

        List<(ClubListing Club, List<Tournament> Tournaments)> results;
        try
        {
            results = await _dataTable.RetrieveAllClubsWithActiveTournamentsAsync(now);
        }
        catch (Exception ex)
        {
            _observer.OnRuntimeError(ex, context);
            throw;
        }

        var response = results.Select(MapToResponse).ToList();

        _observer.OnRuntimeRegularEvent("RETRIEVE ALL CLUBS WITH TOURNAMENTS COMPLETED",
            source: new() { ["Class"] = nameof(RetrieveAllClubsWithTournamentsLambda), ["Method"] = nameof(HandleAsync) },
            context,
            parameters: new() { ["ClubsCount"] = response.Count.ToString() });

        return response;
    }

    internal static ClubWithTournamentsResponse MapToResponse((ClubListing Club, List<Tournament> Tournaments) entry) =>
        new()
        {
            Location   = entry.Club.Location,
            ClubName   = entry.Club.ClubName,
            Homepage   = entry.Club.Homepage,
            Instagram  = entry.Club.Instagram,
            Facebook   = entry.Club.Facebook,
            Youtube    = entry.Club.Youtube,
            Tournaments = entry.Tournaments.Select(MapTournament).ToList()
        };

    internal static TournamentResponse MapTournament(Tournament t) =>
        new()
        {
            TournamentName = t.TournamentName,
            TournamentInfo = t.TournamentInfo,
            Instagram      = t.Instagram,
            Facebook       = t.Facebook,
            StartDate      = t.StartDate,
            EndDate        = t.EndDate,
        };
}

using Amazon.Lambda.Core;
using TTLeaguePlayersApp.BackEnd.Kudos.DataStore;

namespace TTLeaguePlayersApp.BackEnd.Kudos.Lambdas;

public class RetrieveKudosStandingsLambda
{
    private readonly ILoggerObserver _observer;
    private readonly IKudosDataTable _kudosDataTable;

    public RetrieveKudosStandingsLambda(ILoggerObserver observer, IKudosDataTable kudosDataTable)
    {
        _observer = observer;
        _kudosDataTable = kudosDataTable;
    }

    public async Task<KudosStandingsResponse> HandleAsync(RetrieveKudosStandingsRequest request, ILambdaContext context)
    {
        List<KudosSummary> summaries;
        try
        {
            summaries = await _kudosDataTable.RetrieveKudosAwardedToAllDivisionTeams(
                request.League,
                request.Season,
                request.TeamDivision
            );
        }
        catch (Exception ex)
        {
            _observer.OnRuntimeError(ex, context, new() { 
                    ["League"] = request.League,
                    ["Season"] = request.Season,
                    ["Division"] = request.TeamDivision
                });

            throw;
        }

        var positiveEntries = new List<KudosStandingsEntry>();
        var negativeEntries = new List<KudosStandingsEntry>();

        string? currentTeam = null;
        KudosStandingsEntry? posEntry = null;
        KudosStandingsEntry? negEntry = null;

        // The following code is based on the assumption that summaries are ordered by receiving team name ascending
        // as retured by the data store query. 
        foreach (var matchSummary in summaries)
        {
            if (matchSummary.ReceivingTeam != currentTeam)
            {
                currentTeam = matchSummary.ReceivingTeam;
                posEntry = new KudosStandingsEntry { TeamName = currentTeam, Count = 0 };
                negEntry = new KudosStandingsEntry { TeamName = currentTeam, Count = 0 };
                positiveEntries.Add(posEntry);
                negativeEntries.Add(negEntry);
            }

            if (matchSummary.PositiveKudosCount >= 1) posEntry!.Count++;
            if (matchSummary.NegativeKudosCount >= 1) negEntry!.Count++;
        }

        var response = new KudosStandingsResponse
        {
            // Order by count descending. Stable sort preserves the existing team-name order for ties.
            PositiveKudosTable = positiveEntries.Where(e => e.Count > 0).OrderByDescending(e => e.Count).ToList(),
            NegativeKudosTable = negativeEntries.Where(e => e.Count > 0).OrderByDescending(e => e.Count).ToList()
        };

        _observer.OnRuntimeRegularEvent("RETRIEVE KUDOS STANDINGS COMPLETED",
            source: new() { ["Class"] = nameof(RetrieveKudosStandingsLambda), ["Method"] = nameof(HandleAsync) },
            context,
            parameters: new() { 
                ["League"] = request.League,
                ["Division"] = request.TeamDivision,
                ["TeamsCount"] = positiveEntries.Count.ToString()
            });

        return response;
    }
}

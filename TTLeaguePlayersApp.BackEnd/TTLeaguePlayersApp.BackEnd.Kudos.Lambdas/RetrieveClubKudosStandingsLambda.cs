using Amazon.Lambda.Core;
using TTLeaguePlayersApp.BackEnd.ClubsAndTournaments.Lambdas;
using TTLeaguePlayersApp.BackEnd.Kudos.DataStore;

namespace TTLeaguePlayersApp.BackEnd.Kudos.Lambdas;

public class RetrieveClubKudosStandingsLambda
{
    private readonly ILoggerObserver _observer;
    private readonly IKudosDataTable _kudosDataTable;

    public RetrieveClubKudosStandingsLambda(ILoggerObserver observer, IKudosDataTable kudosDataTable)
    {
        _observer = observer;
        _kudosDataTable = kudosDataTable;
    }

    public async Task<ClubKudosStandingsResponse> HandleAsync(
        ClubKudosStandingsRequest request, Dictionary<string, string> userClaims, ILambdaContext context)
    {
        // ADVISORY, exactly as POST /invites/registrations does it: the failure is logged and the
        // request continues to a normal 200. Do not turn this into a 403 without deciding the same
        // for every other endpoint in the codebase — see the plan's decision 7.
        // Season-scoped: standings are season data, so managing this club in a DIFFERENT season
        // must not count.
        try
        {
            ClubManagerSecurityCheck.Validate(
                request.ClubLocation, request.ClubName, request.League, request.Season, userClaims);
        }
        catch (SecurityValidationException ex)
        {
            _observer.OnSecurityError(ex, context, new()
            {
                ["location"] = request.ClubLocation,
                ["club_name"] = request.ClubName,
                ["league"] = request.League,
                ["season"] = request.Season
            }, userClaims);
        }

        ValidateRequest(request);

        var requestedCouples = request.Teams
            .Select(team => (Division: team.TeamDivision, TeamName: team.TeamName))
            .ToList();

        List<KudosSummary> summaries;
        try
        {
            summaries = await _kudosDataTable.RetrieveKudosAwardedToClubTeams(
                request.League, request.Season, requestedCouples);
        }
        catch (Exception ex)
        {
            _observer.OnRuntimeError(ex, context, new()
            {
                ["league"] = request.League,
                ["season"] = request.Season,
                ["club_name"] = request.ClubName,
                ["teams_requested"] = request.Teams.Count.ToString()
            }, userClaims);
            throw;
        }

        var response = new ClubKudosStandingsResponse
        {
            League = request.League,
            Season = request.Season,
            ClubName = request.ClubName,
            ClubLocation = request.ClubLocation,
            Teams = BuildEntries(request, summaries)
        };

        _observer.OnRuntimeRegularEvent("GET CLUB KUDOS STANDINGS COMPLETED",
            source: new() { ["Class"] = nameof(RetrieveClubKudosStandingsLambda), ["Method"] = nameof(HandleAsync) },
            context,
            parameters: new()
            {
                ["league"] = request.League,
                ["season"] = request.Season,
                ["club_name"] = request.ClubName,
                ["teams_requested"] = request.Teams.Count.ToString(),
                ["summaries_found"] = summaries.Count.ToString()
            });

        return response;
    }

    private static List<ClubKudosStandingsEntry> BuildEntries(
        ClubKudosStandingsRequest request, List<KudosSummary> summaries)
    {
        // Grouped EXPLICITLY by receiving team, not accumulated in a single pass the way
        // RetrieveKudosStandingsLambda does. That lambda relies on its summaries arriving sorted by
        // team name; these arrive as the concatenation of one query per team, each descending by
        // match date, and nothing promises the teams stay contiguous.
        var summariesByTeam = summaries
            .GroupBy(summary => summary.ReceivingTeam, StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => group.ToList(), StringComparer.Ordinal);

        var entries = new List<ClubKudosStandingsEntry>(request.Teams.Count);

        // Seeded from the REQUEST, in the caller's order — a left join, not a filter. A team that
        // was never rated has no summaries at all, so a response built from the query results alone
        // could never contain it. This is also what gives the page its club-page ordering for free.
        foreach (var team in request.Teams)
        {
            if (!summariesByTeam.TryGetValue(team.TeamName, out var teamSummaries))
            {
                entries.Add(new ClubKudosStandingsEntry
                {
                    TeamName = team.TeamName,
                    PositiveCount = 0,
                    NeutralCount = 0,
                    NegativeCount = 0
                });
                continue;
            }

            // MATCH TALLIES: one match contributes 1 to a counter when the team received at least
            // one kudos of that kind in it, however many were given. Not a sum of kudos.
            entries.Add(new ClubKudosStandingsEntry
            {
                TeamName = team.TeamName,
                PositiveCount = teamSummaries.Count(summary => summary.PositiveKudosCount >= 1),
                NeutralCount = teamSummaries.Count(summary => summary.NeutralKudosCount >= 1),
                NegativeCount = teamSummaries.Count(summary => summary.NegativeKudosCount >= 1)
            });
        }

        return entries;
    }

    private static void ValidateRequest(ClubKudosStandingsRequest request)
    {
        var errors = new List<string>();

        if (string.IsNullOrWhiteSpace(request.League))
            errors.Add($"{JsonFieldName.For<ClubKudosStandingsRequest>(nameof(request.League))} is required");
        if (string.IsNullOrWhiteSpace(request.Season))
            errors.Add($"{JsonFieldName.For<ClubKudosStandingsRequest>(nameof(request.Season))} is required");
        if (string.IsNullOrWhiteSpace(request.ClubName))
            errors.Add($"{JsonFieldName.For<ClubKudosStandingsRequest>(nameof(request.ClubName))} is required");
        if (string.IsNullOrWhiteSpace(request.ClubLocation))
            errors.Add($"{JsonFieldName.For<ClubKudosStandingsRequest>(nameof(request.ClubLocation))} is required");

        if (request.Teams is null || request.Teams.Count == 0)
        {
            errors.Add($"{JsonFieldName.For<ClubKudosStandingsRequest>(nameof(request.Teams))} must contain at least one team");
        }
        else
        {
            if (request.Teams.Any(team => string.IsNullOrWhiteSpace(team.TeamName)))
                errors.Add($"{JsonFieldName.For<ClubKudosStandingsRequest>(nameof(request.Teams))} must not contain empty team names");
            if (request.Teams.Any(team => string.IsNullOrWhiteSpace(team.TeamDivision)))
                errors.Add($"{JsonFieldName.For<ClubKudosStandingsRequest>(nameof(request.Teams))} must not contain empty team divisions");
        }

        if (errors.Count > 0) throw new ValidationException(errors);
    }
}

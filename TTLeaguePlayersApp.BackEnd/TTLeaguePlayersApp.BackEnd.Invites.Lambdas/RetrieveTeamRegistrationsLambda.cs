using Amazon.Lambda.Core;
using TTLeaguePlayersApp.BackEnd.ClubsAndTournaments.Lambdas;
using TTLeaguePlayersApp.BackEnd.Invites.DataStore;

namespace TTLeaguePlayersApp.BackEnd.Invites.Lambdas;

public class RetrieveTeamRegistrationsLambda
{
    private readonly ILoggerObserver _observer;
    private readonly IInvitesDataTable _invitesDataTable;

    public RetrieveTeamRegistrationsLambda(ILoggerObserver observer, IInvitesDataTable invitesDataTable)
    {
        _observer = observer;
        _invitesDataTable = invitesDataTable;
    }

    public async Task<TeamRegistrationsResponse> HandleAsync(
        TeamRegistrationsRequest request, Dictionary<string, string> userClaims, ILambdaContext context)
    {
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

        List<CaptainInviteSummary> invites;
        try
        {
            invites = await _invitesDataTable.RetrieveCaptainInvitesForTeams(
                request.League, request.Season, request.TeamNames);
        }
        catch (Exception ex)
        {
            _observer.OnRuntimeError(ex, context, new()
            {
                ["league"] = request.League,
                ["season"] = request.Season,
                ["club_name"] = request.ClubName,
                ["teams_requested"] = request.TeamNames.Count.ToString()
            }, userClaims);
            throw;
        }

        var response = new TeamRegistrationsResponse
        {
            League = request.League,
            Season = request.Season,
            ClubName = request.ClubName,
            ClubLocation = request.ClubLocation,
            Teams = BuildEntries(request, invites, userClaims, context)
        };

        _observer.OnRuntimeRegularEvent("GET TEAM REGISTRATIONS COMPLETED",
            source: new() { ["Class"] = nameof(RetrieveTeamRegistrationsLambda), ["Method"] = nameof(HandleAsync) },
            context,
            parameters: new()
            {
                ["league"] = request.League,
                ["season"] = request.Season,
                ["club_name"] = request.ClubName,
                ["teams_requested"] = request.TeamNames.Count.ToString(),
                ["invites_found"] = invites.Count.ToString()
            });

        return response;
    }

    private List<TeamRegistrationEntry> BuildEntries(
        TeamRegistrationsRequest request,
        List<CaptainInviteSummary> invites,
        Dictionary<string, string> userClaims,
        ILambdaContext context)
    {
        // Case-insensitive and whitespace-trimmed, matching the datastore's own rule — see
        // IInvitesDataTable.RetrieveCaptainInvitesForTeams. Keep the two in step: a stricter lookup
        // here would silently drop invites the datastore had already found.
        var invitesByTeam = invites
            .GroupBy(invite => invite.InviteeTeam.Trim(), StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.ToList(), StringComparer.OrdinalIgnoreCase);

        var entries = new List<TeamRegistrationEntry>(request.TeamNames.Count);

        foreach (var teamName in request.TeamNames)
        {
            // Looked up trimmed, but the ENTRY still echoes the caller's own spelling below, so the
            // page can join the response back to the team list it sent.
            if (!invitesByTeam.TryGetValue(teamName.Trim(), out var teamInvites) || teamInvites.Count == 0)
            {
                entries.Add(new TeamRegistrationEntry
                {
                    TeamName = teamName,
                    Status = TeamRegistrationStatus.NOT_INVITED
                });
                continue;
            }

            if (teamInvites.Count > 1)
            {
                // The stored data is inconsistent: a team should have at most one captain invite.
                _observer.OnRuntimeIrregularEvent("DUPLICATE CAPTAIN INVITES FOR TEAM",
                    source: new() { ["Class"] = nameof(RetrieveTeamRegistrationsLambda), ["Method"] = nameof(BuildEntries) },
                    context,
                    parameters: new()
                    {
                        ["league"] = request.League,
                        ["season"] = request.Season,
                        ["team_name"] = teamName,
                        ["invites_count"] = teamInvites.Count.ToString(),
                        ["nano_ids"] = string.Join(",", teamInvites.Select(i => i.NanoId).OrderBy(id => id, StringComparer.Ordinal))
                    }, userClaims);
            }

            // Prefer an accepted invite; among equals, the most recently created. Sorted explicitly
            // because neither the datastore nor the fake promises an order.
            var invite = teamInvites
                .OrderByDescending(i => i.AcceptedAt.HasValue)
                .ThenByDescending(i => i.CreatedAt)
                .First();

            entries.Add(new TeamRegistrationEntry
            {
                TeamName = teamName,          // the caller's spelling, not the stored one
                Status = invite.AcceptedAt.HasValue
                    ? TeamRegistrationStatus.ACCEPTED
                    : TeamRegistrationStatus.PENDING,
                NanoId = invite.NanoId,
                InviteeName = invite.InviteeName,
                InviteeEmailId = invite.InviteeEmailId,
                CreatedAt = invite.CreatedAt,
                AcceptedAt = invite.AcceptedAt
            });
        }

        return entries;
    }

    private static void ValidateRequest(TeamRegistrationsRequest request)
    {
        var errors = new List<string>();

        if (string.IsNullOrWhiteSpace(request.League))
            errors.Add($"{JsonFieldName.For<TeamRegistrationsRequest>(nameof(request.League))} is required");
        if (string.IsNullOrWhiteSpace(request.Season))
            errors.Add($"{JsonFieldName.For<TeamRegistrationsRequest>(nameof(request.Season))} is required");
        if (string.IsNullOrWhiteSpace(request.ClubName))
            errors.Add($"{JsonFieldName.For<TeamRegistrationsRequest>(nameof(request.ClubName))} is required");
        if (string.IsNullOrWhiteSpace(request.ClubLocation))
            errors.Add($"{JsonFieldName.For<TeamRegistrationsRequest>(nameof(request.ClubLocation))} is required");

        if (request.TeamNames is null || request.TeamNames.Count == 0)
        {
            errors.Add($"{JsonFieldName.For<TeamRegistrationsRequest>(nameof(request.TeamNames))} must contain at least one team name");
        }
        else if (request.TeamNames.Any(string.IsNullOrWhiteSpace))
        {
            errors.Add($"{JsonFieldName.For<TeamRegistrationsRequest>(nameof(request.TeamNames))} must not contain empty team names");
        }

        if (errors.Count > 0) throw new ValidationException(errors);
    }
}

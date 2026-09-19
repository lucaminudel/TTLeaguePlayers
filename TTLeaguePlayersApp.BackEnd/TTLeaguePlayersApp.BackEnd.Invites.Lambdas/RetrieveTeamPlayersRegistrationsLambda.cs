using Amazon.Lambda.Core;
using TTLeaguePlayersApp.BackEnd.Invites.DataStore;

namespace TTLeaguePlayersApp.BackEnd.Invites.Lambdas;

public class RetrieveTeamPlayersRegistrationsLambda
{
    private readonly ILoggerObserver _observer;
    private readonly IInvitesDataTable _invitesDataTable;

    public RetrieveTeamPlayersRegistrationsLambda(ILoggerObserver observer, IInvitesDataTable invitesDataTable)
    {
        _observer = observer;
        _invitesDataTable = invitesDataTable;
    }

    public async Task<TeamPlayersRegistrationsResponse> HandleAsync(
        TeamPlayersRegistrationsRequest request, Dictionary<string, string> userClaims, ILambdaContext context)
    {
        try
        {
            TeamCaptainSecurityCheck.Validate(
                request.League, request.Season, request.TeamDivision, request.TeamName, userClaims);
        }
        catch (SecurityValidationException ex)
        {
            _observer.OnSecurityError(ex, context, new()
            {
                ["league"] = request.League,
                ["season"] = request.Season,
                ["team_division"] = request.TeamDivision,
                ["team_name"] = request.TeamName
            }, userClaims);
        }

        ValidateRequest(request);

        List<CaptainOrPlayerInviteSummary> invites;
        try
        {
            invites = await _invitesDataTable.RetrievePlayersInvitesForTeam(
                request.League, request.Season, request.TeamName);
        }
        catch (Exception ex)
        {
            _observer.OnRuntimeError(ex, context, new()
            {
                ["league"] = request.League,
                ["season"] = request.Season,
                ["team_division"] = request.TeamDivision,
                ["team_name"] = request.TeamName,
                ["players_requested"] = request.PlayerNames.Count.ToString()
            }, userClaims);
            throw;
        }

        var players = BuildEntries(request, invites);

        var response = new TeamPlayersRegistrationsResponse
        {
            League = request.League,
            Season = request.Season,
            TeamDivision = request.TeamDivision,
            TeamName = request.TeamName,
            Players = players
        };

        _observer.OnRuntimeRegularEvent("GET TEAM PLAYERS REGISTRATIONS COMPLETED",
            source: new() { ["Class"] = nameof(RetrieveTeamPlayersRegistrationsLambda), ["Method"] = nameof(HandleAsync) },
            context,
            parameters: new()
            {
                ["league"] = request.League,
                ["season"] = request.Season,
                ["team_division"] = request.TeamDivision,
                ["team_name"] = request.TeamName,
                ["players_requested"] = request.PlayerNames.Count.ToString(),
                ["invites_found"] = invites.Count.ToString(),
                ["extras"] = (players.Count - request.PlayerNames.Count).ToString()
            });

        return response;
    }

    // The full outer join described on TeamPlayersRegistrationsResponse.Players.
    private static List<PlayerRegistrationEntry> BuildEntries(
        TeamPlayersRegistrationsRequest request,
        List<CaptainOrPlayerInviteSummary> invites)
    {
        // Case-insensitive and whitespace-trimmed on the PERSON's name — the same rule the datastore
        // and the club-teams lambda apply to team names. Nothing more forgiving than that: it is not
        // a prefix match, and punctuation still counts.
        var invitesByName = invites
            .GroupBy(invite => invite.InviteeName.Trim(), StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.ToList(), StringComparer.OrdinalIgnoreCase);

        var entries = new List<PlayerRegistrationEntry>(request.PlayerNames.Count);
        var matchedNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        // Left side: one entry per REQUESTED name, in the caller's order.
        foreach (var playerName in request.PlayerNames)
        {
            // Looked up trimmed, but the ENTRY still echoes the caller's own spelling.
            if (!invitesByName.TryGetValue(playerName.Trim(), out var personInvites) || personInvites.Count == 0)
            {
                entries.Add(new PlayerRegistrationEntry
                {
                    PlayerName = playerName,
                    Status = TeamRegistrationStatus.NOT_INVITED
                });
                continue;
            }

            matchedNames.Add(playerName.Trim());
            entries.Add(ToEntry(PickOne(personInvites), playerName));
        }

        var extras = invitesByName
            .Where(group => !matchedNames.Contains(group.Key))
            .Select(group => PickOne(group.Value))
            .OrderBy(invite => invite.CreatedAt)
            .Select(invite => ToEntry(invite, playerName: null));

        entries.AddRange(extras);

        return entries;
    }

    // One invite per person: prefer an accepted one; among equals, the most recently created. Sorted
    // explicitly because the datastore does not promise an order.
    private static CaptainOrPlayerInviteSummary PickOne(List<CaptainOrPlayerInviteSummary> personInvites)
    {
        return personInvites
            .OrderByDescending(i => i.AcceptedAt.HasValue)
            .ThenByDescending(i => i.CreatedAt)
            .First();
    }

    private static PlayerRegistrationEntry ToEntry(CaptainOrPlayerInviteSummary invite, string? playerName)
        => new()
        {
            PlayerName = playerName,      // the caller's spelling, or null on an extra
            Status = invite.AcceptedAt.HasValue
                ? TeamRegistrationStatus.ACCEPTED
                : TeamRegistrationStatus.PENDING,
            InviteeRole = invite.InviteeRole,
            NanoId = invite.NanoId,
            InviteeName = invite.InviteeName,
            InviteeEmailId = invite.InviteeEmailId,
            CreatedAt = invite.CreatedAt,
            AcceptedAt = invite.AcceptedAt
        };

    private static void ValidateRequest(TeamPlayersRegistrationsRequest request)
    {
        var errors = new List<string>();

        if (string.IsNullOrWhiteSpace(request.League))
            errors.Add($"{JsonFieldName.For<TeamPlayersRegistrationsRequest>(nameof(request.League))} is required");
        if (string.IsNullOrWhiteSpace(request.Season))
            errors.Add($"{JsonFieldName.For<TeamPlayersRegistrationsRequest>(nameof(request.Season))} is required");
        if (string.IsNullOrWhiteSpace(request.TeamDivision))
            errors.Add($"{JsonFieldName.For<TeamPlayersRegistrationsRequest>(nameof(request.TeamDivision))} is required");
        if (string.IsNullOrWhiteSpace(request.TeamName))
            errors.Add($"{JsonFieldName.For<TeamPlayersRegistrationsRequest>(nameof(request.TeamName))} is required");

        if (request.PlayerNames is null || request.PlayerNames.Count == 0)
        {
            errors.Add($"{JsonFieldName.For<TeamPlayersRegistrationsRequest>(nameof(request.PlayerNames))} must contain at least one player name");
        }
        else if (request.PlayerNames.Any(string.IsNullOrWhiteSpace))
        {
            errors.Add($"{JsonFieldName.For<TeamPlayersRegistrationsRequest>(nameof(request.PlayerNames))} must not contain empty player names");
        }

        if (errors.Count > 0) throw new ValidationException(errors);
    }
}

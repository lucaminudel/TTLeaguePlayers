using TTLeaguePlayersApp.BackEnd.Invites.DataStore;

namespace TTLeaguePlayersApp.BackEnd.Invites.Lambdas.Tests;

class FakeInvitesDataTable : IInvitesDataTable
{
    public Dictionary<string, Invite> Invites { get; } = new();

    public int MarkInviteAcceptedCalls { get; private set; }

    public Exception? ThrowOnceOnMarkInviteAccepted { get; set; }

    public void Seed(Invite invite) => Invites[invite.NanoId] = invite;

    public Task<Invite> RetrieveInvite(string nanoId)
    {
        if (!Invites.TryGetValue(nanoId, out var invite))
        {
            throw new KeyNotFoundException();
        }

        return Task.FromResult(invite);
    }

    public Task MarkInviteAccepted(string nanoId, long acceptedAt)
    {
        MarkInviteAcceptedCalls++;

        if (ThrowOnceOnMarkInviteAccepted != null)
        {
            var ex = ThrowOnceOnMarkInviteAccepted;
            ThrowOnceOnMarkInviteAccepted = null;
            throw ex;
        }

        if (!Invites.TryGetValue(nanoId, out var invite))
        {
            throw new KeyNotFoundException();
        }

        invite.AcceptedAt = acceptedAt;
        return Task.CompletedTask;
    }

    public Exception? ThrowOnceOnCreateNewInvite { get; set; }

    public Task CreateNewInvite(Invite invite)
    {
        if (ThrowOnceOnCreateNewInvite != null)
        {
            var ex = ThrowOnceOnCreateNewInvite;
            ThrowOnceOnCreateNewInvite = null;
            throw ex;
        }

        Invites[invite.NanoId] = invite;
        return Task.CompletedTask;
    }

    public Task DeleteInvite(string nanoId)
    {
        Invites.Remove(nanoId);
        return Task.CompletedTask;
    }

    public Exception? ThrowOnceOnRetrieveCaptainInvitesForTeams { get; set; }

    public Task<List<CaptainOrPlayerInviteSummary>> RetrieveCaptainInvitesForTeams(
        string league, string season, IReadOnlyList<string> teamNames)
    {
        if (ThrowOnceOnRetrieveCaptainInvitesForTeams != null)
        {
            var ex = ThrowOnceOnRetrieveCaptainInvitesForTeams;
            ThrowOnceOnRetrieveCaptainInvitesForTeams = null;
            throw ex;
        }

        // Mirrors the real guards. A fake that accepted these would let a caller ship a request the
        // live datastore rejects.
        var errors = new List<string>();
        if (string.IsNullOrWhiteSpace(league)) errors.Add($"{JsonFieldName.For<Invite>(nameof(Invite.League))} is required");
        if (string.IsNullOrWhiteSpace(season)) errors.Add($"{JsonFieldName.For<Invite>(nameof(Invite.Season))} is required");
        if (teamNames is null || teamNames.Count == 0)
        {
            errors.Add($"at least one {JsonFieldName.For<CaptainOrPlayerInvite>(nameof(CaptainOrPlayerInvite.InviteeTeam))} is required");
        }
        else if (teamNames.Any(string.IsNullOrWhiteSpace))
        {
            errors.Add($"{JsonFieldName.For<CaptainOrPlayerInvite>(nameof(CaptainOrPlayerInvite.InviteeTeam))} must not be empty");
        }
        if (errors.Count > 0) throw new ValidationException(errors);

        // Must mirror the real matching rule (case-insensitive, surrounding whitespace ignored), or
        // the lambda tests pass against a stricter fake than production and prove nothing.
        var requested = new HashSet<string>(teamNames!.Select(name => name.Trim()), StringComparer.OrdinalIgnoreCase);

        var found = Invites.Values
            .OfType<CaptainOrPlayerInvite>()
            .Where(i => i.League == league
                     && i.Season == season
                     && i.InviteeRole == Role.CAPTAIN
                     && requested.Contains(i.InviteeTeam.Trim()))
            .Select(i => new CaptainOrPlayerInviteSummary
            {
                NanoId = i.NanoId,
                InviteeTeam = i.InviteeTeam,
                InviteeRole = i.InviteeRole,
                InviteeName = i.InviteeName,
                InviteeEmailId = i.InviteeEmailId,
                TeamDivision = i.TeamDivision,
                League = i.League,
                Season = i.Season,
                CreatedAt = i.CreatedAt,
                AcceptedAt = i.AcceptedAt
            })
            .ToList();

        return Task.FromResult(found);
    }

    public Exception? ThrowOnceOnRetrievePlayersInvitesForTeam { get; set; }

    public Task<List<CaptainOrPlayerInviteSummary>> RetrievePlayersInvitesForTeam(string league, string season, string teamName)
    {
        if (ThrowOnceOnRetrievePlayersInvitesForTeam != null)
        {
            var ex = ThrowOnceOnRetrievePlayersInvitesForTeam;
            ThrowOnceOnRetrievePlayersInvitesForTeam = null;
            throw ex;
        }

        // Mirrors the real guards, as above.
        var errors = new List<string>();
        if (string.IsNullOrWhiteSpace(league)) errors.Add($"{JsonFieldName.For<Invite>(nameof(Invite.League))} is required");
        if (string.IsNullOrWhiteSpace(season)) errors.Add($"{JsonFieldName.For<Invite>(nameof(Invite.Season))} is required");
        if (string.IsNullOrWhiteSpace(teamName)) errors.Add($"{JsonFieldName.For<CaptainOrPlayerInvite>(nameof(CaptainOrPlayerInvite.InviteeTeam))} is required");
        if (errors.Count > 0) throw new ValidationException(errors);

        // Mirrors the real rule: CAPTAIN and PLAYER invites of the one team, matched
        // case-insensitively with surrounding whitespace ignored; no name filter.
        var requestedTeam = teamName.Trim();

        var found = Invites.Values
            .OfType<CaptainOrPlayerInvite>()
            .Where(i => i.League == league
                     && i.Season == season
                     && (i.InviteeRole == Role.CAPTAIN || i.InviteeRole == Role.PLAYER)
                     && string.Equals(i.InviteeTeam.Trim(), requestedTeam, StringComparison.OrdinalIgnoreCase))
            .Select(i => new CaptainOrPlayerInviteSummary
            {
                NanoId = i.NanoId,
                InviteeTeam = i.InviteeTeam,
                InviteeRole = i.InviteeRole,
                InviteeName = i.InviteeName,
                InviteeEmailId = i.InviteeEmailId,
                TeamDivision = i.TeamDivision,
                League = i.League,
                Season = i.Season,
                CreatedAt = i.CreatedAt,
                AcceptedAt = i.AcceptedAt
            })
            .ToList();

        return Task.FromResult(found);
    }

    public void Dispose() { }
}

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

    public void Dispose() { }
}

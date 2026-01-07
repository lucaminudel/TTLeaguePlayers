using TTLeaguePlayersApp.BackEnd.Invites.Lambdas;

namespace TTLeaguePlayersApp.BackEnd.Invites.DataStore;

public interface IInvitesDataTable
{
    Task CreateNewInvite(Invite invite);
    Task DeleteInvite(string nanoId);
    void Dispose();
    Task MarkInviteAccepted(string nanoId, long acceptedAt);
    Task<Invite> RetrieveInvite(string nanoId);
}

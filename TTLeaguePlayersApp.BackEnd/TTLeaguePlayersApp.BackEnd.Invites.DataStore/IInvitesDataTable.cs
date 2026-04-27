namespace TTLeaguePlayersApp.BackEnd.Invites.DataStore;

public interface IInvitesDataTable
{
    Task CreateNewInvite(CaptainOrPlayerInvite invite);
    Task DeleteInvite(string nanoId);
    void Dispose();
    Task MarkInviteAccepted(string nanoId, long acceptedAt);
    Task<CaptainOrPlayerInvite> RetrieveInvite(string nanoId);
}

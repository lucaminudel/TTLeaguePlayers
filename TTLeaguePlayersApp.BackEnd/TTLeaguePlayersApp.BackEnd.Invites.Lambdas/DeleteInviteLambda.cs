using Amazon.Lambda.Core;
using TTLeaguePlayersApp.BackEnd.Invites.DataStore;

namespace TTLeaguePlayersApp.BackEnd.Invites.Lambdas;

public class DeleteInviteLambda
{
    private readonly ILoggerObserver _observer;
    private readonly IInvitesDataTable _invitesDataTable;

    public DeleteInviteLambda(ILoggerObserver observer, IInvitesDataTable invitesDataTable)
    {
        _observer = observer;
        _invitesDataTable = invitesDataTable;
    }

    public async Task HandleAsync(string nanoId, ILambdaContext context)
    {
        var parameters = new Dictionary<string, string>() { [nameof(nanoId)] = nanoId };

        ValidateRequest(nanoId);

        Dictionary<string, string> logSource = new() { ["Class"] = nameof(DeleteInviteLambda), ["Method"] = nameof(HandleAsync) };

        await _invitesDataTable.DeleteInvite(nanoId);

        _observer.OnRuntimeRegularEvent("DELETE INVITE COMPLETED",
            source: logSource, context,
            new Dictionary<string, string>() { [nameof(nanoId)] = nanoId, ["Deleted"] = true.ToString() });
    }

    private static void ValidateRequest(string nanoId)
    {
        Invite.ValidateNanoId(nanoId);
    }

}

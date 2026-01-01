using Amazon.Lambda.Core;
using TTLeaguePlayersApp.BackEnd;
using TTLeaguePlayersApp.BackEnd.Invites.DataStore;

namespace TTLeaguePlayersApp.BackEnd.Invites.Lambdas;

public class DeleteInviteLambda
{
    private readonly ILoggerObserver _observer;
    private readonly InvitesDataTable _invitesDataTable;

    public DeleteInviteLambda(ILoggerObserver observer, InvitesDataTable invitesDataTable)
    {
        _observer = observer;
        _invitesDataTable = invitesDataTable;
    }

    public async Task HandleAsync(string nanoId, ILambdaContext context)
    {
        ValidateRequest(nanoId);

        Dictionary<string, string> logSource = new() { ["Class"] = nameof(DeleteInviteLambda), ["Method"] = nameof(HandleAsync) };

        await _invitesDataTable.DeleteInvite(nanoId);

        _observer.OnRuntimeRegularEvent("DELETE INVITE COMPLETED",
            source: logSource, context,
            new Dictionary<string, string>() { [nameof(nanoId)] = nanoId, ["Deleted"] = true.ToString() });
    }

    private static void ValidateRequest(string nanoId)
    {
        var nanoIdJsonName = JsonFieldName.For<Invite>(nameof(nanoId));

        if (string.IsNullOrWhiteSpace(nanoId))
        {
            throw new ValidationException(new List<string> { $"{nanoIdJsonName} is required" });
        }

        if (nanoId.Length != 8)
        {
            throw new ValidationException(new List<string> { $"{nanoIdJsonName} malformed." });
        }
    }
}

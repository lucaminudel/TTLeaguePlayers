using Amazon.Lambda.Core;
using TTLeaguePlayersApp.BackEnd.Invites.DataStore;

namespace TTLeaguePlayersApp.BackEnd.Invites.Lambdas;

public class MarkInviteAcceptedLambda
{
    private readonly ILoggerObserver _observer;
    private readonly InvitesDataTable _invitesDataTable;

    public MarkInviteAcceptedLambda(ILoggerObserver observer, InvitesDataTable invitesDataTable)
    {
        _observer = observer;
        _invitesDataTable = invitesDataTable;
    }

    public async Task<Invite> HandleAsync(string nanoId, long acceptedAt, ILambdaContext context)
    {
        ValidateRequest(nanoId, acceptedAt);

        try
        {
            await _invitesDataTable.MarkInviteAccepted(nanoId, acceptedAt);

            // Retrieve and return the updated invite
            var updatedInvite = await _invitesDataTable.RetrieveInvite(nanoId);

            _observer.OnRuntimeRegularEvent("MARK INVITE ACCEPTED COMPLETED",
                source: new() { ["Class"] = nameof(MarkInviteAcceptedLambda), ["Method"] = nameof(HandleAsync) },
                context, parameters: new() { [nameof(nanoId)] = nanoId, ["AcceptedAt"] = acceptedAt.ToString() });

            return updatedInvite;
        }
        catch (KeyNotFoundException)
        {
            _observer.OnRuntimeRegularEvent("MARK INVITE ACCEPTED COMPLETED",
                source: new() { ["Class"] = nameof(MarkInviteAcceptedLambda), ["Method"] = nameof(HandleAsync) },
                context, parameters: new() { [nameof(nanoId)] = nanoId, ["Found"] = false.ToString() });

            throw new NotFoundException("Invite not found");
        }
    }

    private void ValidateRequest(string nano_id, long acceptedAt)
    {
        if (string.IsNullOrWhiteSpace(nano_id))
        {
            throw new ValidationException(new List<string> { "nano_id is required" });
        }

        if (nano_id.Length != 8)
        {
            throw new ValidationException(new List<string> { "nano_id malformed." });
        }

        if (acceptedAt <= 0)
        {
            throw new ValidationException(new List<string> { "accepted_at must be a positive unix timestamp." });
        }
    }
}

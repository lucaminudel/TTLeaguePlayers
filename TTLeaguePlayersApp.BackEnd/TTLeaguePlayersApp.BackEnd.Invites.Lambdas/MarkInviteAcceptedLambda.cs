using Amazon.Lambda.Core;
using TTLeaguePlayersApp.BackEnd.Invites.DataStore;
using TTLeaguePlayersApp.BackEnd;

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

    private void ValidateRequest(string nanoId, long acceptedAt)
    {
        var nanoIdJsonName = JsonFieldName.For<Invite>(nameof(nanoId));
        var acceptedAtJsonName = JsonFieldName.For<Invite>(nameof(acceptedAt));

        if (string.IsNullOrWhiteSpace(nanoId))
        {
            throw new ValidationException(new List<string> { $"{nanoIdJsonName} is required" });
        }

        if (nanoId.Length != 8)
        {
            throw new ValidationException(new List<string> { $"{nanoIdJsonName} malformed." });
        }

        if (acceptedAt <= 0)
        {
            throw new ValidationException(new List<string> { $"{acceptedAtJsonName} must be a positive unix timestamp." });
        }
    }
}

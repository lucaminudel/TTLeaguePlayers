using System.Text.Json;
using Amazon.Lambda.Core;
using TTLeaguePlayersApp.BackEnd.Invites.DataStore;
using TTLeaguePlayersApp.BackEnd.Cognito;

namespace TTLeaguePlayersApp.BackEnd.Invites.Lambdas;

public partial class AccepteInviteLambda
{
    private readonly ILoggerObserver _observer;
    private readonly IInvitesDataTable _invitesDataTable;
    private readonly CognitoUsers _cognitoUsers;

    private static readonly Dictionary<string, string> _fromHere = 
        new() { ["Class"] = nameof(AccepteInviteLambda), ["Method"] = nameof(HandleAsync) };    

    public AccepteInviteLambda(ILoggerObserver observer, IInvitesDataTable invitesDataTable, CognitoUsers cognitoUsers)
    {
        _observer = observer;
        _invitesDataTable = invitesDataTable;
        _cognitoUsers = cognitoUsers;
    }

    public async Task<Invite> HandleAsync(string nanoId, long acceptedAt, ILambdaContext context)
    {
        var parameters = new Dictionary<string, string>() { [nameof(nanoId)] = nanoId };
        ValidateRequest(nanoId, acceptedAt);

        Invite invite;
        try
        {
            invite = await _invitesDataTable.RetrieveInvite(nanoId);
        }
        catch (KeyNotFoundException)
        {
            _observer.OnRuntimeRegularEvent("ACCEPT INVITE FAILED",
               _fromHere, context, parameters.With("Found", false.ToString()));

            throw new NotFoundException($"Invite not found for {nameof(nanoId)} {nanoId} ");
        }

        var inviteAlreadyAccepted = invite.AcceptedAt.HasValue;
        if (inviteAlreadyAccepted)
        {
            _observer.OnRuntimeRegularEvent("ACCEPT INVITE IDEMPOTENT",
               _fromHere, context, parameters.With("AlreadyAccepted", true.ToString()));

            return invite;
        }

        var user = await _cognitoUsers.RetrieveCognitoUserByEmailId(invite.InviteeEmailId);

        List<ActiveSeason> activeSeasons;
        try
        {
            activeSeasons = CognitoUsers.AddActiveSeason(user, invite.League, invite.Season, invite.InviteeTeam,
                                                          invite.TeamDivision, invite.InviteeName, invite.InviteeRole.ToString());
        }
        catch (JsonException)
        {
            _observer.OnRuntimeIrregularEvent("INVALID CONTENT BODY", _fromHere, context, parameters);

            throw;
        }

        await _cognitoUsers.UpdateUserAttribute(user.Username, activeSeasons);

        try
        {
            await _invitesDataTable.MarkInviteAccepted(nanoId, acceptedAt);
        }
        catch (KeyNotFoundException)
        {
            _observer.OnRuntimeRegularEvent("ACCEPT INVITE FAILED", _fromHere, context, parameters.With("Found", false.ToString()));

            throw new NotFoundException("Invite not found");
        }

        _observer.OnRuntimeRegularEvent("ACCEPT INVITE COMPLETED", _fromHere, context, parameters.With("AcceptedAt", acceptedAt.ToString()));

        invite.AcceptedAt = acceptedAt;
        return invite;

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

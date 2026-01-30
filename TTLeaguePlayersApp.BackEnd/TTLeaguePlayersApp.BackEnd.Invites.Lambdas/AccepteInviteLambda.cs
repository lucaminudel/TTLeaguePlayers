using System.Text.Json;
using Amazon.Lambda.Core;
using Amazon.CognitoIdentityProvider;
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

    public AccepteInviteLambda(ILoggerObserver observer, IInvitesDataTable invitesDataTable, IAmazonCognitoIdentityProvider cognitoClient, string cognitoUserPoolId)
    {
        _observer = observer;
        _invitesDataTable = invitesDataTable;

        _cognitoUsers = new CognitoUsers(observer, cognitoClient, cognitoUserPoolId);
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

        var user = await _cognitoUsers.RetrieveCognitoUserByEmailId(invite.InviteeEmailId, nanoId, context);

        var activeSeasonsAttr = user.Attributes.FirstOrDefault(a => a.Name == "custom:active_seasons");
        var activeSeasons = new List<ActiveSeason>();
        if (activeSeasonsAttr != null && !string.IsNullOrWhiteSpace(activeSeasonsAttr.Value))
        {
            try
            {
                activeSeasons = JsonSerializer.Deserialize<List<ActiveSeason>>(activeSeasonsAttr.Value) ?? new List<ActiveSeason>();
            }
            catch (JsonException)
            {
                _observer.OnRuntimeIrregularEvent("INVALID CONTENT BODY", _fromHere, context, parameters.With("active_seasons", activeSeasonsAttr.Value));

                throw;
            }
        }

        var newActiveSeason = new ActiveSeason
        {
            League = invite.League,
            Season = invite.Season,
            TeamName = invite.InviteeTeam,
            TeamDivision = invite.TeamDivision,
            PersonName = invite.InviteeName,
            Role = invite.InviteeRole.ToString()
        };

        var alreadyPresent = activeSeasons.Any(x =>
            x.League == newActiveSeason.League &&
            x.Season == newActiveSeason.Season &&
            x.TeamName == newActiveSeason.TeamName &&
            x.TeamDivision == newActiveSeason.TeamDivision &&
            x.PersonName == newActiveSeason.PersonName &&
            x.Role == newActiveSeason.Role);

        if (!alreadyPresent)
        {
            activeSeasons.Add(newActiveSeason);
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

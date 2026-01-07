using Amazon.Lambda.Core;
using TTLeaguePlayersApp.BackEnd.Invites.DataStore;
using TTLeaguePlayersApp.BackEnd;
using Amazon.CognitoIdentityProvider;
using Amazon.CognitoIdentityProvider.Model;
using System.Text.Json;

namespace TTLeaguePlayersApp.BackEnd.Invites.Lambdas;

public partial class AccepteInviteLambda
{
    private readonly ILoggerObserver _observer;
    private readonly IInvitesDataTable _invitesDataTable;
    private readonly string _cognitoUserPoolId;
    private readonly IAmazonCognitoIdentityProvider _cognitoClient;

    private static readonly Dictionary<string, string> _fromHere = 
        new() { ["Class"] = nameof(AccepteInviteLambda), ["Method"] = nameof(HandleAsync) };    

    public AccepteInviteLambda(ILoggerObserver observer, IInvitesDataTable invitesDataTable, IAmazonCognitoIdentityProvider cognitoClient, string cognitoUserPoolId)
    {
        _observer = observer;
        _invitesDataTable = invitesDataTable;
        _cognitoClient = cognitoClient;
        _cognitoUserPoolId = cognitoUserPoolId;
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
               _fromHere, context, parameters.With("AlreadyAccepted", true.ToString()) );

            return invite;
        }

        var user = await RetrieveCognitoUserByEmailId(invite.InviteeEmailId, nanoId, context);

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

        var updateAttributesRequest = new AdminUpdateUserAttributesRequest
        {
            UserPoolId = _cognitoUserPoolId,
            Username = user.Username,
            UserAttributes = new () { new () { Name = "custom:active_seasons", Value = JsonSerializer.Serialize(activeSeasons) } }
        };

        await _cognitoClient.AdminUpdateUserAttributesAsync(updateAttributesRequest);

        try
        {
            await _invitesDataTable.MarkInviteAccepted(nanoId, acceptedAt);
        }
        catch (KeyNotFoundException)
        {
            _observer.OnRuntimeRegularEvent("ACCEPT INVITE FAILED", _fromHere, context, parameters.With("Found", false.ToString()));

            throw new NotFoundException("Invite not found");
        }

        _observer.OnRuntimeRegularEvent("ACCEPT INVITE COMPLETED", _fromHere, context, parameters.With("AcceptedAt", acceptedAt.ToString()) );

        invite.AcceptedAt = acceptedAt; 
        return invite;

    }

    private async Task<UserType> RetrieveCognitoUserByEmailId(string inviteeEmailId, string nanoId, ILambdaContext context)
    {
        var listUsersRequest = new ListUsersRequest
        {
            UserPoolId = _cognitoUserPoolId,
            Filter = $"email = \"{inviteeEmailId}\"",
            Limit = 1
        };

        var listUsersResponse = await _cognitoClient.ListUsersAsync(listUsersRequest);
        var user = listUsersResponse.Users.FirstOrDefault();

        if (user == null)
        {
            _observer.OnRuntimeRegularEvent("ACCEPT INVITE USER NOT FOUND",
               source: new() { ["Class"] = nameof(AccepteInviteLambda), ["Method"] = nameof(HandleAsync) },
               context, parameters: new() { [nameof(nanoId)] = nanoId, ["AlreadyAccepted"] = true.ToString() });

            throw new UserNotFoundException($"The provided email is not a registered user. Email: {inviteeEmailId}");
        }

        return user;
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

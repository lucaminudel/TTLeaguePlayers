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
            _observer.OnRuntimeRegularEvent("ACCEPT INVITE COMPLETED",
               _fromHere, context, parameters.With("Found", false.ToString()));

            throw new KeyNotFoundException($"Invite not found for {nameof(nanoId)} {nanoId} ");
        }

        var inviteAlreadyAccepted = invite.AcceptedAt.HasValue;
        if (inviteAlreadyAccepted)
        {
            _observer.OnRuntimeRegularEvent("ACCEPT INVITE COMPLETED",
               _fromHere, context, parameters.With("AlreadyAccepted", true.ToString()));

            return invite;
        }

        var user = await _cognitoUsers.RetrieveCognitoUserByEmailId(invite.InviteeEmailId);

        if (invite is CaptainOrPlayerInvite captainOrPlayerInvite)
        {
            List<ActiveSeason> activeSeasons;
            try
            {
                activeSeasons = CognitoUsers.AddActiveSeason(user, invite.League, invite.Season, captainOrPlayerInvite.InviteeTeam,
                                                              captainOrPlayerInvite.TeamDivision, invite.InviteeName, invite.InviteeRole.ToString());
            }
            catch (InvalidOperationException ex)
            {
                _observer.OnRuntimeError(ex, context, parameters);

                throw;
            }

            await _cognitoUsers.UpdateActiveSeasonsUserAttribute(user.Username, activeSeasons);
        }
        else if (invite is ClubManagerInvite clubManagerInvite)
        {
            List<ManagedClub> managedClubs;
            try
            {
                managedClubs = CognitoUsers.AddManagedClub(user, invite.League, invite.Season, clubManagerInvite.InviteeClub, clubManagerInvite.ClubLocation, invite.InviteeName);
            }
            catch (InvalidOperationException ex)
            {
                _observer.OnRuntimeError(ex, context, parameters);

                throw;
            }

            await _cognitoUsers.UpdateManagedClubsUserAttribute(user.Username, managedClubs);
        }
        else
        {
            throw new InvalidOperationException($"Unknown invite type {invite.GetType().Name} for invite with {nameof(nanoId)} {nanoId}");
        }
        

        try
        {
            await _invitesDataTable.MarkInviteAccepted(nanoId, acceptedAt);
        }
        catch (KeyNotFoundException)
        {
            _observer.OnRuntimeRegularEvent("ACCEPT INVITE COMPLETED", _fromHere, context, parameters.With("Found", false.ToString()));

            throw new KeyNotFoundException("Invite not found");
        }

        _observer.OnRuntimeRegularEvent("ACCEPT INVITE COMPLETED", _fromHere, context, parameters.With("AcceptedAt", acceptedAt.ToString()));

        invite.AcceptedAt = acceptedAt;
        return invite;

    }


    private void ValidateRequest(string nanoId, long acceptedAt)
    {
        Invite.ValidateNanoId(nanoId);

        Invite.ValidateAcceptedAt(acceptedAt);
    }
}

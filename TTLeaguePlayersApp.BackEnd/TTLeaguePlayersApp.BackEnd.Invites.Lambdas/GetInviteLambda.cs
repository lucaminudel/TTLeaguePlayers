using Amazon.Lambda.Core;
using TTLeaguePlayersApp.BackEnd.Invites.DataStore;
using TTLeaguePlayersApp.BackEnd.Cognito;

namespace TTLeaguePlayersApp.BackEnd.Invites.Lambdas;

public class GetInviteLambda
{
    private readonly ILoggerObserver _observer;
    private readonly IInvitesDataTable _invitesDataTable;
    private readonly CognitoUsers _cognitoUsers;

    public GetInviteLambda(ILoggerObserver observer, IInvitesDataTable invitesDataTable, CognitoUsers cognitoUsers)
    {
        _observer = observer;
        _invitesDataTable = invitesDataTable;
        _cognitoUsers = cognitoUsers;
    }

    public async Task<Invite> HandleAsync(string nanoId, ILambdaContext context)
    {
        ValidateRequest(nanoId);

        try
        {
            var invite = await _invitesDataTable.RetrieveInvite(nanoId);

            var inviteeAlreadyRegistered = await _cognitoUsers.IsUserRegisteredByEmail(invite.InviteeEmailId);
            invite.InviteeAlreadyRegistered = inviteeAlreadyRegistered;
            
            _observer.OnRuntimeRegularEvent("GET INVITE BY ID COMPLETED",
                source: new() { ["Class"] =  nameof(GetInviteLambda), ["Method"] = nameof(HandleAsync) }, 
                context, parameters: new () { [nameof(nanoId)] = nanoId, ["Found"] = true.ToString() } );

            return invite;
        }
        catch (KeyNotFoundException)
        {
            _observer.OnRuntimeRegularEvent("GET INVITE BY ID COMPLETED",
                source: new() { ["Class"] =  nameof(GetInviteLambda), ["Method"] = nameof(HandleAsync) }, 
                context, parameters: new () { [nameof(nanoId)] = nanoId, ["Found"] = false.ToString() } );

            throw new KeyNotFoundException("Invite not found");
        }
    }

    private static void ValidateRequest(string nanoId)
    {
        Invite.ValidateNanoId(nanoId);
    }
}

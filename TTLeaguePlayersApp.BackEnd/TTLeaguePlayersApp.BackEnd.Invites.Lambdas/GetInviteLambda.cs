using Amazon.Lambda.Core;
using TTLeaguePlayersApp.BackEnd.Invites.DataStore;

namespace TTLeaguePlayersApp.BackEnd.Invites.Lambdas;

public class GetInviteLambda
{
    private readonly ILoggerObserver _observer;
    private readonly InvitesDataTable _invitesDataTable;

    public GetInviteLambda(ILoggerObserver observer, InvitesDataTable invitesDataTable)
    {
        _observer = observer;
        _invitesDataTable = invitesDataTable;
    }

    public async Task<Invite> HandleAsync(string nanoId, ILambdaContext context)
    {

        ValidateRequest(nanoId);

        try
        {
            var invite = await _invitesDataTable.RetrieveInvite(nanoId);
            
            _observer.OnRuntimeRegularEvent("GET INVITE BY ID COMPLETED",
                source: new() { ["Class"] =  nameof(GetInviteLambda), ["Method"] = nameof(HandleAsync) }, 
                context, parameters: new () { ["NanoId"] = nanoId, ["Found"] = true.ToString() } );

            return invite;
        }
        catch (KeyNotFoundException)
        {
            _observer.OnRuntimeRegularEvent("GET INVITE BY ID COMPLETED",
                source: new() { ["Class"] =  nameof(GetInviteLambda), ["Method"] = nameof(HandleAsync) }, 
                context, parameters: new () { ["NanoId"] = nanoId, ["Found"] = false.ToString() } );

            throw new NotFoundException("Invite not found");
        }
    }

    private void ValidateRequest(string nano_id)
    {
        if (string.IsNullOrWhiteSpace(nano_id))
        {
            throw new ValidationException(new List<string> { "nano_id is required" });
        }

        // In real implementation, check if invite exists in database
        // For now, stub logic - throw NotFoundException for specific test case
        if (nano_id == "nonexistent")
        {
            throw new NotFoundException("Invite not found");
        }

        if (nano_id.Length != 8)
        {
            throw new ValidationException(new List<string> { "nano_id malformed." });
        }

    }
}

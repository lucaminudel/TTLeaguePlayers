using Amazon.Lambda.Core;
using TTLeaguePlayersApp.BackEnd.Invites.DataStore;
using TTLeaguePlayersApp.BackEnd;

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
                context, parameters: new () { [nameof(nanoId)] = nanoId, ["Found"] = true.ToString() } );

            return invite;
        }
        catch (KeyNotFoundException)
        {
            _observer.OnRuntimeRegularEvent("GET INVITE BY ID COMPLETED",
                source: new() { ["Class"] =  nameof(GetInviteLambda), ["Method"] = nameof(HandleAsync) }, 
                context, parameters: new () { [nameof(nanoId)] = nanoId, ["Found"] = false.ToString() } );

            throw new NotFoundException("Invite not found");
        }
    }

    private void ValidateRequest(string nanoId)
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

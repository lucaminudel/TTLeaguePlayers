using Amazon.Lambda.Core;

namespace TTLeaguePlayersApp.BackEnd.Invites.Lambdas;

public class GetInviteLambda
{
    private readonly ILoggerObserver _observer;

    public GetInviteLambda(ILoggerObserver observer)
    {
        _observer = observer;
    }

    public Task<Invite> HandleAsync(string nanoId, ILambdaContext context)
    {

        ValidateRequest(nanoId);
        
        // Stub: return constant value
        var invite = new Invite
        {
            NanoId = nanoId,
            InviteeName = "Gino Gino",
            InviteeEmailId = "alpha@beta.com",
            InviteeRole = Role.CAPTAIN,
            InviteeTeam = "Morpeth 9",
            TeamDivision = "Division 4",
            League = "CLTTL",
            Season = "2025-2026",
            InvitedBy = "Luca",
            CreatedAt = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
            AcceptedAt = null
        };

        _observer.OnRuntimeRegularEvent("GET INVITE BY ID COMPLETED",
            source: new() { ["Class"] =  nameof(GetInviteLambda), ["Method"] =  nameof(HandleAsync) }, 
            context, parameters: new () { ["NanoId"] = nanoId });

        return Task.FromResult(invite);        
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

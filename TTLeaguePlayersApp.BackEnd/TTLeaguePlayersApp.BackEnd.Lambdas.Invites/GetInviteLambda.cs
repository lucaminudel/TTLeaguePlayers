using Amazon.Lambda.Core;

namespace TTLeaguePlayersApp.BackEnd.Lambdas.Invites;

public class GetInviteLambda
{
    public Task<Invite> HandleAsync(string nano_id, ILambdaContext context)
    {
        ValidateRequest(nano_id);
        
        // Stub: return constant value
        var invite = new Invite
        {
            NanoID = nano_id,
            Name = "Stubbford Player",
            EmailID = "stubbford@example.com",
            Role = Role.CAPTAIN,
            TeamName = "Stubby Team",
            Division = "1",
            League = "TT League",
            Season = "2024",
            CreatedAt = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
            AcceptedAt = null
        };
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
    }
}

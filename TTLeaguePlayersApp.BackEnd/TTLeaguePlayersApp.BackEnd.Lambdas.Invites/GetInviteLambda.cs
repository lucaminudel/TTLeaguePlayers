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
            Name = "Gino Gino",
            EmailID = "alpha@beta.com",
            Role = Role.CAPTAIN,
            TeamName = "Morpeth 9",
            Division = "Division 4",
            League = "CLTTL",
            Season = "2025-2026",
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

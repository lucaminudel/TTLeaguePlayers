using System.Net.Mail;
using Amazon.Lambda.Core;
using NanoidDotNet;

namespace TTLeaguePlayersApp.BackEnd.Lambdas.Invites;

public class CreateInviteLambda
{
    public Task<Invite> HandleAsync(CreateInviteRequest request, ILambdaContext context)
    {
        ValidateRequest(request);
        
        // Stub: return invite based on request
        var invite = new Invite
        {
            NanoID = Nanoid.Generate(size: 8),
            Name = request.Name,
            EmailID = request.EmailID,
            Role = request.Role,
            TeamName = request.TeamName,
            Division = request.Division,
            League = request.League,
            Season = request.Season,
            CreatedAt = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
            AcceptedAt = null
        };
        return Task.FromResult(invite);
    }

    private void ValidateRequest(CreateInviteRequest request)
    {
        var errors = new List<string>();

        if (string.IsNullOrWhiteSpace(request.Name)) errors.Add("name is required");
        if (string.IsNullOrWhiteSpace(request.EmailID)) 
        {
            errors.Add("email_ID is required");
        }
        else if (!IsValidEmail(request.EmailID))
        {
            errors.Add("email_ID must be a valid email address");
        }
        if (!Enum.IsDefined(typeof(Role), request.Role)) errors.Add($"role must be either {nameof(Role.PLAYER)} or {nameof(Role.CAPTAIN)}");
        if (string.IsNullOrWhiteSpace(request.TeamName)) errors.Add("team_name is required");
        if (string.IsNullOrWhiteSpace(request.Division)) errors.Add("division is required");
        if (string.IsNullOrWhiteSpace(request.League)) errors.Add("league is required");
        if (string.IsNullOrWhiteSpace(request.Season)) errors.Add("season is required");

        if (errors.Count > 0)
        {
            throw new ValidationException(errors);
        }
    }

    private bool IsValidEmail(string email)
    {
        try
        {
            var addr = new MailAddress(email);
            return addr.Address == email;
        }
        catch
        {
            return false;
        }
    }
}

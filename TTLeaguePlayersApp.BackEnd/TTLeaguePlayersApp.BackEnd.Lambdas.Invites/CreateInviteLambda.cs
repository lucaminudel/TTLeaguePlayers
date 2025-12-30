using System.Net.Mail;
using Amazon.Lambda.Core;
using NanoidDotNet;

namespace TTLeaguePlayersApp.BackEnd.Lambdas.Invites;

public class CreateInviteLambda
{
    private readonly ILoggerObserver _observer;

    public CreateInviteLambda(ILoggerObserver observer)
    {
        _observer = observer;
    }

    public Task<Invite> HandleAsync(CreateInviteRequest request, ILambdaContext context)
    {

        ValidateRequest(request);
        
        // Stub: return invite based on request
        var invite = new Invite
        {
            NanoId = Nanoid.Generate(size: 8),
            InviteeName = request.InviteeName,
            InviteeEmailId = request.InviteeEmailId!, // validated as not null
            InviteeRole = request.InviteeRole,
            InviteeTeam = request.InviteeTeam,
            TeamDivision = request.TeamDivision,
            League = request.League,
            Season = request.Season,
            InvitedBy = request.InvitedBy,
            CreatedAt = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
            AcceptedAt = null
        };

        _observer.OnBusinessEvent($"CreateInvite Lambda started", context, new Dictionary<string, string> { ["EmailId"] = request.InviteeEmailId ?? "unknown" });

        _observer.OnBusinessEvent($"CreateInvite Lambda completed", context, new Dictionary<string, string> { ["NanoId"] = invite.NanoId, ["EmailId"] = invite.InviteeEmailId });

        _observer.OnRuntimeRegularEvent("CREATE INVITE COMPLETED",
            source: new() { ["Class"] =  nameof(CreateInviteLambda), ["Method"] =  nameof(HandleAsync) }, 
            context, parameters: new () { ["EmailId"] = invite.InviteeEmailId, ["NanoId"] = invite.NanoId } );

        return Task.FromResult(invite);
    }

    private void ValidateRequest(CreateInviteRequest request)
    {
        var errors = new List<string>();

        if (string.IsNullOrWhiteSpace(request.InviteeName)) errors.Add("invitee_name is required");
        if (string.IsNullOrWhiteSpace(request.InviteeEmailId)) 
        {
            errors.Add("invitee_email_id is required");
        }
        else if (!IsValidEmail(request.InviteeEmailId))
        {
            errors.Add("invitee_email_id must be a valid email address");
        }
        if (!Enum.IsDefined(typeof(Role), request.InviteeRole)) errors.Add($"invitee_role must be either {nameof(Role.PLAYER)} or {nameof(Role.CAPTAIN)}");
        if (string.IsNullOrWhiteSpace(request.InviteeTeam)) errors.Add("invitee_team is required");
        if (string.IsNullOrWhiteSpace(request.TeamDivision)) errors.Add("team_division is required");
        if (string.IsNullOrWhiteSpace(request.League)) errors.Add("league is required");
        if (string.IsNullOrWhiteSpace(request.Season)) errors.Add("season is required");
        if (string.IsNullOrWhiteSpace(request.InvitedBy)) errors.Add("invited_by is required");

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

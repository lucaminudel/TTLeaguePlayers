using System.Net.Mail;
using Amazon.Lambda.Core;
using NanoidDotNet;
using Amazon.SimpleEmailV2;
using Amazon.SimpleEmailV2.Model;
using TTLeaguePlayersApp.BackEnd.Invites.DataStore;

namespace TTLeaguePlayersApp.BackEnd.Invites.Lambdas;

public class CreateInviteLambda
{
    private readonly ILoggerObserver _observer;
    private readonly IInvitesDataTable _invitesDataTable;
    private readonly Uri _inviteWebsiteUrl;

    private readonly string _bccTo = "luca.minudel@gmail.com";
    private readonly string _from = "invite@ttleagueplayers.uk";


    public CreateInviteLambda(ILoggerObserver observer, IInvitesDataTable invitesDataTable, Uri inviteWebsiteUrl)
    {
        _observer = observer;
        _invitesDataTable = invitesDataTable;
        _inviteWebsiteUrl = inviteWebsiteUrl;
    }

    public async Task<Invite> HandleAsync(CreateInviteRequest request, ILambdaContext context)
    {

        ValidateRequest(request);
        
        // Create invite based on request
        var invite = new Invite
        {
            NanoId = Nanoid.Generate(size: 8),
            InviteeName = request.InviteeName,
            InviteeEmailId = request.InviteeEmailId!, 
            InviteeRole = request.InviteeRole,
            InviteeTeam = request.InviteeTeam,
            TeamDivision = request.TeamDivision,
            League = request.League,
            Season = request.Season,
            InvitedBy = request.InvitedBy,
            CreatedAt = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
            AcceptedAt = null
        };

        await _invitesDataTable.CreateNewInvite(invite);

#if !DEBUG
        
        var emailBody = $@"Hi {invite.InviteeName},

As team Captain for {invite.InviteeTeam}, you’re invited to join this web-app designed to promote Fair Play & Positive Behavior in league matches.

With this app you will be able to:
- See the Kudos other teams awarded to {invite.InviteeTeam}
- Award Kudos to other teams based on your and your team match experience

Additional features to help you manage the team formations, remain informed about local tournaments and new venues, and stay connected with other players will be introduced later.

To get started:, follow this link:
=> {_inviteWebsiteUrl}/#/{invite.NanoId} (*)

For any other questions or feedback, simply reply to this email.

Ciao!
Luca Minudel

_______________________
(*) Instructions
1. Click'“Redeem your invite' at the bottom of the page, and sign up
2. Complete your registration by entering the verification code you will receive via email
3. Log in and enjoy the app!

";

                using var sesClient = new AmazonSimpleEmailServiceV2Client();


            var sendRequest = new SendEmailRequest
            {

                FromEmailAddress = _from,

                Destination = new Destination
                {
                    ToAddresses = invite.InviteeEmailId != null ? [invite.InviteeEmailId] : [],
                    BccAddresses =  _bccTo != null ? [_bccTo] : []
                },

                Content = new EmailContent
                {
                    Simple = new Message
                    {
                        Subject = new Content { Data = $"{invite.InviteeTeam} Captain's Invite to join TT League Players App" },
                        Body = new Body { Text = new Content { Data = emailBody } }
                    }
                },

            };

                await sesClient.SendEmailAsync(sendRequest);
#else
            _observer.OnRuntimeIrregularEvent("CREATE INVITE - NO EMAIL IN LOCAL/TEST", 
                source: new() { ["Class"] =  nameof(CreateInviteLambda), ["Method"] =  nameof(HandleAsync) },
                context, parameters: new () { [nameof(invite.InviteeEmailId)] = invite.InviteeEmailId, [nameof(invite.NanoId)] = invite.NanoId } );
#endif

        _observer.OnRuntimeRegularEvent("CREATE INVITE COMPLETED",
            source: new() { ["Class"] =  nameof(CreateInviteLambda), ["Method"] =  nameof(HandleAsync) }, 
            context, parameters: new () { [nameof(invite.InviteeEmailId)] = invite.InviteeEmailId ?? "", [nameof(invite.NanoId)] = invite.NanoId } );

        return invite;
    }

    private void ValidateRequest(CreateInviteRequest request)
    {
        var errors = new List<string>();

        if (string.IsNullOrWhiteSpace(request.InviteeName)) errors.Add($"{nameof(request.InviteeName)} is required");
        if (string.IsNullOrWhiteSpace(request.InviteeEmailId)) 
        {
            errors.Add($"{nameof(request.InviteeEmailId)} is required");
        }
        else if (!IsValidEmail(request.InviteeEmailId))
        {
            errors.Add($"{nameof(request.InviteeEmailId)} must be a valid email address");
        }
        if (!Enum.IsDefined(typeof(Role), request.InviteeRole)) errors.Add($"{nameof(request.InviteeRole)} must be either {nameof(Role.PLAYER)} or {nameof(Role.CAPTAIN)}");
        if (string.IsNullOrWhiteSpace(request.InviteeTeam)) errors.Add($"{nameof(request.InviteeTeam)} is required");
        if (string.IsNullOrWhiteSpace(request.TeamDivision)) errors.Add($"{nameof(request.TeamDivision)} is required");
        if (string.IsNullOrWhiteSpace(request.League)) errors.Add($"{nameof(request.League)} is required");
        if (string.IsNullOrWhiteSpace(request.Season)) errors.Add($"{nameof(request.Season)} is required");
        if (string.IsNullOrWhiteSpace(request.InvitedBy)) errors.Add($"{nameof(request.InvitedBy)} is required");

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

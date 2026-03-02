using System.Net.Mail;
using Amazon.Lambda.Core;
using Amazon.SimpleEmailV2;
using Amazon.SimpleEmailV2.Model;
using NanoidDotNet;
using TTLeaguePlayersApp.BackEnd.Invites.DataStore;

namespace TTLeaguePlayersApp.BackEnd.Invites.Lambdas;

public class CreateInviteLambda
{
    private readonly ILoggerObserver _observer;
    private readonly IInvitesDataTable _invitesDataTable;
    private readonly Uri _inviteWebsiteUrl;
    private readonly bool _sendInviteEmail;

    private readonly string _bccTo = "luca.minudel@gmail.com";
    private readonly string _from = "\"TTLeaguePlayers - Invite\" <invite@ttleagueplayers.uk>";


    public CreateInviteLambda(ILoggerObserver observer, IInvitesDataTable invitesDataTable, Uri inviteWebsiteUrl, bool sendInviteImail)
    {
        _observer = observer;
        _invitesDataTable = invitesDataTable;
        _inviteWebsiteUrl = inviteWebsiteUrl;
        _sendInviteEmail = sendInviteImail;
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

        if (_sendInviteEmail) 
        {
            await SendInviteEmail(invite, _inviteWebsiteUrl, _from, _bccTo);
        } 
        else 
        {
            _observer.OnRuntimeIrregularEvent("CREATE INVITE - NO EMAIL IN LOCAL/TEST", 
                source: new() { ["Class"] =  nameof(CreateInviteLambda), ["Method"] =  nameof(HandleAsync) },
                context, parameters: new () { [nameof(invite.InviteeEmailId)] = invite.InviteeEmailId, [nameof(invite.NanoId)] = invite.NanoId } );
        }

        _observer.OnRuntimeRegularEvent("CREATE INVITE COMPLETED",
            source: new() { ["Class"] = nameof(CreateInviteLambda), ["Method"] = nameof(HandleAsync) },
            context, parameters: new() { [nameof(invite.InviteeEmailId)] = invite.InviteeEmailId ?? "", [nameof(invite.NanoId)] = invite.NanoId });

        return invite;
    }


    private async Task SendInviteEmail(Invite invite, Uri inviteWebsiteUrl, string from, string bccTo)
    {

        var emailBody = $@"Hi {invite.InviteeName},

As team captain for {invite.InviteeTeam}, you’re invited to join our new web-app (**) designed to promote Fair Play & Positive Behaviour in league matches.
Our core values are: 
- a modern digital experience over handwriting
- transparency and accountability, for all
- a self-organising community with freedom of choice.

Several captains have already registered. Committee members too. So why not you?  

With the TT League Players app, you can already:
- See the Kudos {invite.InviteeTeam} has received from other teams
- Award Kudos to other teams based on your team's match experience

Future features will allow you to manage team formations, discover local tournaments and venues, and stay connected with other players.

To access the app and accept your invitation, follow the link:
=> {inviteWebsiteUrl}/#/{invite.NanoId} (*)

For any other questions or feedback, reply to this email.

Ciao!
Luca Minudel

_______________________

(*) Instructions

1. Click 'Redeem your invite' at the bottom of the page, and sign up

2. Complete your registration by entering the verification code you will receive via email

3. Log in and enjoy the app!


(**)  FYI

This is a platform built by Players for Players; we operate independently of any local league organisations.
";
        var sesClient = new AmazonSimpleEmailServiceV2Client();


        var sendRequest = new SendEmailRequest
        {

            FromEmailAddress = from,

            Destination = new Destination
            {
                ToAddresses = invite.InviteeEmailId != null ? [invite.InviteeEmailId] : [],
                BccAddresses = bccTo != null ? [bccTo] : []
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
    }

    private static void ValidateRequest(CreateInviteRequest request)
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

    private static bool IsValidEmail(string email)
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

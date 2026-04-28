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
    private readonly string _from;

    public CreateInviteLambda(ILoggerObserver observer, IInvitesDataTable invitesDataTable, Uri inviteWebsiteUrl, bool sendInviteImail, string inviteEmailAddress)
    {
        _observer = observer;
        _invitesDataTable = invitesDataTable;
        _inviteWebsiteUrl = inviteWebsiteUrl;
        _sendInviteEmail = sendInviteImail;
        _from = inviteEmailAddress;
    }

    public async Task<Invite> HandleAsync(CreateInviteRequest request, ILambdaContext context)
    {
        ValidateRequestStructure(request);

        // Create appropriate invite type based on role
        var invite = CreateInviteFromRequest(request);

        await _invitesDataTable.CreateNewInvite(invite);

        if (_sendInviteEmail) 
        {
            await SendInviteEmail(invite, _inviteWebsiteUrl, _from, _bccTo);
        } 
        else 
        {
            _observer.OnRuntimeIrregularEvent("CREATE INVITE - NO EMAIL IN LOCAL/TEST", 
                source: new() { ["Class"] =  nameof(CreateInviteLambda), ["Method"] =  nameof(HandleAsync) },
                context, parameters: new () { [nameof(invite.InviteeEmailId)] = invite.InviteeEmailId, [nameof(invite.NanoId)] = invite.NanoId, [nameof(invite.InviteeRole)] = invite.InviteeRole.ToString() } );
        }

        _observer.OnRuntimeRegularEvent("CREATE INVITE COMPLETED",
            source: new() { ["Class"] = nameof(CreateInviteLambda), ["Method"] = nameof(HandleAsync) },
            context, parameters: new() { [nameof(invite.InviteeEmailId)] = invite.InviteeEmailId ?? "", [nameof(invite.NanoId)] = invite.NanoId, [nameof(invite.InviteeRole)] = invite.InviteeRole.ToString() });

        return invite;
    }

    private Invite CreateInviteFromRequest(CreateInviteRequest request)
    {
            
        var nanoId = Nanoid.Generate(size: 8);
        var createdAt = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var acceptedAt = (long?)null;

        return request.InviteeRole switch
        {
            Role.CLUB_MANAGER => new ClubManagerInvite
            {
                NanoId = nanoId,
                InviteeName = request.InviteeName,
                InviteeEmailId = request.InviteeEmailId,
                InviteeRole = request.InviteeRole,
                League = request.League,
                Season = request.Season,
                InvitedBy = request.InvitedBy,
                CreatedAt = createdAt,
                AcceptedAt = acceptedAt,
                InviteeClub = request.InviteeClub!,
                ClubLocation = request.ClubLocation!
            },
            _ => new CaptainOrPlayerInvite
            {
                NanoId = nanoId,
                InviteeName = request.InviteeName,
                InviteeEmailId = request.InviteeEmailId,
                InviteeRole = request.InviteeRole,
                League = request.League,
                Season = request.Season,
                InvitedBy = request.InvitedBy,
                CreatedAt = createdAt,
                AcceptedAt = acceptedAt,
                InviteeTeam = request.InviteeTeam!,
                TeamDivision = request.TeamDivision!
            }
        };
    }

    private async Task SendInviteEmail(Invite invite, Uri inviteWebsiteUrl, string from, string bccTo)
    {
        var (subject, emailBody) = GenerateEmailContent(invite, inviteWebsiteUrl);
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
                    Subject = new Content { Data = subject },
                    Body = new Body { Text = new Content { Data = emailBody } }
                }
            },
        };

        await sesClient.SendEmailAsync(sendRequest);
    }

    private (string subject, string body) GenerateEmailContent(Invite invite, Uri inviteWebsiteUrl)
    {
        var baseInviteLink = $"{inviteWebsiteUrl}/#/{invite.NanoId}";

        if (invite is ClubManagerInvite clubManagerInvite)
        {
            var subject = $"Invite to manage {clubManagerInvite.InviteeClub} on TT League Players App";
            var body = $@"Hi {invite.InviteeName},

As Club Manager for {clubManagerInvite.InviteeClub}, you're invited to join our new unofficial web-app designed to provide a modern digital experience and promote inclusivity and fair play in table tennis league matches.

Our core values are: 
- Modernity
- Fair play & positive behaviour
- Community.

With the TT League Players app, you can:
- Promote your club and upcoming tournaments
- Monitor your club teams' registration to this app
- Monitor the Kudos received by your club teams.

To unlock all these features, on your smartphone and desktop, follow the link below and the instructions (no installation required, just a modern web browser):
=> {baseInviteLink}

_______________________

Instructions:

1. Click 'Redeem your invite' at the bottom of the page, and sign up

2. Complete your registration by entering the verification code you will receive via email

3. Log in and enjoy the app!

_______________________


For any other questions or feedback, reply to this email.

Ciao!
Luca Minudel

";
            return (subject, body);
        }

        // Default: CaptainOrPlayerInvite
        if (invite is CaptainOrPlayerInvite captainOrPlayerInvite)
        {
            var roleLabel = invite.InviteeRole == Role.CAPTAIN ? "team captain" : "player";
            var subject = $"{captainOrPlayerInvite.InviteeTeam} {roleLabel.ToUpper()}'s Invite to join TT League Players App";
            var body = $@"Hi {invite.InviteeName},

As {roleLabel} for {captainOrPlayerInvite.InviteeTeam}, you're invited to join our new unofficial web-app designed to provide a modern digital experience and promote inclusivity and fair play in table tennis league matches.

Our core values are: 
- Modernity
- Fair play & positive behaviour
- Community.

Many have already registered. Give it a try.

With the TT League Players app, you can:
- Istantly view the updcoming match date, location, and opponent
- Award Kudos to opposing teams based on your team's match experience
- View the Kudos {captainOrPlayerInvite.InviteeTeam} has received from other teams
- Discover local tournaments and new venues.
Future features will allow you to manage your team formations, and stay connected with other players.

To unlock all these features, on your smartphone and desktop, follow the link below and the instructions (no installation required, just a modern web browser):
=> {baseInviteLink}

_______________________

Instructions:

1. Click 'Redeem your invite' at the bottom of the page, and sign up

2. Complete your registration by entering the verification code you will receive via email

3. Log in and enjoy the app!

_______________________

For any other questions or feedback, reply to this email.

Ciao!
Luca Minudel

";
            return (subject, body);
        }

        throw new InvalidOperationException($"Unknown {nameof(invite)} type {invite.GetType().Name}");
    }

    private static void ValidateRequestStructure(CreateInviteRequest request)
    {
        var errors = new List<string>();

        // Role-specific structure validation
        if (request.InviteeRole == Role.CLUB_MANAGER)
        {            
            if (!string.IsNullOrWhiteSpace(request.InviteeTeam)) errors.Add($"{JsonFieldName.For<CreateInviteRequest>(nameof(request.InviteeTeam))} is unexpected for {nameof(Role.CLUB_MANAGER)} invites");
            if (!string.IsNullOrWhiteSpace(request.TeamDivision)) errors.Add($"{JsonFieldName.For<CreateInviteRequest>(nameof(request.TeamDivision))} is unexpected for {nameof(Role.CLUB_MANAGER)} invites");

        }
        else if (request.InviteeRole == Role.CAPTAIN || request.InviteeRole == Role.PLAYER)
        {           
            if (!string.IsNullOrWhiteSpace(request.InviteeClub)) errors.Add($"{JsonFieldName.For<CreateInviteRequest>(nameof(request.InviteeClub))} is unexpected for {nameof(Role.CAPTAIN)} and {nameof(Role.PLAYER)} invites");
            if (!string.IsNullOrWhiteSpace(request.ClubLocation)) errors.Add($"{JsonFieldName.For<CreateInviteRequest>(nameof(request.ClubLocation))} is unexpected for {nameof(Role.CAPTAIN)} and {nameof(Role.PLAYER)} invites");
        }
        else
        {
            errors.Add($"{JsonFieldName.For<CreateInviteRequest>(nameof(request.InviteeRole))} is not a valid role, must be either {nameof(Role.PLAYER)} or {nameof(Role.CAPTAIN)} or {nameof(Role.CLUB_MANAGER)}");
        }   

        if (errors.Count > 0)
        {
            throw new ValidationException(errors);
        }
    }

}

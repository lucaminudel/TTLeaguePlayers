using Amazon.DynamoDBv2;
using Amazon.DynamoDBv2.DocumentModel;
using Amazon.DynamoDBv2.Model;
using System.Net.Mail;
using System.Text.Json;

namespace TTLeaguePlayersApp.BackEnd.Invites.DataStore;

public class InvitesDataTable : IDisposable, IInvitesDataTable
{
    private readonly AmazonDynamoDBClient _client;
    private readonly ITable _table;

    public InvitesDataTable(Uri? localDynamoDbServiceUrl, Amazon.RegionEndpoint? remoteDynamoDbRegion, string tablesNameSuffix)
    {
        var _tableName = $"ttleague-invites-{tablesNameSuffix}";

        AmazonDynamoDBConfig clientConfig;
        if (localDynamoDbServiceUrl != null)
        {
            clientConfig = new AmazonDynamoDBConfig { ServiceURL = localDynamoDbServiceUrl.ToString() };
        }
        else
        {
            clientConfig = new AmazonDynamoDBConfig { RegionEndpoint = remoteDynamoDbRegion };
        }

        _client = new AmazonDynamoDBClient(clientConfig);
        _table = new TableBuilder(_client, _tableName)
            .AddHashKey("nano_id", DynamoDBEntryType.String)
            .Build();
    }

    public async Task CreateNewInvite(Invite invite)
    {
        ValidateInvite(invite);

        var json = PolymorphicallySerializeInvite(invite);
        var document = Document.FromJson(json);
        await _table.PutItemAsync(document);
    }
    
    public async Task<Invite> RetrieveInvite(string nanoId)
    {
        EnsureValidId(nanoId);

        var document = await _table.GetItemAsync(nanoId);
        if (document == null)
        {
            throw new KeyNotFoundException($"Invite with NanoId '{nanoId}' not found.");
        }
        
        var json = document.ToJson();
        var invite = PolymorphicallyDeserializeInvite(json);
        return invite;
    }

    public async Task MarkInviteAccepted(string nanoId, long acceptedAt)
    {
        EnsureValidId(nanoId);

        var updateDoc = new Document();
        updateDoc["nano_id"] = nanoId;
        updateDoc["accepted_at"] = acceptedAt;

        var config = new UpdateItemOperationConfig
        {
            ConditionalExpression = new Expression
            {
                ExpressionStatement = "attribute_exists(nano_id)"
            }
        };

        try
        {
            await _table.UpdateItemAsync(updateDoc, config);
        }
        catch (ConditionalCheckFailedException)
        {
            throw new KeyNotFoundException($"Invite with NanoId '{nanoId}' not found.");
        }
    }

    public async Task DeleteInvite(string nanoId)
    {
        EnsureValidId(nanoId);
        await _table.DeleteItemAsync(nanoId);
    }

    private void EnsureValidId(string nanoId)
    {
        if (string.IsNullOrWhiteSpace(nanoId))
            throw new ArgumentException("NanoId cannot be null or empty", nameof(nanoId));
    }

    private static void ValidateInvite(Invite invite)
    {
        if (invite == null) throw new ArgumentNullException(nameof(invite));

        var errors = new List<string>();

        // Common validation
        if (string.IsNullOrWhiteSpace(invite.NanoId)) errors.Add($"{JsonFieldName.For<Invite>(nameof(invite.NanoId))} is required");
        if (invite.CreatedAt <= 0) errors.Add($"{JsonFieldName.For<Invite>(nameof(invite.CreatedAt))} must be valid");
        if (string.IsNullOrWhiteSpace(invite.InviteeName)) errors.Add($"{JsonFieldName.For<Invite>(nameof(invite.InviteeName))} is required");
        if (string.IsNullOrWhiteSpace(invite.InviteeEmailId)) 
        {
            errors.Add($"{JsonFieldName.For<Invite>(nameof(invite.InviteeEmailId))} is required");
        }
        else if (!IsValidEmail(invite.InviteeEmailId))
        {
            errors.Add($"{JsonFieldName.For<Invite>(nameof(invite.InviteeEmailId))} must be a valid email address");
        }
        if (!Enum.IsDefined(typeof(Role), invite.InviteeRole)) errors.Add($"{JsonFieldName.For<Invite>(nameof(invite.InviteeRole))} is not a valid role, must be either {nameof(Role.PLAYER)} or {nameof(Role.CAPTAIN)} or {nameof(Role.CLUB_MANAGER)}");
        if (string.IsNullOrWhiteSpace(invite.League)) errors.Add($"{JsonFieldName.For<Invite>(nameof(invite.League))} is required");
        if (string.IsNullOrWhiteSpace(invite.Season)) errors.Add($"{JsonFieldName.For<Invite>(nameof(invite.Season))} is required");
        if (string.IsNullOrWhiteSpace(invite.InvitedBy)) errors.Add($"{JsonFieldName.For<Invite>(nameof(invite.InvitedBy))} is required");

        // Role-specific validation
        if (invite is ClubManagerInvite clubManagerInvite)
        {            
            if (string.IsNullOrWhiteSpace(clubManagerInvite.InviteeClub)) errors.Add($"{JsonFieldName.For<ClubManagerInvite>(nameof(clubManagerInvite.InviteeClub))} is required for {nameof(Role.CLUB_MANAGER)} invites");
            if (string.IsNullOrWhiteSpace(clubManagerInvite.ClubLocation)) errors.Add($"{JsonFieldName.For<ClubManagerInvite>(nameof(clubManagerInvite.ClubLocation))} is required for {nameof(Role.CLUB_MANAGER)} invites");
        }
        else if (invite is CaptainOrPlayerInvite captainOrPlayerInvite)
        {           
            if (string.IsNullOrWhiteSpace(captainOrPlayerInvite.InviteeTeam)) errors.Add($"{JsonFieldName.For<CaptainOrPlayerInvite>(nameof(captainOrPlayerInvite.InviteeTeam))} is required for {nameof(Role.CAPTAIN)} and {nameof(Role.PLAYER)} invites");
            if (string.IsNullOrWhiteSpace(captainOrPlayerInvite.TeamDivision)) errors.Add($"{JsonFieldName.For<CaptainOrPlayerInvite>(nameof(captainOrPlayerInvite.TeamDivision))} is required for {nameof(Role.CAPTAIN)} and {nameof(Role.PLAYER)} invites");
        } 
        else 
        {
            errors.Add($"Unknown {nameof(invite)} type {invite.GetType().Name}");
        }

        if (errors.Count > 0)
        {
            throw new ValidationException(errors);
        }
    }

    private static string PolymorphicallySerializeInvite(Invite invite)
    {
        if (invite is ClubManagerInvite)
        {
            return JsonSerializer.Serialize((ClubManagerInvite)invite);
        }
        else if (invite is CaptainOrPlayerInvite)
        {
            return JsonSerializer.Serialize((CaptainOrPlayerInvite)invite);
        }       
        else {
            throw new ArgumentException($"Unknown {nameof(invite)} type {invite.GetType().Name}");
        }
    }

    private static Invite PolymorphicallyDeserializeInvite(string json)
    {
        using var document = JsonDocument.Parse(json);
        var root = document.RootElement;

        // Determine type by checking which fields exist
        var hasInviteeClub = root.TryGetProperty("invitee_club", out _);
        var hasClubLocation = root.TryGetProperty("club_location", out _);
        var hasInviteeTeam = root.TryGetProperty("invitee_team", out _);
        var hasTeamDivision = root.TryGetProperty("team_division", out _);

        if ((hasInviteeClub & hasClubLocation) && !(hasInviteeTeam && hasTeamDivision))
        {
            // It's a ClubManagerInvite
            return JsonSerializer.Deserialize<ClubManagerInvite>(json)!;
        }
        else if ((hasInviteeTeam & hasTeamDivision) && !(hasInviteeClub & hasClubLocation))
        {
            // It's a CaptainOrPlayerInvite
            return JsonSerializer.Deserialize<CaptainOrPlayerInvite>(json)!;
        }
        else 
        {
             throw new JsonException("JSON structure does not match any known Invite type");    
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

    public void Dispose()
    {
        _client?.Dispose();
    }
}

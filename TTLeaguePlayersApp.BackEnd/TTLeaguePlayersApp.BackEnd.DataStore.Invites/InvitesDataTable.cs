using Amazon.DynamoDBv2;
using Amazon.DynamoDBv2.DocumentModel;
using Amazon.DynamoDBv2.Model;
using System.Net.Mail;
using System.Text.Json;
using TTLeaguePlayersApp.BackEnd.Lambdas.Invites;

namespace TTLeaguePlayersApp.BackEnd.DataStore.Invites;

public class InvitesDataTable : IDisposable
{
    private readonly AmazonDynamoDBClient _client;
    private readonly ITable _table;

    public InvitesDataTable(Uri? localDynamoDbServiceUrl, Amazon.RegionEndpoint? remoteDynamoDbRegion, string environment)
    {
        var _tableName = $"ttleague-invites-{environment}";
        
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
        
        var json = JsonSerializer.Serialize(invite);
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

        return JsonSerializer.Deserialize<Invite>(document.ToJson())!;
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

    private void ValidateInvite(Invite invite)
    {
        if (invite == null) throw new ArgumentNullException(nameof(invite));
        
        var errors = new List<string>();

        if (string.IsNullOrWhiteSpace(invite.NanoId)) errors.Add($"{nameof(invite.NanoId)} is required");
        if (invite.CreatedAt <= 0) errors.Add($"{nameof(invite.CreatedAt)} must be valid");
        if (string.IsNullOrWhiteSpace(invite.InviteeName)) errors.Add($"{nameof(invite.InviteeName)} is required");
        
        if (string.IsNullOrWhiteSpace(invite.InviteeEmailId)) 
        {
            errors.Add($"{nameof(invite.InviteeEmailId)} is required");
        }
        else if (!IsValidEmail(invite.InviteeEmailId))
        {
            errors.Add($"{nameof(invite.InviteeEmailId)} must be a valid email address");
        }

        if (string.IsNullOrWhiteSpace(invite.InviteeTeam)) errors.Add($"{nameof(invite.InviteeTeam)} is required");
        if (string.IsNullOrWhiteSpace(invite.TeamDivision)) errors.Add($"{nameof(invite.TeamDivision)} is required");
        if (string.IsNullOrWhiteSpace(invite.League)) errors.Add($"{nameof(invite.League)} is required");
        if (string.IsNullOrWhiteSpace(invite.Season)) errors.Add($"{nameof(invite.Season)} is required");
        if (string.IsNullOrWhiteSpace(invite.InvitedBy)) errors.Add($"{nameof(invite.InvitedBy)} is required");

        if (errors.Count > 0)
        {
            throw new ArgumentException($"Invite validation failed: {string.Join(", ", errors)}");
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

    public void Dispose()
    {
        _client?.Dispose();
    }
}

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

    private readonly string _tableName;

    public InvitesDataTable(Uri? localDynamoDbServiceUrl, Amazon.RegionEndpoint? remoteDynamoDbRegion, string tablesNameSuffix)
    {
        _tableName = $"ttleague-invites-{tablesNameSuffix}";

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

        // Partition key of LeagueSeasonTeamIndex
        document["league_season"] = LeagueSeasonKey(invite.League, invite.Season);

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

    public async Task<List<CaptainInviteSummary>> RetrieveCaptainInvitesForTeams(
        string league, string season, IReadOnlyList<string> teamNames)
    {
        ValidateRetrieveCaptainInvitesForTeamsParameters(league, season, teamNames);

        // Team names are matched case-insensitively and with surrounding whitespace ignored.
        // No frontend feature currently implemented in this codebase creates invites, so invitee_team
        // is hand-typed and has only ever had a non-empty rule applied to it (CreateInviteLambda
        // stores it verbatim) — a casing or padding difference is a data-entry slip,
        // not a different team. Matching stops being forgiving there: it is NOT a prefix match, and
        // punctuation still counts (a curly apostrophe is a different team from a straight one).
        var requestedTeams = new HashSet<string>(teamNames.Select(name => name.Trim()), StringComparer.OrdinalIgnoreCase);

        var values = new Dictionary<string, AttributeValue>
        {
            [":league_season"] = new AttributeValue { S = LeagueSeasonKey(league, season) },
            [":captain"] = new AttributeValue { S = nameof(Role.CAPTAIN) }
        };

        var invites = new List<CaptainInviteSummary>();
        Dictionary<string, AttributeValue>? exclusiveStartKey = null;

        do
        {
            var request = new QueryRequest
            {
                TableName = _tableName,
                IndexName = "LeagueSeasonTeamIndex",
                KeyConditionExpression = "league_season = :league_season",
                FilterExpression = "invitee_role = :captain",
                ExpressionAttributeValues = values,
                ExclusiveStartKey = exclusiveStartKey
            };

            var response = await _client.QueryAsync(request);

            foreach (var item in response.Items)
            {
                var invite = ToCaptainInviteSummary(item);
                if (requestedTeams.Contains(invite.InviteeTeam.Trim()))
                {
                    invites.Add(invite);
                }
            }

            // A FilterExpression is applied AFTER the 1 MB page read, so a page can come back with
            // ZERO items and still carry a LastEvaluatedKey. Terminating on an empty page instead of
            // on the absence of a key would silently drop invites — stop only when the key is gone.
            exclusiveStartKey = response.LastEvaluatedKey is { Count: > 0 } ? response.LastEvaluatedKey : null;
        }
        while (exclusiveStartKey is not null);

        return invites;
    }

    private static CaptainInviteSummary ToCaptainInviteSummary(Dictionary<string, AttributeValue> item)
    {
        return new CaptainInviteSummary
        {
            NanoId = GetString(item, "nano_id"),
            InviteeName = GetString(item, "invitee_name"),
            InviteeEmailId = GetString(item, "invitee_email_id"),
            InviteeRole = Enum.TryParse<Role>(GetString(item, "invitee_role"), out var role) ? role : Role.CAPTAIN,
            League = GetString(item, "league"),
            Season = GetString(item, "season"),
            InviteeTeam = GetString(item, "invitee_team"),
            TeamDivision = GetString(item, "team_division"),
            CreatedAt = GetLong(item, "created_at") ?? 0,
            AcceptedAt = GetLong(item, "accepted_at")
        };
    }

    private static string GetString(Dictionary<string, AttributeValue> item, string key)
    {
        return item.TryGetValue(key, out var value) ? value.S ?? string.Empty : string.Empty;
    }

    private static long? GetLong(Dictionary<string, AttributeValue> item, string key)
    {
        if (!item.TryGetValue(key, out var value)) return null;
        if (value.NULL == true) return null;
        return long.TryParse(value.N, out var parsed) ? parsed : null;
    }

    private static void ValidateRetrieveCaptainInvitesForTeamsParameters(
        string league, string season, IReadOnlyList<string> teamNames)
    {
        var errors = new List<string>();

        if (string.IsNullOrWhiteSpace(league)) errors.Add("league is required");
        if (string.IsNullOrWhiteSpace(season)) errors.Add("season is required");

        if (teamNames is null || teamNames.Count == 0)
        {
            errors.Add("team_names is required and must contain at least one team name");
        }
        else if (teamNames.Any(string.IsNullOrWhiteSpace))
        {
            errors.Add("team_names must not contain empty team names");
        }

        if (errors.Count > 0)
        {
            throw new ValidationException(errors);
        }
    }

    // The one place the LeagueSeasonTeamIndex partition key is spelled. 
    public static string LeagueSeasonKey(string league, string season) => $"{league}#{season}";

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

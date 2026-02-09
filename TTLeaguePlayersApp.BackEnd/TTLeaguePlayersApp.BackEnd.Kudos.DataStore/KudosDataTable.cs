using Amazon.DynamoDBv2;
using Amazon.DynamoDBv2.DocumentModel;
using Amazon.DynamoDBv2.Model;
using System.Text.Json;
using System.Linq;
using TTLeaguePlayersApp.BackEnd.Invites.Lambdas;
using KudosEvent = TTLeaguePlayersApp.BackEnd.Kudos.DataStore.Kudos;
using KudosSummary = TTLeaguePlayersApp.BackEnd.Kudos.Lambdas.KudosSummary;

namespace TTLeaguePlayersApp.BackEnd.Kudos.DataStore;

public class KudosDataTable : IDisposable, IKudosDataTable
{
    private readonly AmazonDynamoDBClient _client;
    private readonly Table _table;
    private readonly string _tableName;

    // Use specific construction to match keys defined in template.yaml
    private const string ItemTypeKudos = "KUDOS";
    private const string ItemTypeSummary = "SUMMARY";

    public KudosDataTable(Uri? localDynamoDbServiceUrl, Amazon.RegionEndpoint? remoteDynamoDbRegion, string tablesNameSuffix)
    {
        _tableName = $"ttleague-kudos-{tablesNameSuffix}";

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
            .AddHashKey("PK", DynamoDBEntryType.String)
            .AddRangeKey("SK", DynamoDBEntryType.String)
            .Build();
    }

    public async Task SaveKudosAsync(KudosEvent kudos)
    {
        ValidateKudos(kudos);

        var pk = $"{kudos.League}#{kudos.Season}#{kudos.Division}#{kudos.ReceivingTeam}";
        var sk = $"match#{kudos.HomeTeam}#{kudos.AwayTeam}#{kudos.GiverPersonSub}";
        var summarySk = $"match#{kudos.HomeTeam}#{kudos.AwayTeam}#SUMMARY";

        var gsi2pk = $"{kudos.League}#{kudos.Season}#{kudos.Division}";
        var gsi2sk = $"{kudos.ReceivingTeam}#{kudos.MatchDateTime}#{kudos.HomeTeam}#{kudos.AwayTeam}";

        var kudosItem = new Dictionary<string, AttributeValue>
        {
            ["PK"] = new AttributeValue { S = pk },
            ["SK"] = new AttributeValue { S = sk },
            ["league"] = new AttributeValue { S = kudos.League },
            ["season"] = new AttributeValue { S = kudos.Season },
            ["division"] = new AttributeValue { S = kudos.Division },
            ["receiving_team"] = new AttributeValue { S = kudos.ReceivingTeam },
            ["home_team"] = new AttributeValue { S = kudos.HomeTeam },
            ["away_team"] = new AttributeValue { S = kudos.AwayTeam },
            ["match_date_time"] = new AttributeValue { N = kudos.MatchDateTime.ToString() },
            ["giver_team"] = new AttributeValue { S = kudos.GiverTeam },
            ["giver_person_name"] = new AttributeValue { S = kudos.GiverPersonName },
            ["giver_person_sub"] = new AttributeValue { S = kudos.GiverPersonSub },
            ["kudos_value"] = new AttributeValue { N = kudos.KudosValue.ToString() },
            ["item_type"] = new AttributeValue { S = ItemTypeKudos },
            ["created_at"] = new AttributeValue { N = DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString() },
            ["GSI1PK"] = new AttributeValue { S = $"{kudos.League}#{kudos.Season}#{kudos.GiverPersonSub}" }
        };

        string counterField = kudos.KudosValue switch
        {
            1 => "positive_kudos_count",
            0 => "neutral_kudos_count",
            -1 => "negative_kudos_count",
            _ => throw new ArgumentException("Invalid KudosValue, must be -1, 0, or 1.")
        };

        var updateExpression = $"SET {counterField} = if_not_exists({counterField}, :zero) + :one, " +
                               $"league = if_not_exists(league, :league), " +
                               $"season = if_not_exists(season, :season), " +
                               $"division = if_not_exists(division, :division), " +
                               $"item_type = if_not_exists(item_type, :summaryType), " +
                               $"home_team = if_not_exists(home_team, :home), " +
                               $"away_team = if_not_exists(away_team, :away), " +
                               $"match_date_time = if_not_exists(match_date_time, :dt), " +
                               $"receiving_team = if_not_exists(receiving_team, :recteam), " +
                               $"GSI2PK = if_not_exists(GSI2PK, :gsi2pk), " +
                               $"GSI2SK = if_not_exists(GSI2SK, :gsi2sk)";

        var transactItems = new List<TransactWriteItem>
        {
            new TransactWriteItem
            {
                Put = new Put
                {
                    TableName = _tableName,
                    Item = kudosItem,
                    ConditionExpression = "attribute_not_exists(PK) AND attribute_not_exists(SK)"
                }
            },
            new TransactWriteItem
            {
                Update = new Update
                {
                    TableName = _tableName,
                    Key = new Dictionary<string, AttributeValue>
                    {
                        ["PK"] = new AttributeValue { S = pk },
                        ["SK"] = new AttributeValue { S = summarySk }
                    },
                    UpdateExpression = updateExpression,
                    ExpressionAttributeValues = new Dictionary<string, AttributeValue>
                    {
                        [":one"] = new AttributeValue { N = "1" },
                        [":zero"] = new AttributeValue { N = "0" },
                        [":league"] = new AttributeValue { S = kudos.League },
                        [":season"] = new AttributeValue { S = kudos.Season },
                        [":division"] = new AttributeValue { S = kudos.Division },
                        [":summaryType"] = new AttributeValue { S = ItemTypeSummary },
                        [":home"] = new AttributeValue { S = kudos.HomeTeam },
                        [":away"] = new AttributeValue { S = kudos.AwayTeam },
                        [":dt"] = new AttributeValue { N = kudos.MatchDateTime.ToString() },
                        [":recteam"] = new AttributeValue { S = kudos.ReceivingTeam },
                        [":gsi2pk"] = new AttributeValue { S = gsi2pk },
                        [":gsi2sk"] = new AttributeValue { S = gsi2sk }
                    }
                }
            }
        };

        try
        {
            await _client.TransactWriteItemsAsync(new TransactWriteItemsRequest { TransactItems = transactItems });
        }
        catch (TransactionCanceledException ex)
        {
            var alreadyExistsMakeItIdempotent = ex.CancellationReasons.Any(r => r.Code == "ConditionalCheckFailed");
            if (alreadyExistsMakeItIdempotent) return;

            throw;
        }
    }

    public async Task<KudosEvent> RetrieveKudosAsync(string league, string season, string division, string receivingTeam, string homeTeam, string awayTeam, string giverPersonSub)
    {
        var pk = $"{league}#{season}#{division}#{receivingTeam}";
        var sk = $"match#{homeTeam}#{awayTeam}#{giverPersonSub}";

        var document = await _table.GetItemAsync(pk, sk);
        if (document == null)
        {
            throw new KeyNotFoundException($"Kudos not found for PK: {pk}, SK: {sk}");
        }

        return JsonSerializer.Deserialize<KudosEvent>(document.ToJson())!;
    }

    public async Task<KudosSummary> RetrieveSummaryAsync(string league, string season, string division, string receivingTeam, string homeTeam, string awayTeam)
    {
        var pk = $"{league}#{season}#{division}#{receivingTeam}";
        var sk = $"match#{homeTeam}#{awayTeam}#SUMMARY";

        var document = await _table.GetItemAsync(pk, sk);
        if (document == null)
        {
            throw new KeyNotFoundException($"Summary not found for PK: {pk}, SK: {sk}");
        }

        return JsonSerializer.Deserialize<KudosSummary>(document.ToJson())!;
    }

    public async Task DeleteKudosAsync(string league, string season, string division, string receivingTeam, string homeTeam, string awayTeam, string giverPersonSub)
    {
        ValidateDeleteParameters(league, season, division, receivingTeam, homeTeam, awayTeam, giverPersonSub);

        var pk = $"{league}#{season}#{division}#{receivingTeam}";
        var sk = $"match#{homeTeam}#{awayTeam}#{giverPersonSub}";
        var summarySk = $"match#{homeTeam}#{awayTeam}#SUMMARY";

        // First, retrieve the kudos to get its value for summary update
        KudosEvent kudos;
        try
        {
            kudos = await RetrieveKudosAsync(league, season, division, receivingTeam, homeTeam, awayTeam, giverPersonSub);
        }
        catch (KeyNotFoundException)
        {
            // Kudos doesn't exist, nothing to delete - idempotent behavior
            return;
        }

        // Determine which counter to decrement
        string counterField = kudos.KudosValue switch
        {
            1 => "positive_kudos_count",
            0 => "neutral_kudos_count",
            -1 => "negative_kudos_count",
            _ => throw new InvalidOperationException($"Invalid KudosValue: {kudos.KudosValue}")
        };

        // Retrieve current summary to check if we should delete it
        KudosSummary? summary = null;
        try
        {
            summary = await RetrieveSummaryAsync(league, season, division, receivingTeam, homeTeam, awayTeam);
        }
        catch (KeyNotFoundException)
        {
            // Summary doesn't exist, just delete the kudos item
            await _client.DeleteItemAsync(new DeleteItemRequest
            {
                TableName = _tableName,
                Key = new Dictionary<string, AttributeValue>
                {
                    ["PK"] = new AttributeValue { S = pk },
                    ["SK"] = new AttributeValue { S = sk }
                }
            });
            return;
        }

        // Calculate new counter values
        int newPositiveCount = summary.PositiveKudosCount - (kudos.KudosValue == 1 ? 1 : 0);
        int newNeutralCount = summary.NeutralKudosCount - (kudos.KudosValue == 0 ? 1 : 0);
        int newNegativeCount = summary.NegativeKudosCount - (kudos.KudosValue == -1 ? 1 : 0);

        var transactItems = new List<TransactWriteItem>
        {
            // Delete the kudos item
            new TransactWriteItem
            {
                Delete = new Delete
                {
                    TableName = _tableName,
                    Key = new Dictionary<string, AttributeValue>
                    {
                        ["PK"] = new AttributeValue { S = pk },
                        ["SK"] = new AttributeValue { S = sk }
                    }
                }
            }
        };

        // Check if all counters will be zero after this delete
        if (newPositiveCount == 0 && newNeutralCount == 0 && newNegativeCount == 0)
        {
            // Delete the summary item
            transactItems.Add(new TransactWriteItem
            {
                Delete = new Delete
                {
                    TableName = _tableName,
                    Key = new Dictionary<string, AttributeValue>
                    {
                        ["PK"] = new AttributeValue { S = pk },
                        ["SK"] = new AttributeValue { S = summarySk }
                    }
                }
            });
        }
        else
        {
            // Update the summary by decrementing the appropriate counter
            var updateExpression = $"SET {counterField} = {counterField} - :one";

            transactItems.Add(new TransactWriteItem
            {
                Update = new Update
                {
                    TableName = _tableName,
                    Key = new Dictionary<string, AttributeValue>
                    {
                        ["PK"] = new AttributeValue { S = pk },
                        ["SK"] = new AttributeValue { S = summarySk }
                    },
                    UpdateExpression = updateExpression,
                    ExpressionAttributeValues = new Dictionary<string, AttributeValue>
                    {
                        [":one"] = new AttributeValue { N = "1" },
                        [":zero"] = new AttributeValue { N = "0" }
                    },
                    // Ensure the counter doesn't go below zero
                    ConditionExpression = $"{counterField} > :zero"
                }
            });
        }

        await _client.TransactWriteItemsAsync(new TransactWriteItemsRequest { TransactItems = transactItems });
    }

    private void ValidateDeleteParameters(string league, string season, string division, string receivingTeam, string homeTeam, string awayTeam, string giverPersonSub)
    {
        var errors = new List<string>();

        if (string.IsNullOrWhiteSpace(league)) errors.Add($"{nameof(league)} is required");
        if (string.IsNullOrWhiteSpace(season)) errors.Add($"{nameof(season)} is required");
        if (string.IsNullOrWhiteSpace(division)) errors.Add($"{nameof(division)} is required");
        if (string.IsNullOrWhiteSpace(receivingTeam)) errors.Add($"{nameof(receivingTeam)} is required");
        if (string.IsNullOrWhiteSpace(homeTeam)) errors.Add($"{nameof(homeTeam)} is required");
        if (string.IsNullOrWhiteSpace(awayTeam)) errors.Add($"{nameof(awayTeam)} is required");
        if (string.IsNullOrWhiteSpace(giverPersonSub)) errors.Add($"{nameof(giverPersonSub)} is required");

        // Business logic validation
        if (!string.IsNullOrWhiteSpace(receivingTeam) && !string.IsNullOrWhiteSpace(homeTeam) && !string.IsNullOrWhiteSpace(awayTeam))
        {
            if (receivingTeam != homeTeam && receivingTeam != awayTeam)
            {
                errors.Add($"{nameof(receivingTeam)} must be either the {nameof(homeTeam)} or the {nameof(awayTeam)}.");
            }
        }

        if (errors.Count > 0)
        {
            throw new ValidationException(errors);
        }
    }

    private void ValidateKudos(KudosEvent kudos)
    {
        if (kudos == null) throw new ArgumentNullException(nameof(kudos));
        
        var errors = new List<string>();

        // Required field validations
        if (string.IsNullOrWhiteSpace(kudos.ReceivingTeam)) errors.Add($"{nameof(kudos.ReceivingTeam)} is required");
        if (string.IsNullOrWhiteSpace(kudos.HomeTeam)) errors.Add($"{nameof(kudos.HomeTeam)} is required");
        if (string.IsNullOrWhiteSpace(kudos.AwayTeam)) errors.Add($"{nameof(kudos.AwayTeam)} is required");
        if (string.IsNullOrWhiteSpace(kudos.GiverTeam)) errors.Add($"{nameof(kudos.GiverTeam)} is required");
        if (string.IsNullOrWhiteSpace(kudos.League)) errors.Add($"{nameof(kudos.League)} is required");
        if (string.IsNullOrWhiteSpace(kudos.Season)) errors.Add($"{nameof(kudos.Season)} is required");
        if (string.IsNullOrWhiteSpace(kudos.Division)) errors.Add($"{nameof(kudos.Division)} is required");
        if (string.IsNullOrWhiteSpace(kudos.GiverPersonName)) errors.Add($"{nameof(kudos.GiverPersonName)} is required");   
        if (string.IsNullOrWhiteSpace(kudos.GiverPersonSub)) errors.Add($"{nameof(kudos.GiverPersonSub)} is required");

        // Business logic validations
        if (kudos.ReceivingTeam != kudos.HomeTeam && kudos.ReceivingTeam != kudos.AwayTeam)
        {
            errors.Add($"{nameof(kudos.ReceivingTeam)} must be either the {nameof(kudos.HomeTeam)} or the {nameof(kudos.AwayTeam)}.");
        }

        if (kudos.GiverTeam != kudos.HomeTeam && kudos.GiverTeam != kudos.AwayTeam)
        {
            errors.Add($"{nameof(kudos.GiverTeam)} must be either the {nameof(kudos.HomeTeam)} or the {nameof(kudos.AwayTeam)}.");
        }

        if (kudos.GiverTeam == kudos.ReceivingTeam)
        {
            errors.Add($"{nameof(kudos.GiverTeam)} cannot be the same as the {nameof(kudos.ReceivingTeam)}.");
        }

        if (kudos.KudosValue != -1 && kudos.KudosValue != 0 && kudos.KudosValue != 1)
        {
            errors.Add($"{nameof(kudos.KudosValue)} must be -1, 0, or 1.");
        }
        
        if (errors.Count > 0)
        {
            throw new ValidationException(errors);
        }
    }

    public async Task<List<KudosEvent>> RetrieveKudosGivenByPlayerAsync(string league, string season, string giverPersonSub, string division, string giverTeam)
    {
        ValidateRetrieveKudosGivenByPlayerParameters(league, season, giverPersonSub, division, giverTeam);

        var gsi1pk = $"{league}#{season}#{giverPersonSub}";

        var request = new QueryRequest
        {
            TableName = _tableName,
            IndexName = "KudosByPlayerIndex",
            KeyConditionExpression = "GSI1PK = :gsi1pk",
            FilterExpression = "division = :division AND giver_team = :giverTeam",
            ExpressionAttributeValues = new Dictionary<string, AttributeValue>
            {
                { ":gsi1pk", new AttributeValue { S = gsi1pk } },
                { ":division", new AttributeValue { S = division } },
                { ":giverTeam", new AttributeValue { S = giverTeam } }
            },
            ScanIndexForward = false // Descending order by match_date_time
        };

        var response = await _client.QueryAsync(request);

        return response.Items.Select(item => 
        {
            var parts = item["SK"].S.Split('#');
            return new KudosEvent
            {
                League = league,
                Season = season,
                Division = GetString(item, "division"),
                ReceivingTeam = GetString(item, "receiving_team"),
                HomeTeam = parts[1],
                AwayTeam = parts[2],
                MatchDateTime = GetLong(item, "match_date_time"),
                GiverTeam = GetString(item, "giver_team"),
                GiverPersonName = GetString(item, "giver_person_name"),
                GiverPersonSub = giverPersonSub,
                KudosValue = GetInt(item, "kudos_value")
            };
        }).ToList();
    }

    public async Task<List<KudosSummary>> RetrieveKudosAwardedToTeamAsync(string league, string season, string division, string teamName)
    {
        ValidateRetrieveKudosAwardedToTeamParameters(league, season, division, teamName);

        var gsi2pk = $"{league}#{season}#{division}";
        var gsi2skPrefix = $"{teamName}#";

        var request = new QueryRequest
        {
            TableName = _tableName,
            IndexName = "TeamStandingsIndex",
            KeyConditionExpression = "GSI2PK = :gsi2pk AND begins_with(GSI2SK, :gsi2skPrefix)",
            ExpressionAttributeValues = new Dictionary<string, AttributeValue>
            {
                { ":gsi2pk", new AttributeValue { S = gsi2pk } },
                { ":gsi2skPrefix", new AttributeValue { S = gsi2skPrefix } }
            },
            ScanIndexForward = false // Descending order
        };

        var response = await _client.QueryAsync(request);

        return response.Items.Select(item => 
        {
            var sk = item["GSI2SK"].S;
            var parts = sk.Split('#');
            
            return new KudosSummary
            {
                League = league,
                Season = season,
                Division = division,
                ReceivingTeam = parts[0],
                MatchDateTime = parts.Length > 1 && long.TryParse(parts[1], out var dt) ? dt : 0,
                HomeTeam = parts.Length > 2 ? parts[2] : string.Empty,
                AwayTeam = parts.Length > 3 ? parts[3] : string.Empty,
                PositiveKudosCount = GetInt(item, "positive_kudos_count"),
                NeutralKudosCount = GetInt(item, "neutral_kudos_count"),
                NegativeKudosCount = GetInt(item, "negative_kudos_count")
            };
        }).ToList();
    }

    public async Task<List<KudosSummary>> RetrieveKudosAwardedToAllDivisionTeams(string league, string season, string division)
    {
        ValidateRetrieveKudosAwardedToAllDivisionTeamsParameters(league, season, division);

        var gsi2pk = $"{league}#{season}#{division}";
        var resultList = new List<KudosSummary>();
        Dictionary<string, AttributeValue>? lastKeyEvaluated = null;

        do
        {
            var request = new QueryRequest
            {
                TableName = _tableName,
                IndexName = "TeamStandingsIndex",
                KeyConditionExpression = "GSI2PK = :gsi2pk",
                ExpressionAttributeValues = new Dictionary<string, AttributeValue>
                {
                    { ":gsi2pk", new AttributeValue { S = gsi2pk } }
                },
                ScanIndexForward = true, 
                ExclusiveStartKey = lastKeyEvaluated
            };

            var response = await _client.QueryAsync(request);
            resultList.AddRange(response.Items.Select(item => 
            {
                var sk = item["GSI2SK"].S;
                var parts = sk.Split('#');
                
                return new KudosSummary
                {
                    League = league,
                    Season = season,
                    Division = division,
                    ReceivingTeam = parts[0],
                    MatchDateTime = parts.Length > 1 && long.TryParse(parts[1], out var dt) ? dt : 0,
                    HomeTeam = parts.Length > 2 ? parts[2] : string.Empty,
                    AwayTeam = parts.Length > 3 ? parts[3] : string.Empty,
                    PositiveKudosCount = GetInt(item, "positive_kudos_count"),
                    NeutralKudosCount = GetInt(item, "neutral_kudos_count"),
                    NegativeKudosCount = GetInt(item, "negative_kudos_count")
                };
            }));

            lastKeyEvaluated = response.LastEvaluatedKey;
        } while (lastKeyEvaluated != null && lastKeyEvaluated.Count > 0);

        return resultList;
    }


    private string GetString(Dictionary<string, AttributeValue> item, string key)
    {
        return item.TryGetValue(key, out var val) ? val.S : string.Empty;
    }

    private long GetLong(Dictionary<string, AttributeValue> item, string key)
    {
        return item.TryGetValue(key, out var val) && long.TryParse(val.N, out var result) ? result : 0;
    }

    private int GetInt(Dictionary<string, AttributeValue> item, string key)
    {
        return item.TryGetValue(key, out var val) && int.TryParse(val.N, out var result) ? result : 0;
    }

    private void ValidateRetrieveKudosGivenByPlayerParameters(string league, string season, string giverPersonSub, string division, string giverTeam)
    {
        var errors = new List<string>();

        if (string.IsNullOrWhiteSpace(league)) errors.Add($"{nameof(league)} is required");
        if (string.IsNullOrWhiteSpace(season)) errors.Add($"{nameof(season)} is required");
        if (string.IsNullOrWhiteSpace(division)) errors.Add($"{nameof(division)} is required");
        if (string.IsNullOrWhiteSpace(giverTeam)) errors.Add($"{nameof(giverTeam)} is required");
        if (string.IsNullOrWhiteSpace(giverPersonSub)) errors.Add($"{nameof(giverPersonSub)} is required");

        if (errors.Count > 0)
        {
            throw new ValidationException(errors);
        }
    }
    private void ValidateRetrieveKudosAwardedToTeamParameters(string league, string season, string division, string teamName)
    {
        var errors = new List<string>();

        if (string.IsNullOrWhiteSpace(league)) errors.Add($"{nameof(league)} is required");
        if (string.IsNullOrWhiteSpace(season)) errors.Add($"{nameof(season)} is required");
        if (string.IsNullOrWhiteSpace(division)) errors.Add($"{nameof(division)} is required");
        if (string.IsNullOrWhiteSpace(teamName)) errors.Add($"{nameof(teamName)} is required");

        if (errors.Count > 0)
        {
            throw new ValidationException(errors);
        }
    }

    private void ValidateRetrieveKudosAwardedToAllDivisionTeamsParameters(string league, string season, string division)
    {
        var errors = new List<string>();

        if (string.IsNullOrWhiteSpace(league)) errors.Add($"{nameof(league)} is required");
        if (string.IsNullOrWhiteSpace(season)) errors.Add($"{nameof(season)} is required");
        if (string.IsNullOrWhiteSpace(division)) errors.Add($"{nameof(division)} is required");

        if (errors.Count > 0)
        {
            throw new ValidationException(errors);
        }
    }

    public void Dispose()
    {
        _client?.Dispose();
    }
}

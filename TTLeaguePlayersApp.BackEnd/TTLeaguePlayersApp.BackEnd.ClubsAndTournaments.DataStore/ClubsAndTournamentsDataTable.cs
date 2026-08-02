using Amazon.DynamoDBv2;
using Amazon.DynamoDBv2.Model;

namespace TTLeaguePlayersApp.BackEnd.ClubsAndTournaments.DataStore;

public class ClubsAndTournamentsDataTable : IDisposable, IClubsAndTournamentsDataTable
{
    private readonly AmazonDynamoDBClient _client;
    private readonly string _tableName;

    private const string GsiName = "GSI1";
    private const string AllClubsPartitionKey = "ALL_CLUBS";

    public ClubsAndTournamentsDataTable(Uri? localDynamoDbServiceUrl, Amazon.RegionEndpoint? remoteDynamoDbRegion, string tablesNameSuffix)
    {
        _tableName = $"ttleague-clubs-tournaments-{tablesNameSuffix}";

        var clientConfig = localDynamoDbServiceUrl != null
            ? new AmazonDynamoDBConfig { ServiceURL = localDynamoDbServiceUrl.ToString() }
            : new AmazonDynamoDBConfig { RegionEndpoint = remoteDynamoDbRegion };

        _client = new AmazonDynamoDBClient(clientConfig);
    }

    // -------------------------------------------------------------------------
    // Club operations
    // -------------------------------------------------------------------------

    public async Task UpsertClubAsync(PromotableClub club)
    {
        ValidateClub(club);

        var pk = ClubPk(club.Location);
        var sk = ClubSk(club.ClubName);
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();

        var item = new Dictionary<string, AttributeValue>
        {
            ["PK"]        = Str(pk),
            ["SK"]        = Str(sk),
            ["GSI1PK"]    = Str(AllClubsPartitionKey),
            ["GSI1SK"]    = Str(ClubGsi1Sk(club.Location, club.ClubName)),
            ["location"]  = Str(club.Location),
            ["club_name"] = Str(club.ClubName),
            ["homepage"]  = Str(club.Homepage.ToString()),
            ["last_updated_at"] = Num(now),
        };

        SetOptional(item, "instagram", club.Instagram?.ToString());
        SetOptional(item, "facebook",  club.Facebook?.ToString());
        SetOptional(item, "youtube",   club.Youtube?.ToString());

        await _client.PutItemAsync(new PutItemRequest { TableName = _tableName, Item = item });
    }

    public async Task<PromotableClub> RetrieveClubAsync(string location, string clubName)
    {
        ValidateLocationAndClubName(location, clubName);

        var response = await _client.GetItemAsync(new GetItemRequest
        {
            TableName = _tableName,
            Key = new Dictionary<string, AttributeValue>
            {
                ["PK"] = Str(ClubPk(location)),
                ["SK"] = Str(ClubSk(clubName))
            }
        });

        if (!response.IsItemSet)
            throw new KeyNotFoundException($"Club '{clubName}' in '{location}' not found.");

        return MapClub(response.Item);
    }

    public async Task DeleteClubAsync(string location, string clubName)
    {
        ValidateLocationAndClubName(location, clubName);

        await _client.DeleteItemAsync(new DeleteItemRequest
        {
            TableName = _tableName,
            Key = new Dictionary<string, AttributeValue>
            {
                ["PK"] = Str(ClubPk(location)),
                ["SK"] = Str(ClubSk(clubName))
            }
        });
    }

    // -------------------------------------------------------------------------
    // Tournament operations
    // -------------------------------------------------------------------------

    public async Task UpsertTournamentAsync(Tournament tournament)
    {
        ValidateTournament(tournament);

        var pk = TournamentPk(tournament.Location, tournament.ClubName);
        var sk = TournamentSk(tournament.TournamentName);
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();

        var item = new Dictionary<string, AttributeValue>
        {
            ["PK"]              = Str(pk),
            ["SK"]              = Str(sk),
            ["GSI1PK"]          = Str(AllClubsPartitionKey),
            ["GSI1SK"]          = Str(TournamentGsi1Sk(tournament.Location, tournament.ClubName, tournament.StartDate)),
            ["location"]        = Str(tournament.Location),
            ["club_name"]       = Str(tournament.ClubName),
            ["tournament_name"] = Str(tournament.TournamentName),
            ["tournament_info"] = Str(tournament.TournamentInfo.ToString()),
            ["start_date"]      = Num(tournament.StartDate),
            ["end_date"]        = Num(tournament.EndDate),
            ["last_updated_at"] = Num(now),
        };

        SetOptional(item, "instagram", tournament.Instagram?.ToString());
        SetOptional(item, "facebook",  tournament.Facebook?.ToString());

        await _client.PutItemAsync(new PutItemRequest { TableName = _tableName, Item = item });
    }

    public async Task<Tournament> RetrieveTournamentAsync(string location, string clubName, string tournamentName)
    {
        ValidateLocationClubNameAndTournamentName(location, clubName, tournamentName);

        var response = await _client.GetItemAsync(new GetItemRequest
        {
            TableName = _tableName,
            Key = new Dictionary<string, AttributeValue>
            {
                ["PK"] = Str(TournamentPk(location, clubName)),
                ["SK"] = Str(TournamentSk(tournamentName))
            }
        });

        if (!response.IsItemSet)
            throw new KeyNotFoundException($"Tournament '{tournamentName}' for club '{clubName}' in '{location}' not found.");

        return MapTournament(response.Item);
    }

    public async Task DeleteTournamentAsync(string location, string clubName, string tournamentName)
    {
        ValidateLocationClubNameAndTournamentName(location, clubName, tournamentName);

        await _client.DeleteItemAsync(new DeleteItemRequest
        {
            TableName = _tableName,
            Key = new Dictionary<string, AttributeValue>
            {
                ["PK"] = Str(TournamentPk(location, clubName)),
                ["SK"] = Str(TournamentSk(tournamentName))
            }
        });
    }

    // Tournaments live under their own partition (LOC#{location}#CLUB#{clubName}), separate from
    // the Club item's partition (LOC#{location}). This returns a club's tournaments even when no
    // Club item was ever created — e.g. a manager who hasn't submitted the club profile yet.
    public async Task<List<Tournament>> RetrieveTournamentsForClubAsync(string location, string clubName)
    {
        ValidateLocationAndClubName(location, clubName);

        var items = await QueryMainTableByPkAsync(TournamentPk(location, clubName), skPrefix: "TOURN#");

        return items.Select(MapTournament).ToList();
    }

    // -------------------------------------------------------------------------
    // Read-heavy queries via GSI1
    // -------------------------------------------------------------------------

    public async Task<List<(ClubListing Club, List<Tournament> Tournaments)>> RetrieveAllClubsWithActiveTournamentsAsync(long now)
    {
        if (now <= 0) throw new ArgumentException("now must be a positive unix timestamp.", nameof(now));

        var items = await QueryGsi1Async(AllClubsPartitionKey, skPrefix: null);
        return GroupClubsWithActiveTournaments(items, now);
    }

    public async Task<List<(ClubListing Club, List<Tournament> Tournaments)>> RetrieveClubsWithActiveTournamentsByLocationAsync(string location, long now)
    {
        ValidateLocation(location);
        if (now <= 0) throw new ArgumentException("now must be a positive unix timestamp.", nameof(now));

        var items = await QueryGsi1Async(AllClubsPartitionKey, skPrefix: $"LOC#{location}#");
        return GroupClubsWithActiveTournaments(items, now);
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    private async Task<List<Dictionary<string, AttributeValue>>> QueryGsi1Async(string gsi1pk, string? skPrefix)
    {
        var expressionValues = new Dictionary<string, AttributeValue>
        {
            [":gsi1pk"] = Str(gsi1pk)
        };

        var keyCondition = "GSI1PK = :gsi1pk";
        if (skPrefix != null)
        {
            keyCondition += " AND begins_with(GSI1SK, :skPrefix)";
            expressionValues[":skPrefix"] = Str(skPrefix);
        }

        var results = new List<Dictionary<string, AttributeValue>>();
        Dictionary<string, AttributeValue>? lastKey = null;

        do
        {
            var request = new QueryRequest
            {
                TableName = _tableName,
                IndexName = GsiName,
                KeyConditionExpression = keyCondition,
                ExpressionAttributeValues = expressionValues,
                ScanIndexForward = true,
                ExclusiveStartKey = lastKey
            };

            var response = await _client.QueryAsync(request);
            results.AddRange(response.Items);
            lastKey = response.LastEvaluatedKey?.Count > 0 ? response.LastEvaluatedKey : null;
        }
        while (lastKey != null);

        return results;
    }

    private async Task<List<Dictionary<string, AttributeValue>>> QueryMainTableByPkAsync(string pk, string? skPrefix)
    {
        var expressionValues = new Dictionary<string, AttributeValue>
        {
            [":pk"] = Str(pk)
        };

        var keyCondition = "PK = :pk";
        if (skPrefix != null)
        {
            keyCondition += " AND begins_with(SK, :skPrefix)";
            expressionValues[":skPrefix"] = Str(skPrefix);
        }

        var results = new List<Dictionary<string, AttributeValue>>();
        Dictionary<string, AttributeValue>? lastKey = null;

        do
        {
            var request = new QueryRequest
            {
                TableName = _tableName,
                KeyConditionExpression = keyCondition,
                ExpressionAttributeValues = expressionValues,
                ConsistentRead = true,
                ScanIndexForward = true,
                ExclusiveStartKey = lastKey
            };

            var response = await _client.QueryAsync(request);
            results.AddRange(response.Items);
            lastKey = response.LastEvaluatedKey?.Count > 0 ? response.LastEvaluatedKey : null;
        }
        while (lastKey != null);

        return results;
    }

    // Groups by the location and club_name attributes carried by every item rather than by the order
    // items come back in. Index order cannot be relied on for this: a club with no CLUB# item (a manager
    // who added tournaments before submitting the club profile) has no entry to attach its tournaments
    // to, and GSI1SK sorts by byte order, where ' ' (0x20) < '#' (0x23), so the tournaments of a club
    // named "Rally" sort after the whole of "Rally Point".
    private static List<(ClubListing, List<Tournament>)> GroupClubsWithActiveTournaments(
        List<Dictionary<string, AttributeValue>> items, long now)
    {
        var groupsByClub = new Dictionary<(string Location, string ClubName), (ClubListing Club, List<Tournament> Tournaments)>();

        foreach (var item in items)
        {
            var key = (Location: item["location"].S, ClubName: item["club_name"].S);

            if (!groupsByClub.TryGetValue(key, out var group))
            {
                group = (new ClubListing { Location = key.Location, ClubName = key.ClubName }, new List<Tournament>());
                groupsByClub[key] = group;
            }

            var sk = item["SK"].S;

            if (sk.StartsWith("CLUB#"))
            {
                SetPromotionProfile(group.Club, item);
            }
            else if (sk.StartsWith("TOURN#"))
            {
                var tournament = MapTournament(item);
                if (tournament.EndDate >= now)
                    group.Tournaments.Add(tournament);
            }
        }

        // Grouping no longer depends on the order the items arrive in, so the ordering of the result is
        // stated here instead of being inherited from the index.
        foreach (var (_, tournaments) in groupsByClub.Values)
        {
            tournaments.Sort((left, right) => left.StartDate.CompareTo(right.StartDate));
        }

        return groupsByClub.Values
            .OrderBy(group => group.Club.Location, StringComparer.Ordinal)
            .ThenBy(group => group.Club.ClubName, StringComparer.Ordinal)
            .Select(group => (group.Club, group.Tournaments))
            .ToList();
    }

    private static void SetPromotionProfile(ClubListing club, Dictionary<string, AttributeValue> item)
    {
        club.Homepage  = GetOptionalUri(item, "homepage");
        club.Instagram = GetOptionalUri(item, "instagram");
        club.Facebook  = GetOptionalUri(item, "facebook");
        club.Youtube   = GetOptionalUri(item, "youtube");
    }

    private static PromotableClub MapClub(Dictionary<string, AttributeValue> item) => new PromotableClub
    {
        Location  = item["location"].S,
        ClubName  = item["club_name"].S,
        Homepage  = new Uri(item["homepage"].S),
        Instagram = GetOptionalUri(item, "instagram"),
        Facebook  = GetOptionalUri(item, "facebook"),
        Youtube   = GetOptionalUri(item, "youtube"),
        LastUpdatedAt = item.ContainsKey("last_updated_at") ? long.Parse(item["last_updated_at"].N) : 0,
    };

    private static Tournament MapTournament(Dictionary<string, AttributeValue> item) => new Tournament
    {
        Location       = item["location"].S,
        ClubName       = item["club_name"].S,
        TournamentName = item["tournament_name"].S,
        TournamentInfo = new Uri(item["tournament_info"].S),
        StartDate      = long.Parse(item["start_date"].N),
        EndDate        = long.Parse(item["end_date"].N),
        Instagram      = GetOptionalUri(item, "instagram"),
        Facebook       = GetOptionalUri(item, "facebook"),
        LastUpdatedAt  = item.ContainsKey("last_updated_at") ? long.Parse(item["last_updated_at"].N) : 0,
    };

    // Key helpers — single source of truth for key construction
    private static string ClubPk(string location)                              => $"LOC#{location}";
    private static string ClubSk(string clubName)                              => $"CLUB#{clubName}";
    private static string TournamentPk(string location, string clubName)       => $"LOC#{location}#CLUB#{clubName}";
    private static string TournamentSk(string tournamentName)                  => $"TOURN#{tournamentName}";
    private static string ClubGsi1Sk(string location, string clubName)         => $"LOC#{location}#CLUB#{clubName}";
    private static string TournamentGsi1Sk(string location, string clubName, long startDate)
                                                                               => $"LOC#{location}#CLUB#{clubName}#{startDate:D10}";

    private static AttributeValue Str(string value) => new AttributeValue { S = value };
    private static AttributeValue Num(long value)   => new AttributeValue { N = value.ToString() };

    private static void SetOptional(Dictionary<string, AttributeValue> item, string key, string? value)
    {
        if (value != null) item[key] = Str(value);
    }

    private static Uri? GetOptionalUri(Dictionary<string, AttributeValue> item, string key)
        => item.TryGetValue(key, out var v) ? new Uri(v.S) : null;

    // -------------------------------------------------------------------------
    // Validation
    // -------------------------------------------------------------------------

    private static void ValidateClub(PromotableClub club)
    {
        if (club == null) throw new ArgumentNullException(nameof(club));

        var errors = new List<string>();

        if (string.IsNullOrWhiteSpace(club.Location)) errors.Add($"{JsonFieldName.For<PromotableClub>(nameof(club.Location))} is required");
        if (string.IsNullOrWhiteSpace(club.ClubName)) errors.Add($"{JsonFieldName.For<PromotableClub>(nameof(club.ClubName))} is required");

        if (errors.Count > 0) throw new ValidationException(errors);
    }

    private static void ValidateTournament(Tournament tournament)
    {
        if (tournament == null) throw new ArgumentNullException(nameof(tournament));

        var errors = new List<string>();

        if (string.IsNullOrWhiteSpace(tournament.Location))       errors.Add($"{JsonFieldName.For<Tournament>(nameof(tournament.Location))} is required");
        if (string.IsNullOrWhiteSpace(tournament.ClubName))       errors.Add($"{JsonFieldName.For<Tournament>(nameof(tournament.ClubName))} is required");
        if (string.IsNullOrWhiteSpace(tournament.TournamentName)) errors.Add($"{JsonFieldName.For<Tournament>(nameof(tournament.TournamentName))} is required");
        if (tournament.StartDate <= 0) errors.Add($"{JsonFieldName.For<Tournament>(nameof(tournament.StartDate))} must be a positive unix timestamp");
        if (tournament.EndDate   <= 0) errors.Add($"{JsonFieldName.For<Tournament>(nameof(tournament.EndDate))} must be a positive unix timestamp");
        if (tournament.EndDate < tournament.StartDate) errors.Add($"{JsonFieldName.For<Tournament>(nameof(tournament.EndDate))} must be >= {JsonFieldName.For<Tournament>(nameof(tournament.StartDate))}");

        if (errors.Count > 0) throw new ValidationException(errors);
    }

    private static void ValidateLocation(string location)
    {
        var errors = new List<string>();
        if (string.IsNullOrWhiteSpace(location)) errors.Add("location is required");
        if (errors.Count > 0) throw new ValidationException(errors);
    }

    private static void ValidateLocationAndClubName(string location, string clubName)
    {
        var errors = new List<string>();
        if (string.IsNullOrWhiteSpace(location)) errors.Add("location is required");
        if (string.IsNullOrWhiteSpace(clubName)) errors.Add("club_name is required");
        if (errors.Count > 0) throw new ValidationException(errors);
    }

    private static void ValidateLocationClubNameAndTournamentName(string location, string clubName, string tournamentName)
    {
        var errors = new List<string>();
        if (string.IsNullOrWhiteSpace(location))       errors.Add("location is required");
        if (string.IsNullOrWhiteSpace(clubName))       errors.Add("club_name is required");
        if (string.IsNullOrWhiteSpace(tournamentName)) errors.Add("tournament_name is required");
        if (errors.Count > 0) throw new ValidationException(errors);
    }

    public void Dispose() => _client?.Dispose();
}

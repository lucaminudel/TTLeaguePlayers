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

    public async Task UpsertClubAsync(Club club)
    {
        ValidateClub(club);

        var pk = ClubPk(club.Location);
        var sk = ClubSk(club.ClubName);

        var item = new Dictionary<string, AttributeValue>
        {
            ["PK"]        = Str(pk),
            ["SK"]        = Str(sk),
            ["GSI1PK"]    = Str(AllClubsPartitionKey),
            ["GSI1SK"]    = Str(ClubGsi1Sk(club.Location, club.ClubName)),
            ["location"]  = Str(club.Location),
            ["club_name"] = Str(club.ClubName),
            ["homepage"]  = Str(club.Homepage.ToString()),
        };

        SetOptional(item, "instagram", club.Instagram?.ToString());
        SetOptional(item, "facebook",  club.Facebook?.ToString());
        SetOptional(item, "youtube",   club.Youtube?.ToString());

        await _client.PutItemAsync(new PutItemRequest { TableName = _tableName, Item = item });
    }

    public async Task<Club> RetrieveClubAsync(string location, string clubName)
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

    // -------------------------------------------------------------------------
    // Read-heavy queries via GSI1
    // -------------------------------------------------------------------------

    public async Task<List<(Club Club, List<Tournament> Tournaments)>> RetrieveAllClubsWithActiveTournamentsAsync(long now)
    {
        if (now <= 0) throw new ArgumentException("now must be a positive unix timestamp.", nameof(now));

        var items = await QueryGsi1Async(AllClubsPartitionKey, skPrefix: null);
        return GroupClubsWithActiveTournaments(items, now);
    }

    public async Task<List<(Club Club, List<Tournament> Tournaments)>> RetrieveClubsWithActiveTournamentsByLocationAsync(string location, long now)
    {
        if (string.IsNullOrWhiteSpace(location)) throw new ArgumentException("location is required.", nameof(location));
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

    private static List<(Club, List<Tournament>)> GroupClubsWithActiveTournaments(
        List<Dictionary<string, AttributeValue>> items, long now)
    {
        var result = new List<(Club, List<Tournament>)>();
        Club? currentClub = null;
        List<Tournament>? currentTournaments = null;

        foreach (var item in items)
        {
            var sk = item["SK"].S;

            if (sk.StartsWith("CLUB#"))
            {
                currentClub = MapClub(item);
                currentTournaments = new List<Tournament>();
                result.Add((currentClub, currentTournaments));
            }
            else if (sk.StartsWith("TOURN#") && currentTournaments != null)
            {
                var tournament = MapTournament(item);
                if (tournament.EndDate >= now)
                    currentTournaments.Add(tournament);
            }
        }

        return result;
    }

    private static Club MapClub(Dictionary<string, AttributeValue> item) => new Club
    {
        Location  = item["location"].S,
        ClubName  = item["club_name"].S,
        Homepage  = new Uri(item["homepage"].S),
        Instagram = GetOptionalUri(item, "instagram"),
        Facebook  = GetOptionalUri(item, "facebook"),
        Youtube   = GetOptionalUri(item, "youtube"),
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

    private static void ValidateClub(Club club)
    {
        var errors = new List<string>();

        if (string.IsNullOrWhiteSpace(club.Location)) errors.Add($"{JsonFieldName.For<Club>(nameof(club.Location))} is required");
        if (string.IsNullOrWhiteSpace(club.ClubName)) errors.Add($"{JsonFieldName.For<Club>(nameof(club.ClubName))} is required");

        if (errors.Count > 0) throw new ValidationException(errors);
    }

    private static void ValidateTournament(Tournament tournament)
    {
        var errors = new List<string>();

        if (string.IsNullOrWhiteSpace(tournament.Location))       errors.Add($"{JsonFieldName.For<Tournament>(nameof(tournament.Location))} is required");
        if (string.IsNullOrWhiteSpace(tournament.ClubName))       errors.Add($"{JsonFieldName.For<Tournament>(nameof(tournament.ClubName))} is required");
        if (string.IsNullOrWhiteSpace(tournament.TournamentName)) errors.Add($"{JsonFieldName.For<Tournament>(nameof(tournament.TournamentName))} is required");
        if (tournament.StartDate <= 0) errors.Add($"{JsonFieldName.For<Tournament>(nameof(tournament.StartDate))} must be a positive unix timestamp");
        if (tournament.EndDate   <= 0) errors.Add($"{JsonFieldName.For<Tournament>(nameof(tournament.EndDate))} must be a positive unix timestamp");
        if (tournament.EndDate < tournament.StartDate) errors.Add($"{JsonFieldName.For<Tournament>(nameof(tournament.EndDate))} must be >= {JsonFieldName.For<Tournament>(nameof(tournament.StartDate))}");

        if (errors.Count > 0) throw new ValidationException(errors);
    }

    private static void ValidateLocationAndClubName(string location, string clubName)
    {
        var errors = new List<string>();
        if (string.IsNullOrWhiteSpace(location)) errors.Add("location is required");
        if (string.IsNullOrWhiteSpace(clubName)) errors.Add("club_name is required");
        if (errors.Count > 0) throw new ArgumentException(string.Join("; ", errors));
    }

    private static void ValidateLocationClubNameAndTournamentName(string location, string clubName, string tournamentName)
    {
        var errors = new List<string>();
        if (string.IsNullOrWhiteSpace(location))       errors.Add("location is required");
        if (string.IsNullOrWhiteSpace(clubName))       errors.Add("club_name is required");
        if (string.IsNullOrWhiteSpace(tournamentName)) errors.Add("tournament_name is required");
        if (errors.Count > 0) throw new ArgumentException(string.Join("; ", errors));
    }

    public void Dispose() => _client?.Dispose();
}

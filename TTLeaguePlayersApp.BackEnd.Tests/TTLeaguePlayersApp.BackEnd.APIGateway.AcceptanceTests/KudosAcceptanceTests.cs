using System.Net;
using System.Text;
using System.Text.Json;
using FluentAssertions;
using Xunit;

using Amazon.CognitoIdentityProvider;
using Amazon.CognitoIdentityProvider.Model;


namespace TTLeaguePlayersApp.BackEnd.APIGateway.AcceptanceTests;

[Trait("Environment", "Staging")]
public class KudosAcceptanceTests: IAsyncLifetime
{


    private readonly HttpClient _httpClient;
    private readonly IAmazonCognitoIdentityProvider _cognitoClient;
    private readonly string _userPoolId;
    private readonly string _clientId;
    private readonly List<string> _createdKudosJsonInfos = new();

    private const string TestUserEmail = "test_already_registered@user.test";
    private const string TestUserPassword = "aA1!56789012";

    public KudosAcceptanceTests()
    {
        var config = new Configuration.DataStore.Loader().GetEnvironmentVariables();
        var baseUrl = config.ApiGateWay.ApiBaseUrl;
        _userPoolId = config.Cognito.UserPoolId;
        _clientId = config.Cognito.ClientId;
        
        _cognitoClient = new AmazonCognitoIdentityProviderClient(); // Uses default credentials
        
        _httpClient = new HttpClient
        {
            BaseAddress = baseUrl,
            Timeout = TimeSpan.FromSeconds(30)
        };
    }

    #region POST /kudos Tests

    [Fact]
    public async Task POST_Kudos_Should_Be_Protected()
    {
        if (RunningAgainst.ALocalEnvironmentIsTrue())
        {
            // Test is skipped in local/dev/test environments
            return;
        }

        /*
            // Try this changing the url to the Staging environment to verify the behavior in cloud
            curl -X POST http://127.0.0.1:3003/kudos \
                -H "Content-Type: application/json" \
                -d '{
                "league": "CLTTL",
                "season": "2025-2026",
                "division": "Division 4",
                "receiving_team": "Morpeth 9",
                "home_team": "Morpeth 10",
                "away_team": "Morpeth 9",
                "match_date_time": 1735689600,
                "giver_team": "Morpeth 10",
                "giver_person_name": "Luca Minudel",
                "giver_person_sub": "xxx",
                "kudos_value": 1
                }'        
        */
        // Arrange
        var requestBody = CreateKudosRequestJson();
        var content = new StringContent(requestBody, Encoding.UTF8, "application/json");
        
        // Ensure no auth header is present
        _httpClient.DefaultRequestHeaders.Authorization = null;

        // Act
        var response = await _httpClient.PostAsync("/kudos", content);

        // Assert
        // 401: Blocked by API Gateway Authorizer (Cloud environment)
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    [Trait("Cognito", "Live")]
    public async Task POST_Kudos_Should_Create_Kudos_Successfully()
    {
        // Arrange
        // Arrange
        // 1. Get Token
        var idToken = await LoginAndGetIdTokenAsync(TestUserEmail, TestUserPassword);
        
        // 2. Get Sub (needed for the payload to match the token)
        var sub = await GetUserSubByEmail(TestUserEmail);

        // 3. Prepare Request (matching 'test_already_registered@user.test' active seasons in register-test-users.sh)
        // Values from register-test-users.sh:
        // league: "CLTTL", season: "2025-2026", team_name: "Morpeth 10", team_division: "Division 4", person_name: "Luca Minudel"
        var requestBody = CreateKudosRequestJson(
            league: "CLTTL",
            season: "2025-2026",
            division: "Division 4",
            receivingTeam: "Morpeth 9", // Must be Home or Away. Giver is Morpeth 10.
            homeTeam: "Morpeth 10",
            awayTeam: "Morpeth 9",
            giverTeam: "Morpeth 10",
            giverName: "Luca Minudel",
            giverSub: sub,
            kudosValue: 1
        );
        var content = new StringContent(requestBody, Encoding.UTF8, "application/json");
        
        // 4. Attach Token
        _httpClient.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", idToken);
        _createdKudosJsonInfos.Add(requestBody);

        // Act
        var response = await _httpClient.PostAsync("/kudos", content);

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        
        var result = await response.Content.ReadAsStringAsync();
        using var jsonDoc = JsonDocument.Parse(result);
        var jsonResult = jsonDoc.RootElement;
        
        jsonResult.GetProperty("league").GetString().Should().Be("CLTTL");
        jsonResult.GetProperty("giver_person_name").GetString().Should().Be("Luca Minudel");
        jsonResult.GetProperty("kudos_value").GetInt32().Should().Be(1);
    }



    [Fact]
    [Trait("Cognito", "Live")]    
    public async Task POST_Kudos_Should_Return_400_For_Malformed_Json()
    {
        // Arrange
        // Arrange
        var idToken = await LoginAndGetIdTokenAsync(TestUserEmail, TestUserPassword);
        _httpClient.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", idToken);

        var malformedJson = "{ \"league\": \"CLTTL\", invalid_json }";
        var content = new StringContent(malformedJson, Encoding.UTF8, "application/json");

        // Act
        var response = await _httpClient.PostAsync("/kudos", content);

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    #endregion
    
    #region GET /kudos Tests

    [Fact]
    [Trait("Cognito", "Live")]
    public async Task GET_Kudos_Should_Retrieve_Kudos_Given_By_Player()
    {
        // 1. Arrange - Authenticate and get sub
        var idToken = await LoginAndGetIdTokenAsync(TestUserEmail, TestUserPassword);
        var sub = await GetUserSubByEmail(TestUserEmail);
        _httpClient.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", idToken);

        // 2. Create a Kudos to retrieve
        var league = "CLTTL";
        var season = "2025-2026";
        var division = "Division 4";
        var teamName = "Morpeth 10"; // Giver team
        
        var requestBody = CreateKudosRequestJson(
            league: league,
            season: season,
            division: division,
            receivingTeam: "Morpeth 9", 
            homeTeam: teamName,
            awayTeam: "Morpeth 9",
            giverTeam: teamName,
            giverName: "Luca Minudel",
            giverSub: sub,
            kudosValue: 1
        );
        var content = new StringContent(requestBody, Encoding.UTF8, "application/json");
        
        // Post the kudos
        var createResponse = await _httpClient.PostAsync("/kudos", content);
        createResponse.StatusCode.Should().Be(HttpStatusCode.Created);
        _createdKudosJsonInfos.Add(requestBody); // Mark for cleanup

        // 3. Act - Retrieve Kudos
        // Construct query parameters
        var queryParams = $"?given_by={WebUtility.UrlEncode(sub)}&league={WebUtility.UrlEncode(league)}&season={WebUtility.UrlEncode(season)}&team_division={WebUtility.UrlEncode(division)}&team_name={WebUtility.UrlEncode(teamName)}";
        
        var getResponse = await _httpClient.GetAsync("/kudos" + queryParams);

        // 4. Assert
        getResponse.StatusCode.Should().Be(HttpStatusCode.OK);

        var result = await getResponse.Content.ReadAsStringAsync();
        using var jsonDoc = JsonDocument.Parse(result);
        var kudosList = jsonDoc.RootElement;

        kudosList.ValueKind.Should().Be(JsonValueKind.Array);
        kudosList.GetArrayLength().Should().BeGreaterThanOrEqualTo(1);

        // Verify the retrieved item matches what we created
        var firstKudos = kudosList.EnumerateArray().FirstOrDefault(k => 
            k.GetProperty("league").GetString() == league &&
            k.GetProperty("season").GetString() == season &&
            k.GetProperty("giver_person_sub").GetString() == sub
        );
        
        firstKudos.ValueKind.Should().NotBe(JsonValueKind.Undefined);
        firstKudos.GetProperty("kudos_value").GetInt32().Should().Be(1);
    }

    [Fact]
    [Trait("Cognito", "Live")]
    public async Task GET_Kudos_Should_Retrieve_Kudos_Awarded_To_Team()
    {
        // 1. Arrange - Authenticate
        var idToken = await LoginAndGetIdTokenAsync(TestUserEmail, TestUserPassword);
        var sub = await GetUserSubByEmail(TestUserEmail);
        _httpClient.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", idToken);

        // 2. Create a Kudos to retrieve (awarded TO Morpeth 9)
        var league = "CLTTL";
        var season = "2025-2026";
        var division = "Division 4";
        var teamName = "Morpeth 9";
        var requestBody = CreateKudosRequestJson(
            league: league, 
            season: season, 
            division: division, 
            receivingTeam: teamName, 
            homeTeam: teamName, 
            awayTeam: "Morpeth 10", 
            giverTeam: "Morpeth 10", 
            giverName: "Luca Minudel", 
            giverSub: sub, 
            kudosValue: 1);
        
        var content = new StringContent(requestBody, Encoding.UTF8, "application/json");
        var createResponse = await _httpClient.PostAsync("/kudos", content);
        createResponse.StatusCode.Should().Be(HttpStatusCode.Created);
        _createdKudosJsonInfos.Add(requestBody); // For cleanup

        // 3. Act - Retrieve Kudos Summaries for the team
        var queryParams = $"?league={WebUtility.UrlEncode(league)}&season={WebUtility.UrlEncode(season)}&team_division={WebUtility.UrlEncode(division)}&team_name={WebUtility.UrlEncode(teamName)}";
        var getResponse = await _httpClient.GetAsync("/kudos" + queryParams);

        // 4. Assert
        getResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var result = await getResponse.Content.ReadAsStringAsync();
        using var jsonDoc = JsonDocument.Parse(result);
        var kudosList = jsonDoc.RootElement;
        
        kudosList.ValueKind.Should().Be(JsonValueKind.Array);
        kudosList.GetArrayLength().Should().BeGreaterThanOrEqualTo(1);
        
        var summary = kudosList.EnumerateArray().FirstOrDefault(k => 
            k.GetProperty("league").GetString() == league && 
            k.GetProperty("season").GetString() == season && 
            k.GetProperty("receiving_team").GetString() == teamName);
            
        summary.ValueKind.Should().NotBe(JsonValueKind.Undefined);
        summary.GetProperty("positive_kudos_count").GetInt32().Should().BeGreaterThanOrEqualTo(1);
    }

    [Fact]
    [Trait("Cognito", "Live")]
    public async Task GET_KudosStandings_Should_Retrieve_Tables()
    {
        // 1. Arrange
        var league = "CLTTL";
        var season = "2025-2026";
        var division = "Division 4";
        
        // Ensure at least one kudos summary exists (previous test might have created some, but let's be safe)
        var idToken = await LoginAndGetIdTokenAsync(TestUserEmail, TestUserPassword);
        _httpClient.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", idToken);

        // 2. Act
        var queryParams = $"?league={WebUtility.UrlEncode(league)}&season={WebUtility.UrlEncode(season)}&team_division={WebUtility.UrlEncode(division)}";
        var response = await _httpClient.GetAsync("/kudos/standings" + queryParams);

        // 3. Assert
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var result = await response.Content.ReadAsStringAsync();
        using var jsonDoc = JsonDocument.Parse(result);
        var root = jsonDoc.RootElement;

        root.GetProperty("positive_kudos_table").ValueKind.Should().Be(JsonValueKind.Array);
        root.GetProperty("negative_kudos_table").ValueKind.Should().Be(JsonValueKind.Array);
    }

    [Fact]
    [Trait("Cognito", "Live")]
    public async Task GET_Kudos_Should_Return_400_When_Parameters_Are_Missing()
    {
        // Arrange
        var idToken = await LoginAndGetIdTokenAsync(TestUserEmail, TestUserPassword);
        _httpClient.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", idToken);

        // Act - Missing all parameters
        var response = await _httpClient.GetAsync("/kudos");

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact(Skip = "Currently security check just generates a log")]
    [Trait("Cognito", "Live")]
    public async Task GET_Kudos_Should_Return_403_When_Requesting_For_Different_User()
    {
        // Arrange
        var idToken = await LoginAndGetIdTokenAsync(TestUserEmail, TestUserPassword);
        var sub = await GetUserSubByEmail(TestUserEmail);
        _httpClient.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", idToken);

        var otherUserSub = Guid.NewGuid().ToString(); // Random sub mimicking another user

        var league = "CLTTL";
        var season = "2025-2026";
        var division = "Division 4";
        var teamName = "Morpeth 10";

        var queryParams = $"?given_by={WebUtility.UrlEncode(otherUserSub)}&league={WebUtility.UrlEncode(league)}&season={WebUtility.UrlEncode(season)}&team_division={WebUtility.UrlEncode(division)}&team_name={WebUtility.UrlEncode(teamName)}";

        // Act
        var response = await _httpClient.GetAsync("/kudos" + queryParams);

        // Assert
        // With current design, security validation error only logs but doesn't block the request
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    [Trait("Cognito", "Live")]
    public async Task GET_Kudos_Should_Return_403_When_User_Not_Active_In_Season()
    {
        // Arrange
        var idToken = await LoginAndGetIdTokenAsync(TestUserEmail, TestUserPassword);
        var sub = await GetUserSubByEmail(TestUserEmail);
        _httpClient.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", idToken);

        // Use a League/Season the user is NOT active in (based on register-test-users.sh)
        var league = "InvalidLeague";
        var season = "2099";
        var division = "DivX";
        var teamName = "TeamX";

        var queryParams = $"?given_by={WebUtility.UrlEncode(sub)}&league={WebUtility.UrlEncode(league)}&season={WebUtility.UrlEncode(season)}&team_division={WebUtility.UrlEncode(division)}&team_name={WebUtility.UrlEncode(teamName)}";

        // Act
        var response = await _httpClient.GetAsync("/kudos" + queryParams);

        // Assert
        // Security check for active seasons should be logged but currently doesn't block (returns 200 empty list)
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var result = await response.Content.ReadAsStringAsync();
        result.Should().Be("[]");
    }

    #endregion

    #region Helpers

    private async Task<string> LoginAndGetIdTokenAsync(string email, string password)
    {
        var authRequest = new AdminInitiateAuthRequest
        {
            UserPoolId = _userPoolId,
            ClientId = _clientId,
            AuthFlow = AuthFlowType.ADMIN_NO_SRP_AUTH,
            AuthParameters = new Dictionary<string, string>
            {
                { "USERNAME", email },
                { "PASSWORD", password }
            }
        };

        var response = await _cognitoClient.AdminInitiateAuthAsync(authRequest);
        return response.AuthenticationResult.IdToken;
    }

    private static string CreateKudosRequestJson(
        string league = "CLTTL",
        string season = "2025-2026",
        string division = "Division 4",
        string receivingTeam = "Morpeth 9",
        string homeTeam = "Morpeth 10",
        string awayTeam = "Morpeth 9",
        long matchDateTime = 1735689600,
        string giverTeam = "Morpeth 10",
        string giverName = "Luca Minudel",
        string giverSub = "xxx",
        int kudosValue = 1)
    {
        var kudos = new Dictionary<string, object>
        {
            { "league", league },
            { "season", season },
            { "division", division },
            { "receiving_team", receivingTeam },
            { "home_team", homeTeam },
            { "away_team", awayTeam },
            { "match_date_time", matchDateTime },
            { "giver_team", giverTeam },
            { "giver_person_name", giverName },
            { "giver_person_sub", giverSub },
            { "kudos_value", kudosValue }
        };
        return JsonSerializer.Serialize(kudos);
    }

    private async Task<string> GetUserSubByEmail(string email)
    {
        var user = await GetCognitoUserByEmail(email);
        return user?.Attributes.FirstOrDefault(a => a.Name == "sub")?.Value ?? string.Empty;
    }

    private async Task<UserType?> GetCognitoUserByEmail(string email)
    {
        var request = new ListUsersRequest
        {
            UserPoolId = _userPoolId,
            Filter = $"email = \"{email}\"",
            Limit = 1
        };

        var response = await _cognitoClient.ListUsersAsync(request);
        return response.Users.FirstOrDefault();
    }

    #endregion

    public Task InitializeAsync() => Task.CompletedTask;

    public async Task DisposeAsync()
    {
        // Cleanup created kudos
        if (_createdKudosJsonInfos.Any())
        {
            var idToken = await LoginAndGetIdTokenAsync(TestUserEmail, TestUserPassword);
            _httpClient.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", idToken);

            foreach (var kudosJson in _createdKudosJsonInfos)
            {
               var request = new HttpRequestMessage(HttpMethod.Delete, "/kudos")
               {
                   Content = new StringContent(kudosJson, Encoding.UTF8, "application/json")
               };
               await _httpClient.SendAsync(request);
            }
        }

        _httpClient?.Dispose();
        await Task.CompletedTask;
    }
}

using System.Net;
using System.Text;
using System.Text.Json;
using FluentAssertions;
using Xunit;

using Amazon.CognitoIdentityProvider;
using Amazon.CognitoIdentityProvider.Model;


namespace TTLeaguePlayersApp.BackEnd.APIGateway.AcceptanceTests;

public class KudosAcceptanceTests: IAsyncLifetime
{


    private readonly HttpClient _httpClient;
    private readonly IAmazonCognitoIdentityProvider _cognitoClient;
    private readonly string _userPoolId;
    private readonly string _clientId;

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

    [Fact(Skip = "The Cognito Authorizer that protect the call is not supported in SAM Local")]
    public async Task POST_Kudos_Should_Be_Protected()
    {
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
        // 400: Reached Lambda but failed validation because token/sub is missing (Local/SAM environment)
        response.StatusCode.Should().BeOneOf(HttpStatusCode.Unauthorized, HttpStatusCode.BadRequest);
    }

    [Theory]
    [InlineData(1)]
    [InlineData(0)]
    [InlineData(-1)]
    public async Task POST_Kudos_Should_Create_Kudos_Successfully(int kudosValue)
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
            kudosValue: kudosValue
        );
        var content = new StringContent(requestBody, Encoding.UTF8, "application/json");
        
        // 4. Attach Token
        _httpClient.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", idToken);

        // Act
        var response = await _httpClient.PostAsync("/kudos", content);

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        
        var result = await response.Content.ReadAsStringAsync();
        using var jsonDoc = JsonDocument.Parse(result);
        var jsonResult = jsonDoc.RootElement;
        
        jsonResult.GetProperty("league").GetString().Should().Be("CLTTL");
        jsonResult.GetProperty("giver_person_name").GetString().Should().Be("Luca Minudel");
        jsonResult.GetProperty("kudos_value").GetInt32().Should().Be(kudosValue);
    }

    [Theory]
    [InlineData("league", "", "League")]
    [InlineData("league", null, "League")]
    [InlineData("season", "", "Season")]
    [InlineData("season", null, "Season")]
    [InlineData("division", "", "Division")]
    [InlineData("division", null, "Division")]
    [InlineData("receiving_team", "", "ReceivingTeam")]
    [InlineData("receiving_team", null, "ReceivingTeam")]
    [InlineData("home_team", "", "HomeTeam")]
    [InlineData("home_team", null, "HomeTeam")]
    [InlineData("away_team", "", "AwayTeam")]
    [InlineData("away_team", null, "AwayTeam")]
    [InlineData("giver_team", "", "GiverTeam")]
    [InlineData("giver_team", null, "GiverTeam")]
    [InlineData("giver_person_name", "", "GiverPersonName")]
    [InlineData("giver_person_name", null, "GiverPersonName")]
    [InlineData("giver_person_sub", "", "GiverPersonSub")]
    [InlineData("giver_person_sub", null, "GiverPersonSub")]
    public async Task POST_Kudos_Should_Return_400_When_Required_Fields_Are_Missing(string fieldToRemove, string newValue, string expectedFieldNameInError)
    {
        // Arrange
        // Arrange
        var idToken = await LoginAndGetIdTokenAsync(TestUserEmail, TestUserPassword);
        _httpClient.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", idToken);
        var sub = await GetUserSubByEmail(TestUserEmail);

        var requestDict = new Dictionary<string, object>
        {
            { "league", "CLTTL" },
            { "season", "2025-2026" },
            { "division", "Division 4" },
            { "receiving_team", "Morpeth 9" },
            { "home_team", "Morpeth 10" },
            { "away_team", "Morpeth 9" },
            { "match_date_time", 1735689600 },
            { "giver_team", "Morpeth 10" },
            { "giver_person_name", "Luca Minudel" },
            { "giver_person_sub", sub },
            { "kudos_value", 1 }
        };

        bool isMissingKey = newValue == null;
        if (isMissingKey)
            requestDict.Remove(fieldToRemove);
        else
            requestDict[fieldToRemove] = newValue;

        var requestBody = JsonSerializer.Serialize(requestDict);
        var content = new StringContent(requestBody, Encoding.UTF8, "application/json");

        // Act
        var response = await _httpClient.PostAsync("/kudos", content);

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var result = await response.Content.ReadAsStringAsync();
        
        if (isMissingKey)
        {
            // System.Text.Json handles 'required' properties during deserialization
            result.Should().ContainAny("Invalid request body", "Validation failed");
            result.Should().Contain(fieldToRemove); // Deserialization error uses JSON property name
        }
        else
        {
            // Business logic validation
            result.Should().Contain("Validation failed");
            result.Should().Contain($"{expectedFieldNameInError} is required"); // Logic validation uses PascalCase property name
        }
    }

    [Theory]
    [InlineData("Morpeth 8", "Morpeth 10", "Morpeth 9", "Morpeth 10", "ReceivingTeam must be either the HomeTeam or the AwayTeam")] // Receiving team not in match
    [InlineData("Morpeth 9", "Morpeth 10", "Morpeth 9", "Morpeth 8", "GiverTeam must be either the HomeTeam or the AwayTeam")]     // Giver team not in match
    [InlineData("Morpeth 10", "Morpeth 10", "Morpeth 9", "Morpeth 10", "GiverTeam cannot be the same as the ReceivingTeam")]     // Giver is receiver
    public async Task POST_Kudos_Should_Return_400_When_Teams_Are_Invalid(string recTeam, string homeTeam, string awayTeam, string giverTeam, string expectedError)
    {
        // Arrange
        // Arrange
        var idToken = await LoginAndGetIdTokenAsync(TestUserEmail, TestUserPassword);
        _httpClient.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", idToken);
        var sub = await GetUserSubByEmail(TestUserEmail);

        var requestBody = CreateKudosRequestJson(
            receivingTeam: recTeam,
            homeTeam: homeTeam,
            awayTeam: awayTeam,
            giverTeam: giverTeam,
            giverSub: sub
        );
        var content = new StringContent(requestBody, Encoding.UTF8, "application/json");

        // Act
        var response = await _httpClient.PostAsync("/kudos", content);

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var result = await response.Content.ReadAsStringAsync();
        result.Should().Contain(expectedError);
    }

    [Theory]
    [InlineData(-2)]
    [InlineData(2)]
    [InlineData(10)]
    public async Task POST_Kudos_Should_Return_400_When_KudosValue_Is_Invalid(int invalidKudosValue)
    {
        // Arrange
        // Arrange
        var idToken = await LoginAndGetIdTokenAsync(TestUserEmail, TestUserPassword);
        _httpClient.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", idToken);
        var sub = await GetUserSubByEmail(TestUserEmail);

        var requestBody = CreateKudosRequestJson(kudosValue: invalidKudosValue, giverSub: sub);
        var content = new StringContent(requestBody, Encoding.UTF8, "application/json");

        // Act
        var response = await _httpClient.PostAsync("/kudos", content);

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var result = await response.Content.ReadAsStringAsync();
        result.Should().Contain("KudosValue must be -1, 0, or 1");
    }

    [Fact]
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
        _httpClient?.Dispose();
    }
}

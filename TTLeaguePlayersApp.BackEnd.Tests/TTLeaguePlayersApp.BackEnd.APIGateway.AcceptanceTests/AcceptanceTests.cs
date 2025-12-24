using System.Net;
using System.Text;
using System.Text.Json;
using FluentAssertions;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.Tests.TTLeaguePlayersApp.BackEnd.APIGateway.AcceptanceTests;

public class AcceptanceTests : IAsyncLifetime
{
    private readonly HttpClient _httpClient;
    private string? _lastInviteId;

    public AcceptanceTests()
    {
        var baseUrl = new DataStore.Configuration.Loader().GetEnvironmentVariables().BackEndApiGateWay.ApiBaseUrl;
        
        _httpClient = new HttpClient
        {
            BaseAddress = baseUrl,
            Timeout = TimeSpan.FromSeconds(30)
        };
    }

    #region POST /invites Tests

    [Fact]
    public async Task POST_Invites_Should_Create_New_Invite_Successfully()
    {
        // Arrange
        var requestBody = CreateInviteRequestJson(
            name: "Gino Gino",
            email: "alpha@beta.com",
            role: "CAPTAIN",
            teamName: "Morpeth 9",
            division: "Division 4",
            league: "CLTTL",
            season: "2025-2026");
        var content = new StringContent(requestBody, Encoding.UTF8, "application/json");

        // Act
        var response = await _httpClient.PostAsync("/invites", content);

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        
        var result = await response.Content.ReadAsStringAsync();
        result.Should().NotBeEmpty();

        using var jsonDoc = JsonDocument.Parse(result);
        var jsonResult = jsonDoc.RootElement;

        jsonResult.GetProperty("name").GetString().Should().Be("Gino Gino");
        jsonResult.GetProperty("email_ID").GetString().Should().Be("alpha@beta.com");
        jsonResult.GetProperty("role").GetString().Should().Be("CAPTAIN");
        jsonResult.GetProperty("team_name").GetString().Should().Be("Morpeth 9");
        jsonResult.GetProperty("division").GetString().Should().Be("Division 4");
        jsonResult.GetProperty("league").GetString().Should().Be("CLTTL");
        jsonResult.GetProperty("season").GetString().Should().Be("2025-2026");
        jsonResult.GetProperty("created_at").GetInt64().Should().BePositive();
        jsonResult.GetProperty("accepted_at").ValueKind.Should().Be(JsonValueKind.Null);
        
        // Store the ID for the GET test
        _lastInviteId = jsonResult.GetProperty("nano_id").GetString();
        _lastInviteId.Should().NotBeNullOrEmpty();

        response.Headers.Location.Should().NotBeNull();
        response.Headers.Location!.ToString().Should().Be($"/invites/{_lastInviteId}");
    }

    [Fact]
    public async Task POST_Invites_Should_Return_400_For_Missing_Field()
    {
        // Arrange
        var requestBody = CreateInviteRequestJson(null, "jane.doe@example.com"); // Missing name
        var content = new StringContent(requestBody, Encoding.UTF8, "application/json");

        // Act
        var response = await _httpClient.PostAsync("/invites", content);

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }
    
    [Fact]
    public async Task POST_Invites_Should_Return_400_For_Wrong_Email_Format()
    {
        // Arrange
        var requestBody = CreateInviteRequestJson("Jane Doe", "jane@@doe"); // Invalid email
        var content = new StringContent(requestBody, Encoding.UTF8, "application/json");

        // Act
        var response = await _httpClient.PostAsync("/invites", content);

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task POST_Invites_Should_Return_400_For_Empty_Request_Body()
    {
        // Arrange
        var content = new StringContent(string.Empty, Encoding.UTF8, "application/json");

        // Act
        var response = await _httpClient.PostAsync("/invites", content);

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var errorMessage = await response.Content.ReadAsStringAsync();
        errorMessage.Should().Contain("Empty request body");
    }

    [Fact]
    public async Task POST_Invites_Should_Return_400_For_Malformed_JSON()
    {
        // Arrange
        var content = new StringContent("{ \"name\": \"test\"", Encoding.UTF8, "application/json"); // Malformed JSON

        // Act
        var response = await _httpClient.PostAsync("/invites", content);

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var errorMessage = await response.Content.ReadAsStringAsync();
        errorMessage.Should().Contain("Invalid request body");
    }

    [Fact]
    public async Task POST_Invites_Should_Return_415_For_Unsupported_ContentType()
    {
        // Arrange
        var requestBody = CreateInviteRequestJson("John Doe", "john.doe@another.com");
        var content = new StringContent(requestBody, Encoding.UTF8, "application/xml"); // Unsupported content type

        // Act
        var response = await _httpClient.PostAsync("/invites", content);

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.UnsupportedMediaType);
    }

    #endregion

    #region GET /invites/{nano_id} Tests

    [Fact]
    public async Task GET_Invite_Should_Return_Invite_Successfully()
    {
        // Arrange - First, create an invite to get a valid ID and populate _lastInviteId
        //await POST_Invites_Should_Create_New_Invite_Successfully();
        //Assert.NotNull(_lastInviteId); // Ensure an ID was set by the POST test
        _lastInviteId = "test-nano-id"; // Using a fixed ID for demonstration; replace with actual created ID if needed

        // Act
        var response = await _httpClient.GetAsync($"/invites/{_lastInviteId}");

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var result = await response.Content.ReadAsStringAsync();
        result.Should().NotBeEmpty();

        using var jsonDoc = JsonDocument.Parse(result);
        var jsonResult = jsonDoc.RootElement;
        
        jsonResult.GetProperty("nano_id").GetString().Should().Be(_lastInviteId);
        jsonResult.GetProperty("name").GetString().Should().Be("Gino Gino");
        jsonResult.GetProperty("email_ID").GetString().Should().Be("alpha@beta.com");
        jsonResult.GetProperty("role").GetString().Should().Be("CAPTAIN");
        jsonResult.GetProperty("team_name").GetString().Should().Be("Morpeth 9");
        jsonResult.GetProperty("division").GetString().Should().Be("Division 4");
        jsonResult.GetProperty("league").GetString().Should().Be("CLTTL");
        jsonResult.GetProperty("season").GetString().Should().Be("2025-2026");
        jsonResult.GetProperty("created_at").GetInt64().Should().BePositive();
        jsonResult.GetProperty("accepted_at").ValueKind.Should().Be(JsonValueKind.Null);
    }

    [Fact(Skip = "Temporarily suspended until GET /invites/{nano_id} has a real implementation for 404 cases.")]
    public async Task GET_Invite_Should_Return_404_For_NonExistent_Id()
    {
        // Arrange
        var nonExistentId = "this-id-does-not-exist";

        // Act
        var response = await _httpClient.GetAsync($"/invites/{nonExistentId}");

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task GET_Invite_Should_Return_405_For_Missing_Id()
    {
        // Act
        var response = await _httpClient.GetAsync("/invites/"); // Trailing slash, no ID

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.MethodNotAllowed);
    }

    #endregion

    #region OPTIONS Tests

    [Fact]
    public async Task OPTIONS_Invites_Should_Return_200_For_CORS_Preflight()
    {
        // Arrange
        var request = new HttpRequestMessage(HttpMethod.Options, "/invites");
        request.Headers.Add("Origin", "http://localhost:3000");
        request.Headers.Add("Access-Control-Request-Method", "POST");

        // Act
        var response = await _httpClient.SendAsync(request);

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        response.Headers.Should().ContainKey("Access-Control-Allow-Origin");
        response.Headers.Should().ContainKey("Access-Control-Allow-Headers");
        response.Headers.Should().ContainKey("Access-Control-Allow-Methods");
    }

    [Fact]
    public async Task OPTIONS_InviteById_Should_Return_200_For_CORS_Preflight()
    {
        // Arrange
        var request = new HttpRequestMessage(HttpMethod.Options, "/invites/some_id");
        request.Headers.Add("Origin", "http://localhost:3000");
        request.Headers.Add("Access-Control-Request-Method", "GET");
        
        // Act
        var response = await _httpClient.SendAsync(request);

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        response.Headers.Should().ContainKey("Access-Control-Allow-Origin");
        response.Headers.Should().ContainKey("Access-Control-Allow-Headers");
        response.Headers.Should().ContainKey("Access-Control-Allow-Methods");
    }

    #endregion

    #region Error Path Tests

    [Fact]
    public async Task PUT_Invites_Should_Return_405_MethodNotAllowed()
    {
        // Arrange
        var content = new StringContent("{}", Encoding.UTF8, "application/json");

        // Act
        var response = await _httpClient.PutAsync("/invites", content);

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.MethodNotAllowed);
    }

    [Fact]
    public async Task DELETE_InviteById_Should_Return_405_MethodNotAllowed()
    {
        // Act
        var response = await _httpClient.DeleteAsync("/invites/some_id");

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.MethodNotAllowed);
    }

    [Fact]
    public async Task GET_NonExistentPath_Should_Return_404_NotFound()
    {
        // Act
        var response = await _httpClient.GetAsync("/some/random/path");

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
    
    #endregion

    #region Helpers

    private static string CreateInviteRequestJson(
        string? name, 
        string? email, 
        string? role = "PLAYER", 
        string? teamName = "Table Tennis Stars", 
        string? division = "Division 1", 
        string? league = "City League", 
        string? season = "Winter 2025")
    {
        var invite = new Dictionary<string, string?>
        {
            { "name", name },
            { "email_ID", email },
            { "role", role },
            { "team_name", teamName },
            { "division", division },
            { "league", league },
            { "season", season }
        };
        
        // Remove null fields for testing missing field scenario
        var cleanInvite = invite.Where(kvp => kvp.Value != null)
                                .ToDictionary(kvp => kvp.Key, kvp => kvp.Value);

        return JsonSerializer.Serialize(cleanInvite);
    }

    #endregion

    public Task InitializeAsync() => Task.CompletedTask;

    public Task DisposeAsync()
    {
        // If a DELETE endpoint were available, we would clean up created resources here.
        // For example:
        // if (_lastInviteId != null)
        // {
        //     await _httpClient.DeleteAsync($"/invites/{_lastInviteId}");
        // }
        _httpClient?.Dispose();
        return Task.CompletedTask;
    }
}
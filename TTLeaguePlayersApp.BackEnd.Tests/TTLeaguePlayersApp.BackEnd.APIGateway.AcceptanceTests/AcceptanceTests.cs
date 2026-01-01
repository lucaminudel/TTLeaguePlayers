using System.Net;
using System.Text;
using System.Text.Json;
using FluentAssertions;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.APIGateway.AcceptanceTests;

public class AcceptanceTests : IAsyncLifetime
{
    private readonly HttpClient _httpClient;
    private string? _lastInviteId;

    public AcceptanceTests()
    {
        var baseUrl = new Configuration.DataStore.Loader().GetEnvironmentVariables().ApiGateWay.ApiBaseUrl;
        
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
            season: "2025-2026",
            invitedBy: "Luca");
        var content = new StringContent(requestBody, Encoding.UTF8, "application/json");

        // Act
        var response = await _httpClient.PostAsync("/invites", content);

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        
        var result = await response.Content.ReadAsStringAsync();
        result.Should().NotBeEmpty();

        using var jsonDoc = JsonDocument.Parse(result);
        var jsonResult = jsonDoc.RootElement;

        jsonResult.GetProperty("invitee_name").GetString().Should().Be("Gino Gino");
        jsonResult.GetProperty("invitee_email_id").GetString().Should().Be("alpha@beta.com");
        jsonResult.GetProperty("invitee_role").GetString().Should().Be("CAPTAIN");
        jsonResult.GetProperty("invitee_team").GetString().Should().Be("Morpeth 9");
        jsonResult.GetProperty("team_division").GetString().Should().Be("Division 4");
        jsonResult.GetProperty("league").GetString().Should().Be("CLTTL");
        jsonResult.GetProperty("season").GetString().Should().Be("2025-2026");
        jsonResult.GetProperty("invited_by").GetString().Should().Be("Luca");
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
        // Arrange - Create an invite first
        var requestBody = CreateInviteRequestJson(
            name: "Gino Gino",
            email: "alpha@beta.com",
            role: "CAPTAIN",
            teamName: "Morpeth 9",
            division: "Division 4",
            league: "CLTTL",
            season: "2025-2026",
            invitedBy: "Luca");
        var postContent = new StringContent(requestBody, Encoding.UTF8, "application/json");
        
        var postResponse = await _httpClient.PostAsync("/invites", postContent);
        postResponse.StatusCode.Should().Be(HttpStatusCode.Created);
        
        var postResult = await postResponse.Content.ReadAsStringAsync();
        using var postJsonDoc = JsonDocument.Parse(postResult);
        var createdInviteId = postJsonDoc.RootElement.GetProperty("nano_id").GetString();
        createdInviteId.Should().NotBeNullOrEmpty();

        // Act - Now retrieve the created invite
        var response = await _httpClient.GetAsync($"/invites/{createdInviteId}");

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var result = await response.Content.ReadAsStringAsync();
        result.Should().NotBeEmpty();

        using var jsonDoc = JsonDocument.Parse(result);
        var jsonResult = jsonDoc.RootElement;
        
        jsonResult.GetProperty("nano_id").GetString().Should().Be(createdInviteId);
        jsonResult.GetProperty("invitee_name").GetString().Should().Be("Gino Gino");
        jsonResult.GetProperty("invitee_email_id").GetString().Should().Be("alpha@beta.com");
        jsonResult.GetProperty("invitee_role").GetString().Should().Be("CAPTAIN");
        jsonResult.GetProperty("invitee_team").GetString().Should().Be("Morpeth 9");
        jsonResult.GetProperty("team_division").GetString().Should().Be("Division 4");
        jsonResult.GetProperty("league").GetString().Should().Be("CLTTL");
        jsonResult.GetProperty("season").GetString().Should().Be("2025-2026");
        jsonResult.GetProperty("invited_by").GetString().Should().Be("Luca");
        jsonResult.GetProperty("created_at").GetInt64().Should().BePositive();
        jsonResult.GetProperty("accepted_at").ValueKind.Should().Be(JsonValueKind.Null);
    }

    [Fact]
    public async Task GET_Invite_Should_Return_404_For_NonExistent_Id()
    {
        // Arrange
        var nonExistentId = "_2_4_6_8";

        // Act
        var response = await _httpClient.GetAsync($"/invites/{nonExistentId}");
        var errorMessage = await response.Content.ReadAsStringAsync();

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        errorMessage.Should().Contain("Invite not found");
    }

    [Fact]
    public async Task GET_Invite_Should_Return_400_For_Malformed_NanoId()
    {
        // Arrange
        var malformedId = "short"; // Length != 8

        // Act
        var response = await _httpClient.GetAsync($"/invites/{malformedId}");

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var errorMessage = await response.Content.ReadAsStringAsync();
        errorMessage.Should().Contain("nano_id malformed.");
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

    #region PATCH /invites/{nano_id} Tests (Mark Accepted)

    [Fact]
    public async Task PATCH_Invite_Should_Mark_Invite_Accepted_Successfully()
    {
        // Arrange - Create an invite first
        var requestBody = CreateInviteRequestJson(
            name: "John Smith",
            email: "john.smith@example.com",
            role: "PLAYER",
            teamName: "City Strikers",
            division: "Division 2",
            league: "Regional League",
            season: "2025-2026",
            invitedBy: "Emma");
        var postContent = new StringContent(requestBody, Encoding.UTF8, "application/json");

        var postResponse = await _httpClient.PostAsync("/invites", postContent);
        postResponse.StatusCode.Should().Be(HttpStatusCode.Created);

        var postResult = await postResponse.Content.ReadAsStringAsync();
        using var postJsonDoc = JsonDocument.Parse(postResult);
        var createdInviteId = postJsonDoc.RootElement.GetProperty("nano_id").GetString();
        createdInviteId.Should().NotBeNullOrEmpty();

        // Verify invite was created without accepted_at
        var getBeforeResponse = await _httpClient.GetAsync($"/invites/{createdInviteId}");
        var getBeforeResult = await getBeforeResponse.Content.ReadAsStringAsync();
        using var getBeforeJsonDoc = JsonDocument.Parse(getBeforeResult);
        getBeforeJsonDoc.RootElement.GetProperty("accepted_at").ValueKind.Should().Be(JsonValueKind.Null);

        // Act - Now mark the invite as accepted
        var acceptedAt = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var patchBody = JsonSerializer.Serialize(new Dictionary<string, long> { { "accepted_at", acceptedAt } });
        var request = new HttpRequestMessage(HttpMethod.Patch, $"/invites/{createdInviteId}")
        {
            Content = new StringContent(patchBody, Encoding.UTF8, "application/json")
        };
        var response = await _httpClient.SendAsync(request);

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var result = await response.Content.ReadAsStringAsync();
        result.Should().NotBeEmpty();

        using var jsonDoc = JsonDocument.Parse(result);
        var jsonResult = jsonDoc.RootElement;

        jsonResult.GetProperty("nano_id").GetString().Should().Be(createdInviteId);
        jsonResult.GetProperty("invitee_name").GetString().Should().Be("John Smith");
        jsonResult.GetProperty("accepted_at").ValueKind.Should().Be(JsonValueKind.Number);
        jsonResult.GetProperty("accepted_at").GetInt64().Should().Be(acceptedAt);
    }

    [Fact]
    public async Task PATCH_Invite_Should_Return_404_For_NonExistent_Id()
    {
        // Arrange
        var nonExistentId = "02040608";
        var patchBody = JsonSerializer.Serialize(new Dictionary<string, long> { { "accepted_at", DateTimeOffset.UtcNow.ToUnixTimeSeconds() } });
        var request = new HttpRequestMessage(HttpMethod.Patch, $"/invites/{nonExistentId}")
        {
            Content = new StringContent(patchBody, Encoding.UTF8, "application/json")
        };

        // Act
        var response = await _httpClient.SendAsync(request);
        var errorMessage = await response.Content.ReadAsStringAsync();

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        errorMessage.Should().Contain("Invite not found");
    }

    [Fact]
    public async Task PATCH_Invite_Should_Return_400_For_Malformed_NanoId()
    {
        // Arrange
        var malformedId = "short";
        var patchBody = JsonSerializer.Serialize(new Dictionary<string, long> { { "accepted_at", DateTimeOffset.UtcNow.ToUnixTimeSeconds() } });
        var request = new HttpRequestMessage(HttpMethod.Patch, $"/invites/{malformedId}")
        {
            Content = new StringContent(patchBody, Encoding.UTF8, "application/json")
        };

        // Act
        var response = await _httpClient.SendAsync(request);

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var errorMessage = await response.Content.ReadAsStringAsync();
        errorMessage.Should().Contain("nano_id malformed");
    }

    [Fact]
    public async Task PATCH_Invite_Should_Be_Idempotent_When_Called_Twice()
    {
        // Arrange - Create an invite first
        var requestBody = CreateInviteRequestJson(
            name: "Idem Potent",
            email: "idempotent@example.com",
            role: "PLAYER",
            teamName: "Retry Club",
            division: "Division 3",
            league: "Regional League",
            season: "2025-2026",
            invitedBy: "Client");
        var postContent = new StringContent(requestBody, Encoding.UTF8, "application/json");

        var postResponse = await _httpClient.PostAsync("/invites", postContent);
        postResponse.StatusCode.Should().Be(HttpStatusCode.Created);

        var postResult = await postResponse.Content.ReadAsStringAsync();
        using var postJsonDoc = JsonDocument.Parse(postResult);
        var createdInviteId = postJsonDoc.RootElement.GetProperty("nano_id").GetString();
        createdInviteId.Should().NotBeNullOrEmpty();

        var acceptedAt = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var patchBody = JsonSerializer.Serialize(new Dictionary<string, long> { { "accepted_at", acceptedAt } });

        // Act - Patch once
        var firstPatch = new HttpRequestMessage(HttpMethod.Patch, $"/invites/{createdInviteId}")
        {
            Content = new StringContent(patchBody, Encoding.UTF8, "application/json")
        };
        var firstAcceptResponse = await _httpClient.SendAsync(firstPatch);

        // Assert - First patch
        firstAcceptResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var firstAcceptBody = await firstAcceptResponse.Content.ReadAsStringAsync();
        using var firstAcceptJsonDoc = JsonDocument.Parse(firstAcceptBody);
        var firstAcceptedAt = firstAcceptJsonDoc.RootElement.GetProperty("accepted_at").GetInt64();
        firstAcceptedAt.Should().Be(acceptedAt);

        // Act - Patch again with the same accepted_at (client retry)
        var secondPatch = new HttpRequestMessage(HttpMethod.Patch, $"/invites/{createdInviteId}")
        {
            Content = new StringContent(patchBody, Encoding.UTF8, "application/json")
        };
        var secondAcceptResponse = await _httpClient.SendAsync(secondPatch);

        // Assert - Second patch is still OK and accepted_at is unchanged
        secondAcceptResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var secondAcceptBody = await secondAcceptResponse.Content.ReadAsStringAsync();
        using var secondAcceptJsonDoc = JsonDocument.Parse(secondAcceptBody);
        var secondAcceptedAt = secondAcceptJsonDoc.RootElement.GetProperty("accepted_at").GetInt64();
        secondAcceptedAt.Should().Be(firstAcceptedAt);
    }

    [Fact]
    public async Task PATCH_InviteById_Should_Return_400_For_Missing_Id()
    {
        // Act
        var patchBody = JsonSerializer.Serialize(new Dictionary<string, long> { { "accepted_at", DateTimeOffset.UtcNow.ToUnixTimeSeconds() } });
        var request = new HttpRequestMessage(HttpMethod.Patch, "/invites/")
        {
            Content = new StringContent(patchBody, Encoding.UTF8, "application/json")
        };
        var response = await _httpClient.SendAsync(request);

        // Assert
        // When patching /invites/ (trailing slash), NormalizePath converts it to /invites,
        // which is the collection endpoint (create only), therefore PATCH is not allowed.
        response.StatusCode.Should().Be(HttpStatusCode.MethodNotAllowed);
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
    public async Task DELETE_Invite_Should_Delete_Invite_Successfully()
    {
        // Arrange - Create an invite first
        var requestBody = CreateInviteRequestJson(
            name: "To Delete",
            email: "delete.me@example.com",
            role: "PLAYER",
            teamName: "Disposable",
            division: "Division 1",
            league: "City League",
            season: "2025-2026",
            invitedBy: "Tester");
        var postContent = new StringContent(requestBody, Encoding.UTF8, "application/json");

        var postResponse = await _httpClient.PostAsync("/invites", postContent);
        postResponse.StatusCode.Should().Be(HttpStatusCode.Created);

        var postResult = await postResponse.Content.ReadAsStringAsync();
        using var postJsonDoc = JsonDocument.Parse(postResult);
        var createdInviteId = postJsonDoc.RootElement.GetProperty("nano_id").GetString();
        createdInviteId.Should().NotBeNullOrEmpty();

        // Act
        var response = await _httpClient.DeleteAsync($"/invites/{createdInviteId}");

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.NoContent);

        // And the resource is gone
        var getAfter = await _httpClient.GetAsync($"/invites/{createdInviteId}");
        getAfter.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task DELETE_Invite_Should_Be_Idempotent_When_Called_Twice()
    {
        // Arrange - Create an invite first
        var requestBody = CreateInviteRequestJson(
            name: "Delete Twice",
            email: "delete.twice@example.com",
            role: "PLAYER",
            teamName: "Disposable",
            division: "Division 2",
            league: "City League",
            season: "2025-2026",
            invitedBy: "Tester");
        var postContent = new StringContent(requestBody, Encoding.UTF8, "application/json");

        var postResponse = await _httpClient.PostAsync("/invites", postContent);
        postResponse.StatusCode.Should().Be(HttpStatusCode.Created);

        var postResult = await postResponse.Content.ReadAsStringAsync();
        using var postJsonDoc = JsonDocument.Parse(postResult);
        var createdInviteId = postJsonDoc.RootElement.GetProperty("nano_id").GetString();
        createdInviteId.Should().NotBeNullOrEmpty();

        // Act - delete once
        var firstDelete = await _httpClient.DeleteAsync($"/invites/{createdInviteId}");

        // Assert
        firstDelete.StatusCode.Should().Be(HttpStatusCode.NoContent);

        // Act - delete again (retry)
        var secondDelete = await _httpClient.DeleteAsync($"/invites/{createdInviteId}");

        // Assert - still NoContent
        secondDelete.StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task DELETE_Invite_Should_Return_400_For_Malformed_NanoId()
    {
        // Arrange
        var malformedId = "short";

        // Act
        var response = await _httpClient.DeleteAsync($"/invites/{malformedId}");
        var errorMessage = await response.Content.ReadAsStringAsync();

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        errorMessage.Should().Contain("nano_id malformed");
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
        string? season = "Winter 2025",
        string? invitedBy = "Luca")
    {
        var invite = new Dictionary<string, string?>
        {
            { "invitee_name", name },
            { "invitee_email_id", email },
            { "invitee_role", role },
            { "invitee_team", teamName },
            { "team_division", division },
            { "league", league },
            { "season", season },
            { "invited_by", invitedBy }
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
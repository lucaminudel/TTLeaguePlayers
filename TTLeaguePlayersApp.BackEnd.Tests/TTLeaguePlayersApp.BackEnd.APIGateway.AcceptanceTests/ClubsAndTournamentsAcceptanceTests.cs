using System.Net;
using System.Text;
using System.Text.Json;
using FluentAssertions;
using Xunit;

using Amazon.CognitoIdentityProvider;
using Amazon.CognitoIdentityProvider.Model;

namespace TTLeaguePlayersApp.BackEnd.APIGateway.AcceptanceTests;

[Trait("Environment", "Staging")]
public class ClubsAndTournamentsAcceptanceTests : IAsyncLifetime
{
    private readonly HttpClient _httpClient;
    private readonly IAmazonCognitoIdentityProvider _cognitoClient;
    private readonly string _userPoolId;
    private readonly string _clientId;
    private readonly List<(string location, string clubName)> _createdClubs = new();
    private readonly List<(string location, string clubName, string tournamentName)> _createdTournaments = new();

    private const string TestLocation = "London";
    private const string TestClubName = "Acceptance Test Club";
    private const string TestTournamentName = "Acceptance Test Tournament";
    private const string TestUserEmail = "test_already_registered@user.test";
    private const string TestUserPassword = "aA1!56789012";

    public ClubsAndTournamentsAcceptanceTests()
    {
        var config = new Configuration.DataStore.Loader().GetEnvironmentVariables();
        _userPoolId = config.Cognito.UserPoolId;
        _clientId = config.Cognito.ClientId;
        
        _cognitoClient = new AmazonCognitoIdentityProviderClient(); // Uses default credentials

        _httpClient = new HttpClient
        {
            BaseAddress = config.ApiGateWay.ApiBaseUrl,
            Timeout = TimeSpan.FromSeconds(30)
        };
    }

    #region GET /clubs Tests

    [Fact]
    public async Task GET_Clubs_Should_Return_200_With_List()
    {
        var response = await _httpClient.GetAsync("/clubs");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var result = await response.Content.ReadAsStringAsync();
        using var jsonDoc = JsonDocument.Parse(result);
        jsonDoc.RootElement.ValueKind.Should().Be(JsonValueKind.Array);
    }

    [Fact]
    public async Task POST_Clubs_Should_Return_405_MethodNotAllowed()
    {
        var response = await _httpClient.PostAsync("/clubs", new StringContent("{}", Encoding.UTF8, "application/json"));

        response.StatusCode.Should().Be(HttpStatusCode.MethodNotAllowed);
    }

    [Fact]
    public async Task OPTIONS_Clubs_Should_Return_200_For_CORS_Preflight()
    {
        var request = new HttpRequestMessage(HttpMethod.Options, "/clubs");
        request.Headers.Add("Origin", "http://localhost:3000");
        request.Headers.Add("Access-Control-Request-Method", "GET");

        var response = await _httpClient.SendAsync(request);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        response.Headers.Should().ContainKey("Access-Control-Allow-Origin");
        response.Headers.Should().ContainKey("Access-Control-Allow-Methods");
    }

    #endregion

    #region GET /clubs/{location} Tests

    [Fact]
    public async Task GET_ClubsByLocation_Should_Return_200_With_List()
    {
        var response = await _httpClient.GetAsync($"/clubs/{Uri.EscapeDataString(TestLocation)}");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var result = await response.Content.ReadAsStringAsync();
        using var jsonDoc = JsonDocument.Parse(result);
        jsonDoc.RootElement.ValueKind.Should().Be(JsonValueKind.Array);
    }

    [Fact]
    public async Task GET_ClubsByLocation_Should_Handle_UrlEncoded_Location()
    {
        var locationWithSpace = "North East";
        var response = await _httpClient.GetAsync($"/clubs/{Uri.EscapeDataString(locationWithSpace)}");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var result = await response.Content.ReadAsStringAsync();
        using var jsonDoc = JsonDocument.Parse(result);
        jsonDoc.RootElement.ValueKind.Should().Be(JsonValueKind.Array);
    }

    [Fact]
    public async Task POST_ClubsByLocation_Should_Return_405_MethodNotAllowed()
    {
        var response = await _httpClient.PostAsync($"/clubs/{Uri.EscapeDataString(TestLocation)}", new StringContent("{}", Encoding.UTF8, "application/json"));

        response.StatusCode.Should().Be(HttpStatusCode.MethodNotAllowed);
    }

    [Fact]
    public async Task OPTIONS_ClubsByLocation_Should_Return_200_For_CORS_Preflight()
    {
        var request = new HttpRequestMessage(HttpMethod.Options, $"/clubs/{Uri.EscapeDataString(TestLocation)}");
        request.Headers.Add("Origin", "http://localhost:3000");
        request.Headers.Add("Access-Control-Request-Method", "GET");

        var response = await _httpClient.SendAsync(request);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        response.Headers.Should().ContainKey("Access-Control-Allow-Origin");
        response.Headers.Should().ContainKey("Access-Control-Allow-Methods");
    }

    #endregion

    #region PUT /clubs/{location}/{clubName} Tests

    [Fact]
    public async Task PUT_Club_Should_Be_Protected()
    {
        if (RunningAgainst.ALocalEnvironmentIsTrue())
            return;

        var unauthenticatedClient = new HttpClient { BaseAddress = _httpClient.BaseAddress };
        var content = new StringContent(CreateUpsertClubJson("https://testclub.example.com"), Encoding.UTF8, "application/json");

        var response = await unauthenticatedClient.PutAsync(ClubPath(TestLocation, TestClubName), content);

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task DELETE_Club_Should_Be_Protected()
    {
        if (RunningAgainst.ALocalEnvironmentIsTrue())
            return;

        var unauthenticatedClient = new HttpClient { BaseAddress = _httpClient.BaseAddress };

        var response = await unauthenticatedClient.DeleteAsync(ClubPath(TestLocation, TestClubName));

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task PUT_Club_Should_Create_Club_Successfully()
    {
        var body = CreateUpsertClubJson("https://testclub.example.com");
        var content = new StringContent(body, Encoding.UTF8, "application/json");

        var response = await _httpClient.PutAsync(ClubPath(TestLocation, TestClubName), content);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        
        var result = await response.Content.ReadAsStringAsync();
        using var jsonDoc = JsonDocument.Parse(result);
        jsonDoc.RootElement.GetProperty("location").GetString().Should().Be(TestLocation);
        jsonDoc.RootElement.GetProperty("club_name").GetString().Should().Be(TestClubName);
        jsonDoc.RootElement.GetProperty("homepage").GetString().Should().Be("https://testclub.example.com");
        
        _createdClubs.Add((TestLocation, TestClubName));
    }

    [Fact]
    public async Task PUT_Club_Should_Be_Idempotent_When_Called_Twice()
    {
        var clubName = "Idempotent Club";
        var body = CreateUpsertClubJson("https://idempotent.example.com");
        var content1 = new StringContent(body, Encoding.UTF8, "application/json");
        var content2 = new StringContent(body, Encoding.UTF8, "application/json");

        var first = await _httpClient.PutAsync(ClubPath(TestLocation, clubName), content1);
        var second = await _httpClient.PutAsync(ClubPath(TestLocation, clubName), content2);

        first.StatusCode.Should().Be(HttpStatusCode.OK);
        second.StatusCode.Should().Be(HttpStatusCode.OK);
        
        var firstResult = await first.Content.ReadAsStringAsync();
        using var firstJsonDoc = JsonDocument.Parse(firstResult);
        firstJsonDoc.RootElement.GetProperty("location").GetString().Should().Be(TestLocation);
        firstJsonDoc.RootElement.GetProperty("club_name").GetString().Should().Be(clubName);
        firstJsonDoc.RootElement.GetProperty("homepage").GetString().Should().Be("https://idempotent.example.com");
        
        var secondResult = await second.Content.ReadAsStringAsync();
        using var secondJsonDoc = JsonDocument.Parse(secondResult);
        secondJsonDoc.RootElement.GetProperty("location").GetString().Should().Be(TestLocation);
        secondJsonDoc.RootElement.GetProperty("club_name").GetString().Should().Be(clubName);
        secondJsonDoc.RootElement.GetProperty("homepage").GetString().Should().Be("https://idempotent.example.com");
        
        _createdClubs.Add((TestLocation, clubName));
    }

    [Fact]
    public async Task PUT_Club_Should_Return_400_For_Invalid_Homepage_Uri()
    {
        var body = CreateUpsertClubJson("not_a_valid_uri");
        var content = new StringContent(body, Encoding.UTF8, "application/json");

        var response = await _httpClient.PutAsync(ClubPath(TestLocation, "Invalid Uri Club"), content);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var result = await response.Content.ReadAsStringAsync();
        result.Should().Contain("Validation failed");
    }

    [Fact]
    public async Task PUT_Club_Should_Return_400_For_Empty_Body()
    {
        var content = new StringContent(string.Empty, Encoding.UTF8, "application/json");

        var response = await _httpClient.PutAsync(ClubPath(TestLocation, TestClubName), content);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var result = await response.Content.ReadAsStringAsync();
        result.Should().Contain("Empty request body");
    }

    [Fact]
    public async Task PUT_Club_Should_Return_400_For_Malformed_Json()
    {
        var content = new StringContent("{ invalid json", Encoding.UTF8, "application/json");

        var response = await _httpClient.PutAsync(ClubPath(TestLocation, TestClubName), content);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var result = await response.Content.ReadAsStringAsync();
        result.Should().Contain("Invalid request body");
    }

    [Fact]
    public async Task PUT_Club_Should_Return_415_For_Unsupported_ContentType()
    {
        var content = new StringContent(CreateUpsertClubJson("https://testclub.example.com"), Encoding.UTF8, "application/xml");

        var response = await _httpClient.PutAsync(ClubPath(TestLocation, TestClubName), content);

        response.StatusCode.Should().Be(HttpStatusCode.UnsupportedMediaType);
    }

    [Fact]
    public async Task PUT_Club_Should_Handle_UrlEncoded_Path_Segments()
    {
        var locationWithSpace = "North East";
        var clubNameWithSpace = "Acceptance Space Club";
        var body = CreateUpsertClubJson("https://spaceclub.example.com");
        var content = new StringContent(body, Encoding.UTF8, "application/json");

        var response = await _httpClient.PutAsync(ClubPath(locationWithSpace, clubNameWithSpace), content);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        
        var result = await response.Content.ReadAsStringAsync();
        using var jsonDoc = JsonDocument.Parse(result);
        jsonDoc.RootElement.GetProperty("location").GetString().Should().Be(locationWithSpace);
        jsonDoc.RootElement.GetProperty("club_name").GetString().Should().Be(clubNameWithSpace);
        jsonDoc.RootElement.GetProperty("homepage").GetString().Should().Be("https://spaceclub.example.com");
        
        _createdClubs.Add((locationWithSpace, clubNameWithSpace));
    }

    [Fact]
    public async Task GET_Club_Should_Return_200_With_Club_Details()
    {
        var clubName = "Club To Retrieve";
        var homepage = "https://retrieval.example.com";
        await UpsertClubAsync(TestLocation, clubName, homepage);

        var response = await _httpClient.GetAsync(ClubPath(TestLocation, clubName));

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var result = await response.Content.ReadAsStringAsync();
        using var jsonDoc = JsonDocument.Parse(result);
        jsonDoc.RootElement.GetProperty("location").GetString().Should().Be(TestLocation);
        jsonDoc.RootElement.GetProperty("club_name").GetString().Should().Be(clubName);
        jsonDoc.RootElement.GetProperty("homepage").GetString().Should().Be(homepage + "/");

    }

    [Fact]
    public async Task GET_Club_Should_Return_404_When_Club_Not_Found()
    {
        var response = await _httpClient.GetAsync(ClubPath(TestLocation, "NonExistent Club"));

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task OPTIONS_Club_Should_Return_200_For_CORS_Preflight()
    {
        var request = new HttpRequestMessage(HttpMethod.Options, ClubPath(TestLocation, TestClubName));
        request.Headers.Add("Origin", "http://localhost:3000");
        request.Headers.Add("Access-Control-Request-Method", "PUT");

        var response = await _httpClient.SendAsync(request);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        response.Headers.Should().ContainKey("Access-Control-Allow-Origin");
        response.Headers.GetValues("Access-Control-Allow-Methods").First().Should().Contain("GET").And.Contain("PUT").And.Contain("DELETE");
    }

    #endregion

    #region DELETE /clubs/{location}/{clubName} Tests

    [Fact]
    public async Task DELETE_Club_Should_Delete_Club_Successfully()
    {
        var clubName = "Club To Delete";
        await UpsertClubAsync(TestLocation, clubName, "https://delete-me.example.com");

        var response = await _httpClient.DeleteAsync(ClubPath(TestLocation, clubName));

        response.StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task DELETE_Club_Should_Be_Idempotent_When_Called_Twice()
    {
        var clubName = "Club To Delete Twice";
        await UpsertClubAsync(TestLocation, clubName, "https://delete-twice.example.com");

        var first = await _httpClient.DeleteAsync(ClubPath(TestLocation, clubName));
        var second = await _httpClient.DeleteAsync(ClubPath(TestLocation, clubName));

        first.StatusCode.Should().Be(HttpStatusCode.NoContent);
        second.StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    #endregion

    #region PUT /clubs/{location}/{clubName}/tournaments/{tournamentName} Tests

    [Fact]
    public async Task PUT_Tournament_Should_Create_Tournament_Successfully()
    {
        await UpsertClubAsync(TestLocation, TestClubName, "https://testclub.example.com");

        var body = CreateUpsertTournamentJson("https://tournament.example.com");
        var content = new StringContent(body, Encoding.UTF8, "application/json");

        _createdTournaments.Add((TestLocation, TestClubName, TestTournamentName));
        var response = await _httpClient.PutAsync(TournamentPath(TestLocation, TestClubName, TestTournamentName), content);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task PUT_Tournament_Should_Return_400_For_Invalid_TournamentInfo_Uri()
    {
        var body = CreateUpsertTournamentJson("not_a_valid_uri");
        var content = new StringContent(body, Encoding.UTF8, "application/json");

        var response = await _httpClient.PutAsync(TournamentPath(TestLocation, TestClubName, "Invalid Uri Tournament"), content);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var result = await response.Content.ReadAsStringAsync();
        result.Should().Contain("Validation failed");
    }

    [Fact]
    public async Task PUT_Tournament_Should_Return_400_For_Empty_Body()
    {
        var content = new StringContent(string.Empty, Encoding.UTF8, "application/json");

        var response = await _httpClient.PutAsync(TournamentPath(TestLocation, TestClubName, TestTournamentName), content);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var result = await response.Content.ReadAsStringAsync();
        result.Should().Contain("Empty request body");
    }

    [Fact]
    public async Task PUT_Tournament_Should_Return_415_For_Unsupported_ContentType()
    {
        var content = new StringContent(CreateUpsertTournamentJson("https://tournament.example.com"), Encoding.UTF8, "application/xml");

        var response = await _httpClient.PutAsync(TournamentPath(TestLocation, TestClubName, TestTournamentName), content);

        response.StatusCode.Should().Be(HttpStatusCode.UnsupportedMediaType);
    }

    [Fact]
    public async Task PUT_Tournament_Should_Handle_UrlEncoded_Path_Segments()
    {
        var locationWithSpace = "North East";
        var clubNameWithSpace = "Space Club";
        var tournamentNameWithSpace = "Space Tournament";
        await UpsertClubAsync(locationWithSpace, clubNameWithSpace, "https://spaceclub.example.com");

        var body = CreateUpsertTournamentJson("https://spacetournament.example.com");
        var content = new StringContent(body, Encoding.UTF8, "application/json");

        _createdTournaments.Add((locationWithSpace, clubNameWithSpace, tournamentNameWithSpace));
        var response = await _httpClient.PutAsync(TournamentPath(locationWithSpace, clubNameWithSpace, tournamentNameWithSpace), content);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task POST_Tournament_Should_Return_405_MethodNotAllowed()
    {
        var response = await _httpClient.PostAsync(TournamentPath(TestLocation, TestClubName, TestTournamentName), new StringContent("{}", Encoding.UTF8, "application/json"));

        response.StatusCode.Should().Be(HttpStatusCode.MethodNotAllowed);
    }

    [Fact]
    public async Task OPTIONS_Tournament_Should_Return_200_For_CORS_Preflight()
    {
        var request = new HttpRequestMessage(HttpMethod.Options, TournamentPath(TestLocation, TestClubName, TestTournamentName));
        request.Headers.Add("Origin", "http://localhost:3000");
        request.Headers.Add("Access-Control-Request-Method", "PUT");

        var response = await _httpClient.SendAsync(request);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        response.Headers.Should().ContainKey("Access-Control-Allow-Origin");
        response.Headers.GetValues("Access-Control-Allow-Methods").First().Should().Contain("PUT").And.Contain("GET").And.Contain("DELETE");
    }

    #endregion

    #region GET /clubs/{location}/{clubName}/tournaments/{tournamentName} Tests

    [Fact]
    public async Task GET_Tournament_Should_Return_Tournament_Successfully()
    {
        await UpsertClubAsync(TestLocation, TestClubName, "https://testclub.example.com");
        await UpsertTournamentAsync(TestLocation, TestClubName, TestTournamentName, "https://tournament.example.com");

        var response = await _httpClient.GetAsync(TournamentPath(TestLocation, TestClubName, TestTournamentName));

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var result = await response.Content.ReadAsStringAsync();
        using var jsonDoc = JsonDocument.Parse(result);
        var jsonResult = jsonDoc.RootElement;

        jsonResult.GetProperty("tournament_name").GetString().Should().Be(TestTournamentName);
        jsonResult.GetProperty("tournament_info").GetString().Should().Be("https://tournament.example.com/");
    }

    [Fact]
    public async Task GET_Tournament_Should_Return_404_For_NonExistent_Tournament()
    {
        var response = await _httpClient.GetAsync(TournamentPath(TestLocation, TestClubName, "NonExistentTournament99"));

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    #endregion

    #region DELETE /clubs/{location}/{clubName}/tournaments/{tournamentName} Tests

    [Fact]
    public async Task DELETE_Tournament_Should_Delete_Tournament_Successfully()
    {
        var tournamentName = "Tournament To Delete";
        await UpsertClubAsync(TestLocation, TestClubName, "https://testclub.example.com");
        await UpsertTournamentAsync(TestLocation, TestClubName, tournamentName, "https://delete-tournament.example.com");

        var response = await _httpClient.DeleteAsync(TournamentPath(TestLocation, TestClubName, tournamentName));

        response.StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task DELETE_Tournament_Should_Be_Idempotent_When_Called_Twice()
    {
        var tournamentName = "Tournament To Delete Twice";
        await UpsertClubAsync(TestLocation, TestClubName, "https://testclub.example.com");
        await UpsertTournamentAsync(TestLocation, TestClubName, tournamentName, "https://delete-twice-tournament.example.com");

        var first = await _httpClient.DeleteAsync(TournamentPath(TestLocation, TestClubName, tournamentName));
        var second = await _httpClient.DeleteAsync(TournamentPath(TestLocation, TestClubName, tournamentName));

        first.StatusCode.Should().Be(HttpStatusCode.NoContent);
        second.StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    #endregion

    #region Helpers

    private static string ClubPath(string location, string clubName)
        => $"/clubs/{Uri.EscapeDataString(location)}/{Uri.EscapeDataString(clubName)}";

    private static string TournamentPath(string location, string clubName, string tournamentName)
        => $"/clubs/{Uri.EscapeDataString(location)}/{Uri.EscapeDataString(clubName)}/tournaments/{Uri.EscapeDataString(tournamentName)}";

    private static string CreateUpsertClubJson(string homepage, string? instagram = null, string? facebook = null)
    {
        var dict = new Dictionary<string, string?> { { "homepage", homepage } };
        if (instagram != null) dict["instagram"] = instagram;
        if (facebook != null) dict["facebook"] = facebook;
        return JsonSerializer.Serialize(dict);
    }

    private static string CreateUpsertTournamentJson(string tournamentInfo, long startDate = 1735689600, long endDate = 1735776000)
    {
        return JsonSerializer.Serialize(new Dictionary<string, object>
        {
            { "tournament_info", tournamentInfo },
            { "start_date", startDate },
            { "end_date", endDate }
        });
    }

    private async Task UpsertClubAsync(string location, string clubName, string homepage)
    {
        var content = new StringContent(CreateUpsertClubJson(homepage), Encoding.UTF8, "application/json");
        var response = await _httpClient.PutAsync(ClubPath(location, clubName), content);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        
        var result = await response.Content.ReadAsStringAsync();
        using var jsonDoc = JsonDocument.Parse(result);
        jsonDoc.RootElement.GetProperty("location").GetString().Should().Be(location);
        jsonDoc.RootElement.GetProperty("club_name").GetString().Should().Be(clubName);
        jsonDoc.RootElement.GetProperty("homepage").GetString().Should().Be(homepage);
        
        _createdClubs.Add((location, clubName));
    }

    private async Task UpsertTournamentAsync(string location, string clubName, string tournamentName, string tournamentInfo)
    {
        var content = new StringContent(CreateUpsertTournamentJson(tournamentInfo), Encoding.UTF8, "application/json");
        var response = await _httpClient.PutAsync(TournamentPath(location, clubName, tournamentName), content);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        _createdTournaments.Add((location, clubName, tournamentName));
    }

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

    #endregion

    public async Task InitializeAsync()
    {
        var idToken = await LoginAndGetIdTokenAsync(TestUserEmail, TestUserPassword);
        _httpClient.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", idToken);
    }

    public async Task DisposeAsync()
    {
        foreach (var (location, clubName, tournamentName) in _createdTournaments)
        {
            try { await _httpClient.DeleteAsync(TournamentPath(location, clubName, tournamentName)); } catch { /* ignore */ }
        }
        foreach (var (location, clubName) in _createdClubs)
        {
            try { await _httpClient.DeleteAsync(ClubPath(location, clubName)); } catch { /* ignore */ }
        }
        _httpClient?.Dispose();
    }
}

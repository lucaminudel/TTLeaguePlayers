using System.Collections.Concurrent;
using System.Net;
using System.Text;
using System.Text.Json;
using Amazon.CognitoIdentityProvider;
using FluentAssertions;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.APIGateway.AcceptanceTests;

[Trait("Environment", "Staging")]
public class TeamPlayersRegistrationsAcceptanceTests : IAsyncLifetime
{
    private const string RoutePath = "/invites/registrations/team-players";

    private const string League = "CLTTL";
    private const string Season = "2025-2026";
    private const string Division = "Division 4";
    private const string Team = "Morpeth 10";

    // The CALLER: CAPTAIN of Morpeth 10 / Division 4 in CLTTL 2025-2026 per custom:active_seasons
    private const string CaptainUserEmail = "test_already_registered@user.test";

    // The CALLER for the non-captain case: a PLAYER of another team (Fusion 5) in the same division.
    private const string PlayerUserEmail = "test_kudos_f5@user.test";

    // Fixtures are created and NEVER accepted, so this address never has to exist in Cognito.
    private const string UnacceptedInviteeEmail = "team_players_registrations_never_accepted@example.com";

    private const string TestUserPassword = "aA1!56789012";

    private readonly HttpClient _httpClient;
    private readonly IAmazonCognitoIdentityProvider _cognitoClient;
    private readonly string _userPoolId;
    private readonly string _clientId;
    private readonly ConcurrentBag<string> _createdInviteIds = new();

    // Unique per TEST — xUnit constructs a new instance of this class for every test method.
    private readonly string _playerPrefix = $"AcceptancePlayer-{Guid.NewGuid():N}";

    public TeamPlayersRegistrationsAcceptanceTests()
    {
        var config = new Configuration.DataStore.Loader().GetEnvironmentVariables();
        _userPoolId = config.Cognito.UserPoolId;
        _clientId = config.Cognito.ClientId;
        _cognitoClient = new AmazonCognitoIdentityProviderClient();

        _httpClient = new HttpClient
        {
            BaseAddress = config.ApiGateWay.ApiBaseUrl,
            Timeout = TimeSpan.FromSeconds(30)
        };
    }

    public Task InitializeAsync() => Task.CompletedTask;

    public async Task DisposeAsync()
    {
        // DELETE /invites/{nano_id} is Authorizer: NONE, so teardown needs no token.
        foreach (var nanoId in _createdInviteIds)
        {
            try { await _httpClient.DeleteAsync($"/invites/{nanoId}"); } catch { /* best effort */ }
        }
        _httpClient.Dispose();
    }

    [Fact]
    [Trait("Cognito", "Live")]
    public async Task POST_TeamPlayersRegistrations_AsCaptain_Should_Return_Requested_Players_Then_Extras()
    {
        var pendingPlayer = $"{_playerPrefix} Pending";
        var absentPlayer = $"{_playerPrefix} Absent";
        var unrequestedPlayer = $"{_playerPrefix} Unrequested";

        var pendingId = await CreatePlayerInviteAsync(pendingPlayer);
        var unrequestedId = await CreatePlayerInviteAsync(unrequestedPlayer);

        await AuthenticateAsAsync(CaptainUserEmail);

        var response = await PostRegistrationsAsync(pendingPlayer, absentPlayer);

        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await response.Content.ReadAsStringAsync();
        using var json = JsonDocument.Parse(body);
        var root = json.RootElement;

        root.GetProperty("league").GetString().Should().Be(League);
        root.GetProperty("season").GetString().Should().Be(Season);
        root.GetProperty("team_division").GetString().Should().Be(Division);
        root.GetProperty("team_name").GetString().Should().Be(Team);

        var players = root.GetProperty("players").EnumerateArray().ToList();

        // The requested names come FIRST, in the order they were sent.
        players[0].GetProperty("player_name").GetString().Should().Be(pendingPlayer);
        players[0].GetProperty("status").GetString().Should().Be("PENDING");
        players[0].GetProperty("invitee_role").GetString().Should().Be("PLAYER");
        players[0].GetProperty("nano_id").GetString().Should().Be(pendingId);
        players[0].GetProperty("invitee_name").GetString().Should().Be(pendingPlayer);
        // accepted_at is ALWAYS present and explicitly null when not accepted.
        players[0].GetProperty("accepted_at").ValueKind.Should().Be(JsonValueKind.Null);

        players[1].GetProperty("player_name").GetString().Should().Be(absentPlayer);
        players[1].GetProperty("status").GetString().Should().Be("NOT_INVITED");
        players[1].GetProperty("accepted_at").ValueKind.Should().Be(JsonValueKind.Null);
        // The invite fields are absent entirely when there is no invite to read them from.
        players[1].TryGetProperty("nano_id", out _).Should().BeFalse();
        players[1].TryGetProperty("invitee_role", out _).Should().BeFalse();
        players[1].TryGetProperty("invitee_name", out _).Should().BeFalse();

        // The unrequested fixture is an EXTRA: after the requested ones, found by its own nano_id
        // among whatever else is in the shared partition, with no player_name.
        var extras = players.Skip(2).ToList();
        var extra = extras.Should().ContainSingle(p => p.GetProperty("nano_id").GetString() == unrequestedId).Subject;
        extra.TryGetProperty("player_name", out _).Should().BeFalse();
        extra.GetProperty("status").GetString().Should().Be("PENDING");
        extra.GetProperty("invitee_role").GetString().Should().Be("PLAYER");
        extra.GetProperty("invitee_name").GetString().Should().Be(unrequestedPlayer);

        // No extra is ever NOT_INVITED, and no extra carries a player_name.
        extras.Should().OnlyContain(p => p.GetProperty("status").GetString() != "NOT_INVITED");
        extras.Should().OnlyContain(p => !HasPlayerName(p));
    }

    [Fact]
    [Trait("Cognito", "Live")]
    public async Task POST_TeamPlayersRegistrations_Should_Not_Leak_The_Index_Key()
    {
        var player = $"{_playerPrefix} NoLeak";
        await CreatePlayerInviteAsync(player);

        await AuthenticateAsAsync(CaptainUserEmail);

        var response = await PostRegistrationsAsync(player);
        var body = await response.Content.ReadAsStringAsync();

        // league_season is a stored DynamoDB attribute and an internal index key. It must never reach
        // a client, on this endpoint or any other.
        body.Should().NotContain("league_season");
    }

    // The security check LOGS AND CONTINUES: a caller who is not the captain of this team still gets
    // a 200 with the data. Deliberate, and recorded as an accepted risk — this test exists so that
    // the day somebody changes it to a 403, they find out here rather than in production.
    [Fact]
    [Trait("Cognito", "Live")]
    public async Task POST_TeamPlayersRegistrations_AsAPlayerOfAnotherTeam_Should_Still_Return_200_With_Data()
    {
        var player = $"{_playerPrefix} NonCaptain";
        var nanoId = await CreatePlayerInviteAsync(player);

        await AuthenticateAsAsync(PlayerUserEmail);

        var response = await PostRegistrationsAsync(player);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var players = await ReadPlayersAsync(response);
        var entry = players.Should().ContainSingle(p => HasPlayerName(p) && p.GetProperty("player_name").GetString() == player).Subject;
        entry.GetProperty("status").GetString().Should().Be("PENDING");
        entry.GetProperty("nano_id").GetString().Should().Be(nanoId);
    }

    // Together these always assert something. Neither is a skip.

    [Fact]
    public async Task POST_TeamPlayersRegistrations_WithoutAuth_Should_Return_401_OnACloudEnvironment()
    {
        if (RunningAgainst.ALocalEnvironmentIsTrue())
        {
            // SAM local applies no authorizer; the mirror below covers this case.
            return;
        }

        var response = await PostRegistrationsAsync("Any Player");

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task POST_TeamPlayersRegistrations_WithoutAuth_Should_Return_200_OnALocalEnvironment()
    {
        if (RunningAgainst.ACloudEnvironmentIsTrue())
        {
            // The authorizer rejects this on staging/prod; the mirror above covers it.
            return;
        }

        var response = await PostRegistrationsAsync("Any Player");

        // NOT evidence that the endpoint is unprotected — only that SAM local does not enforce the
        // authorizer. The protection is asserted by the mirror above, on a cloud environment.
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task OPTIONS_TeamPlayersRegistrations_Should_Allow_POST()
    {
        var request = new HttpRequestMessage(HttpMethod.Options, RoutePath);
        request.Headers.Add("Origin", "https://example.com");

        var response = await _httpClient.SendAsync(request);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var allowedMethods = string.Join(",", response.Headers.TryGetValues("Access-Control-Allow-Methods", out var v)
            ? v
            : response.Content.Headers.GetValues("Access-Control-Allow-Methods"));
        allowedMethods.Should().Contain("POST");
    }

    // /invites/registrations/team-players must NOT be parsed as /invites/{nano_id}. The path has
    // three segments, so the nano-id extraction finds none — which is what a 400 mentioning nano_id
    // proves.
    [Fact]
    public async Task GET_TeamPlayersRegistrations_Should_Not_Be_Treated_As_An_Invite_Id()
    {
        var response = await _httpClient.GetAsync(RoutePath);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var body = await response.Content.ReadAsStringAsync();
        body.Should().Contain("nano_id");
    }

    [Fact]
    public async Task POST_TeamPlayersRegistrations_WithEmptyPlayerNames_Should_Return_400()
    {
        if (RunningAgainst.ACloudEnvironmentIsTrue())
        {
            // Without a token the authorizer answers first, so the handler never validates.
            return;
        }

        var response = await PostRegistrationsAsync();

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var body = await response.Content.ReadAsStringAsync();
        body.Should().Contain("player_names");
    }

    [Fact]
    public async Task POST_TeamPlayersRegistrations_WithWrongContentType_Should_Return_415()
    {
        if (RunningAgainst.ACloudEnvironmentIsTrue())
        {
            return;
        }

        var content = new StringContent("not json", Encoding.UTF8, "text/plain");
        var response = await _httpClient.PostAsync(RoutePath, content);

        response.StatusCode.Should().Be(HttpStatusCode.UnsupportedMediaType);
    }

    [Fact]
    public async Task POST_TeamPlayersRegistrations_WithMalformedBody_Should_Return_400()
    {
        if (RunningAgainst.ACloudEnvironmentIsTrue())
        {
            return;
        }

        var content = new StringContent("{ not json", Encoding.UTF8, "application/json");
        var response = await _httpClient.PostAsync(RoutePath, content);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    // ------------------------------------------------------------------ helpers

    private async Task<HttpResponseMessage> PostRegistrationsAsync(params string[] playerNames)
    {
        var payload = JsonSerializer.Serialize(new
        {
            league = League,
            season = Season,
            team_division = Division,
            team_name = Team,
            player_names = playerNames
        });

        return await _httpClient.PostAsync(RoutePath,
            new StringContent(payload, Encoding.UTF8, "application/json"));
    }

    // FluentAssertions predicates are expression trees, which cannot contain `out _`.
    private static bool HasPlayerName(JsonElement entry) => entry.TryGetProperty("player_name", out _);

    private static async Task<List<JsonElement>> ReadPlayersAsync(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();
        using var json = JsonDocument.Parse(body);
        // Clone() detaches each element from the document. Without it the caller reads elements whose
        // backing JsonDocument this method has already disposed, and every access throws
        // ObjectDisposedException.
        return json.RootElement.GetProperty("players").EnumerateArray().Select(e => e.Clone()).ToList();
    }

    // A PLAYER invite for the claim's team. Creating a CAPTAIN or PLAYER invite never reaches Cognito
    // (only CLUB_MANAGER does), so fixtures cost nothing from the Cognito budget.
    private async Task<string> CreatePlayerInviteAsync(string playerName)
    {
        var payload = JsonSerializer.Serialize(new
        {
            invitee_name = playerName,
            invitee_email_id = UnacceptedInviteeEmail,
            invitee_role = "PLAYER",
            invitee_team = Team,
            team_division = Division,
            league = League,
            season = Season,
            invited_by = "Acceptance Test"
        });

        var response = await _httpClient.PostAsync("/invites",
            new StringContent(payload, Encoding.UTF8, "application/json"));
        response.StatusCode.Should().Be(HttpStatusCode.Created,
            because: "the test fixture could not be created: {0}", await response.Content.ReadAsStringAsync());

        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var nanoId = json.RootElement.GetProperty("nano_id").GetString()!;
        _createdInviteIds.Add(nanoId);
        return nanoId;
    }

    private async Task AuthenticateAsAsync(string email)
    {
        var idToken = await CognitoTestLogin.GetIdTokenAsync(_cognitoClient, _userPoolId, _clientId, email, TestUserPassword);
        _httpClient.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", idToken);
    }
}

using System.Collections.Concurrent;
using System.Net;
using System.Text;
using System.Text.Json;
using Amazon.CognitoIdentityProvider;
using Amazon.CognitoIdentityProvider.Model;
using FluentAssertions;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.APIGateway.AcceptanceTests;

// Acceptance tests for POST /invites/registrations.
//
// This is the ONLY route under /invites that the API Gateway authorizer protects
[Trait("Environment", "Staging")]
public class TeamRegistrationsAcceptanceTests : IAsyncLifetime
{
    private const string League = "CLTTL";
    private const string Season = "2025-2026";
    private const string ClubName = "Morpeth Table Tennis Club";
    private const string ClubLocation = "London";

    // The CALLER. Exact league + season + club + location match for this club, so the security check
    // passes. Used read-only: this class logs in as them and never accepts an invite on their behalf.
    private const string ManagerUserEmail = "test_already_registered3@user.test";

    // The CALLER for the non-manager case. Has custom:active_seasons but no managed_clubs.
    private const string NonManagerUserEmail = "test_already_registered@user.test";

    // The INVITEE for fixtures that get accepted, and it must not be either of the users above.
    private const string AcceptInviteUserEmail = "test_team_registrations_invitee@user.test";

    // The invitee for fixtures that are created and NEVER accepted, which is every fixture but one.
    private const string UnacceptedInviteeEmail = "team_registrations_never_accepted@example.com";

    private const string TestUserPassword = "aA1!56789012";

    private readonly HttpClient _httpClient;
    private readonly IAmazonCognitoIdentityProvider _cognitoClient;
    private readonly string _userPoolId;
    private readonly string _clientId;
    private readonly ConcurrentBag<string> _createdInviteIds = new();

    // Unique per TEST — xUnit constructs a new instance of this class for every test method — so no
    // test can collide with another, with a separate run, or with the rows already sitting in the
    // shared CLTTL/2025-2026 partition.
    private readonly string _teamPrefix = $"AcceptanceTeam-{Guid.NewGuid():N}";

    private const string AcceptedFixtureTeam = "TeamRegistrations Fixture Accepted";

    public TeamRegistrationsAcceptanceTests()
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
    public async Task POST_TeamRegistrations_AsClubManager_Should_Return_All_Three_Statuses()
    {
        // Only the accepted one is fixed — see AcceptedFixtureTeam. The other two never reach Cognito,
        // so they stay unique and genuinely isolated.
        var acceptedTeam = AcceptedFixtureTeam;
        var pendingTeam = $"{_teamPrefix} Pending";
        var absentTeam = $"{_teamPrefix} Absent";

        // The accepted fixture is invited against the disposable user, never the manager — see the
        // comment on AcceptInviteUserEmail.
        var acceptedId = await CreateCaptainInviteAsync(acceptedTeam, AcceptInviteUserEmail);
        await AcceptInviteAsync(acceptedId, 1786000000);
        var pendingId = await CreateCaptainInviteAsync(pendingTeam, UnacceptedInviteeEmail);

        await AuthenticateAsAsync(ManagerUserEmail);

        var response = await PostRegistrationsAsync(acceptedTeam, pendingTeam, absentTeam);

        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await response.Content.ReadAsStringAsync();
        using var json = JsonDocument.Parse(body);
        var root = json.RootElement;

        root.GetProperty("league").GetString().Should().Be(League);
        root.GetProperty("club_name").GetString().Should().Be(ClubName);

        var teams = root.GetProperty("teams").EnumerateArray().ToList();
        teams.Should().HaveCount(3);

        // One entry per requested team, in the order they were sent.
        teams[0].GetProperty("team_name").GetString().Should().Be(acceptedTeam);
        teams[0].GetProperty("status").GetString().Should().Be("ACCEPTED");
        teams[0].GetProperty("nano_id").GetString().Should().Be(acceptedId);
        teams[0].GetProperty("accepted_at").GetInt64().Should().Be(1786000000);

        teams[1].GetProperty("team_name").GetString().Should().Be(pendingTeam);
        teams[1].GetProperty("status").GetString().Should().Be("PENDING");
        teams[1].GetProperty("nano_id").GetString().Should().Be(pendingId);
        // accepted_at is ALWAYS present and explicitly null when not accepted.
        teams[1].GetProperty("accepted_at").ValueKind.Should().Be(JsonValueKind.Null);

        teams[2].GetProperty("team_name").GetString().Should().Be(absentTeam);
        teams[2].GetProperty("status").GetString().Should().Be("NOT_INVITED");
        teams[2].GetProperty("accepted_at").ValueKind.Should().Be(JsonValueKind.Null);
        // The invite-identity fields are absent entirely when there is no invite to read them from.
        teams[2].TryGetProperty("nano_id", out _).Should().BeFalse();
        teams[2].TryGetProperty("invitee_name", out _).Should().BeFalse();
    }

    [Fact]
    [Trait("Cognito", "Live")]
    public async Task POST_TeamRegistrations_Should_Not_Leak_The_Index_Key()
    {
        var team = $"{_teamPrefix} NoLeak";
        await CreateCaptainInviteAsync(team, UnacceptedInviteeEmail);

        await AuthenticateAsAsync(ManagerUserEmail);

        var response = await PostRegistrationsAsync(team);
        var body = await response.Content.ReadAsStringAsync();

        // league_season is a stored DynamoDB attribute and an internal index key. It must never reach
        // a client, on this endpoint or any other.
        body.Should().NotContain("league_season");
    }

    [Fact]
    [Trait("Cognito", "Live")]
    public async Task POST_TeamRegistrations_TeamNameMatching_Should_Be_Case_Insensitive()
    {
        var team = $"{_teamPrefix} CaseCheck";
        await CreateCaptainInviteAsync(team, UnacceptedInviteeEmail);

        await AuthenticateAsAsync(ManagerUserEmail);

        var response = await PostRegistrationsAsync(team.ToLowerInvariant());
        var teams = await ReadTeamsAsync(response);

        teams.Should().ContainSingle();
        // invitee_team is hand-typed, so a casing difference is a data-entry slip, not a different
        // team. This test previously pinned the opposite; the rule was deliberately changed.
        teams[0].GetProperty("status").GetString().Should().Be("PENDING");
        // The caller's spelling is still echoed back, so the page can join the response to what it sent.
        teams[0].GetProperty("team_name").GetString().Should().Be(team.ToLowerInvariant());
    }

    [Fact]
    [Trait("Cognito", "Live")]
    public async Task POST_TeamRegistrations_TeamNameMatching_Should_Ignore_Surrounding_Whitespace()
    {
        var team = $"{_teamPrefix} TrimCheck";
        await CreateCaptainInviteAsync(team, UnacceptedInviteeEmail);

        await AuthenticateAsAsync(ManagerUserEmail);

        var response = await PostRegistrationsAsync($"  {team}  ");
        var teams = await ReadTeamsAsync(response);

        teams.Should().ContainSingle();
        teams[0].GetProperty("status").GetString().Should().Be("PENDING");
        teams[0].GetProperty("team_name").GetString().Should().Be($"  {team}  ");
    }

    // The security check LOGS AND CONTINUES: a caller who does not manage this club still gets a 200
    // with the data. Deliberate, and recorded as an accepted risk — this test exists so that the day
    // somebody changes it to a 403, they find out here rather than in production.
    [Fact]
    [Trait("Cognito", "Live")]
    public async Task POST_TeamRegistrations_AsNonManager_Should_Still_Return_200_With_Data()
    {
        var team = $"{_teamPrefix} NonManager";
        await CreateCaptainInviteAsync(team, UnacceptedInviteeEmail);

        await AuthenticateAsAsync(NonManagerUserEmail);

        var response = await PostRegistrationsAsync(team);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var teams = await ReadTeamsAsync(response);
        teams.Should().ContainSingle().Which.GetProperty("status").GetString().Should().Be("PENDING");
    }

    // Together these always assert something. Neither is a skip.

    [Fact]
    public async Task POST_TeamRegistrations_WithoutAuth_Should_Return_401_OnACloudEnvironment()
    {
        if (RunningAgainst.ALocalEnvironmentIsTrue())
        {
            // SAM local applies no authorizer; the mirror below covers this case.
            return;
        }

        var response = await PostRegistrationsAsync("Any Team");

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task POST_TeamRegistrations_WithoutAuth_Should_Return_200_OnALocalEnvironment()
    {
        if (RunningAgainst.ACloudEnvironmentIsTrue())
        {
            // The authorizer rejects this on staging/prod; the mirror above covers it.
            return;
        }

        var response = await PostRegistrationsAsync("Any Team");

        // NOT evidence that the endpoint is unprotected — only that SAM local does not enforce the
        // authorizer. The protection is asserted by the mirror above, on a cloud environment.
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task OPTIONS_TeamRegistrations_Should_Allow_POST()
    {
        var request = new HttpRequestMessage(HttpMethod.Options, "/invites/registrations");
        request.Headers.Add("Origin", "https://example.com");

        var response = await _httpClient.SendAsync(request);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var allowedMethods = string.Join(",", response.Headers.TryGetValues("Access-Control-Allow-Methods", out var v)
            ? v
            : response.Content.Headers.GetValues("Access-Control-Allow-Methods"));
        allowedMethods.Should().Contain("POST");
    }

    // /invites/registrations must NOT be parsed as /invites/{nano_id}. "registrations" is 14
    // characters, so the nano-id validator rejects it — which is what a 400 here proves.
    [Fact]
    public async Task GET_TeamRegistrations_Should_Not_Be_Treated_As_An_Invite_Id()
    {
        var response = await _httpClient.GetAsync("/invites/registrations");

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var body = await response.Content.ReadAsStringAsync();
        body.Should().Contain("nano_id");
    }


    [Fact]
    public async Task POST_TeamRegistrations_WithEmptyTeamNames_Should_Return_400()
    {
        if (RunningAgainst.ACloudEnvironmentIsTrue())
        {
            // Without a token the authorizer answers first, so the handler never validates.
            return;
        }

        var response = await PostRegistrationsAsync();

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var body = await response.Content.ReadAsStringAsync();
        body.Should().Contain("team_names");
    }

    [Fact]
    public async Task POST_TeamRegistrations_WithWrongContentType_Should_Return_415()
    {
        if (RunningAgainst.ACloudEnvironmentIsTrue())
        {
            return;
        }

        var content = new StringContent("not json", Encoding.UTF8, "text/plain");
        var response = await _httpClient.PostAsync("/invites/registrations", content);

        response.StatusCode.Should().Be(HttpStatusCode.UnsupportedMediaType);
    }

    [Fact]
    public async Task POST_TeamRegistrations_WithMalformedBody_Should_Return_400()
    {
        if (RunningAgainst.ACloudEnvironmentIsTrue())
        {
            return;
        }

        var content = new StringContent("{ not json", Encoding.UTF8, "application/json");
        var response = await _httpClient.PostAsync("/invites/registrations", content);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    // ------------------------------------------------------------------ helpers

    private async Task<HttpResponseMessage> PostRegistrationsAsync(params string[] teamNames)
    {
        var payload = JsonSerializer.Serialize(new
        {
            league = League,
            season = Season,
            club_name = ClubName,
            club_location = ClubLocation,
            team_names = teamNames
        });

        return await _httpClient.PostAsync("/invites/registrations",
            new StringContent(payload, Encoding.UTF8, "application/json"));
    }

    private static async Task<List<JsonElement>> ReadTeamsAsync(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();
        using var json = JsonDocument.Parse(body);
        // Clone() detaches each element from the document. Without it the caller reads elements whose
        // backing JsonDocument this method has already disposed, and every access throws
        // ObjectDisposedException.
        return json.RootElement.GetProperty("teams").EnumerateArray().Select(e => e.Clone()).ToList();
    }

    private async Task<string> CreateCaptainInviteAsync(string teamName, string inviteeEmail)
    {
        var payload = JsonSerializer.Serialize(new
        {
            invitee_name = "Acceptance Captain",
            invitee_email_id = inviteeEmail,
            invitee_role = "CAPTAIN",
            invitee_team = teamName,
            team_division = "Division 4",
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

    // PATCH /invites/{nano_id} requires the INVITEE's email to belong to a registered Cognito user,
    // which is why the fixtures are created against a static test user rather than a made-up address.
    private async Task AcceptInviteAsync(string nanoId, long acceptedAt)
    {
        var payload = JsonSerializer.Serialize(new { accepted_at = acceptedAt });
        var request = new HttpRequestMessage(HttpMethod.Patch, $"/invites/{nanoId}")
        {
            Content = new StringContent(payload, Encoding.UTF8, "application/json")
        };

        var response = await _httpClient.SendAsync(request);
        response.StatusCode.Should().Be(HttpStatusCode.OK,
            because: "the test fixture could not be accepted: {0}", await response.Content.ReadAsStringAsync());
    }

    private async Task AuthenticateAsAsync(string email)
    {
        var idToken = await LoginAndGetIdTokenAsync(email, TestUserPassword);
        _httpClient.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", idToken);
    }

    // Copied from ClubsAndTournamentsAcceptanceTests, as the plan specifies. Third copy in this
    // namespace; extracting a shared helper would be a change to the other two classes.
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
}

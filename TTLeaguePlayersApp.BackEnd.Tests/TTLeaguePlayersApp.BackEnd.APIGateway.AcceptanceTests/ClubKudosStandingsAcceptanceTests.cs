using System.Net;
using System.Text;
using System.Text.Json;
using Amazon.CognitoIdentityProvider;
using Amazon.CognitoIdentityProvider.Model;
using FluentAssertions;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.APIGateway.AcceptanceTests;

// Acceptance tests for POST /kudos/clubstandings.
//
// WITHOUT the class-level Environment trait this class would silently never run against staging —
// run_smoke_tests_staging.sh selects on --filter "Environment=Staging".
[Trait("Environment", "Staging")]
public class ClubKudosStandingsAcceptanceTests : IAsyncLifetime
{
    private const string League = "CLTTL";
    private const string Season = "2025-2026";
    private const string ClubName = "Morpeth Table Tennis Club";
    private const string ClubLocation = "London";
    private const string Division = "Division 4";

    // The CALLER. Exact league + season + club + location match, so the security check passes.
    // Read-only here: this class logs in as them and writes nothing, to Cognito or anywhere else.
    private const string ManagerUserEmail = "test_already_registered3@user.test";

    // The CALLER for the not-a-manager case. Has custom:active_seasons but no managed_clubs.
    private const string NonManagerUserEmail = "test_already_registered@user.test";

    private const string TestUserPassword = "aA1!56789012";

    private readonly HttpClient _httpClient;
    private readonly IAmazonCognitoIdentityProvider _cognitoClient;
    private readonly string _userPoolId;
    private readonly string _clientId;

    // THIS CLASS CREATES NO DATA and therefore has no teardown. Every team name it asks about is
    // unique per test instance, so every one is guaranteed to have no kudos and to answer 0/0/0.
    // That is a real assertion, not a weak one: the zero rows come from the seeded left join, which
    // is the single most breakable behaviour in the endpoint.
    private readonly string _teamPrefix = $"AcceptanceStandingsTeam-{Guid.NewGuid():N}";

    public ClubKudosStandingsAcceptanceTests()
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

    public Task DisposeAsync()
    {
        _httpClient.Dispose();
        return Task.CompletedTask;
    }

    [Fact]
    [Trait("Cognito", "Live")]
    public async Task POST_ClubStandings_AsClubManager_Should_Return_One_Entry_Per_Requested_Team_In_Request_Order()
    {
        var teamA = $"{_teamPrefix} A";
        var teamB = $"{_teamPrefix} B";
        var teamC = $"{_teamPrefix} C";

        await AuthenticateAsAsync(ManagerUserEmail);

        var response = await PostClubStandingsAsync(
            (teamA, Division), (teamB, "Division 7"), (teamC, Division));

        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await response.Content.ReadAsStringAsync();
        using var json = JsonDocument.Parse(body);
        var root = json.RootElement;

        root.GetProperty("league").GetString().Should().Be(League);
        root.GetProperty("season").GetString().Should().Be(Season);
        root.GetProperty("club_name").GetString().Should().Be(ClubName);
        root.GetProperty("club_location").GetString().Should().Be(ClubLocation);

        var teams = root.GetProperty("teams").EnumerateArray().ToList();
        teams.Should().HaveCount(3);

        // Request order, NOT sorted by count — and the second team is in a different division, so
        // this also proves the fan-out reached more than one partition.
        teams[0].GetProperty("team_name").GetString().Should().Be(teamA);
        teams[1].GetProperty("team_name").GetString().Should().Be(teamB);
        teams[2].GetProperty("team_name").GetString().Should().Be(teamC);

        // The left join: teams nobody has rated still get a row, with all three counts at zero.
        foreach (var team in teams)
        {
            team.GetProperty("positive_count").GetInt32().Should().Be(0);
            team.GetProperty("neutral_count").GetInt32().Should().Be(0);
            team.GetProperty("negative_count").GetInt32().Should().Be(0);
        }
    }

    [Fact]
    [Trait("Cognito", "Live")]
    public async Task POST_ClubStandings_AsSomeoneWhoDoesNotManageTheClub_Should_Still_Return_200()
    {
        // DOCUMENTS decision 7: the club-manager check is ADVISORY — it logs and continues. This is
        // the test that fails on the day someone makes it enforcing, which is exactly when the
        // decision should be re-argued rather than quietly changed.
        await AuthenticateAsAsync(NonManagerUserEmail);

        var response = await PostClubStandingsAsync(($"{_teamPrefix} A", Division));

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var teams = await ReadTeamsAsync(response);
        teams.Should().ContainSingle();
    }

    // Together these always assert something. Neither is a skip.

    [Fact]
    public async Task POST_ClubStandings_WithoutAuth_Should_Return_401_OnACloudEnvironment()
    {
        if (RunningAgainst.ALocalEnvironmentIsTrue())
        {
            // SAM local applies no authorizer; the mirror below covers this case.
            return;
        }

        var response = await PostClubStandingsAsync(($"{_teamPrefix} A", Division));

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task POST_ClubStandings_WithoutAuth_Should_Return_200_OnALocalEnvironment()
    {
        if (RunningAgainst.ACloudEnvironmentIsTrue())
        {
            // The authorizer rejects this on staging/prod; the mirror above covers it.
            return;
        }

        var response = await PostClubStandingsAsync(($"{_teamPrefix} A", Division));

        // NOT evidence that the endpoint is unprotected — only that SAM local does not enforce the
        // authorizer. The protection is asserted by the mirror above, on a cloud environment.
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task OPTIONS_ClubStandings_Should_Allow_POST()
    {
        var request = new HttpRequestMessage(HttpMethod.Options, "/kudos/clubstandings");
        request.Headers.Add("Origin", "https://example.com");

        var response = await _httpClient.SendAsync(request);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var allowedMethods = string.Join(",", response.Headers.TryGetValues("Access-Control-Allow-Methods", out var v)
            ? v
            : response.Content.Headers.GetValues("Access-Control-Allow-Methods"));
        allowedMethods.Should().Contain("POST");
    }

    // /kudos/clubstandings must NOT be swallowed by the /kudos/standings preflight arm, which
    // matches on a StartsWith PREFIX. A GET reaching the 405 arm is what proves the route is its own.
    //
    // AUTHENTICATED ON PURPOSE. The route sits behind the API Gateway authorizer (it has no
    // Authorizer: NONE entry except for its OPTIONS preflight), so without a token a cloud
    // environment answers 401 and the dispatcher never runs - there is no 405 to observe. Same shape
    // as the 405 tests in KudosAcceptanceTests. The login goes HERE rather than in InitializeAsync
    // because POST_ClubStandings_WithoutAuth_Should_Return_401_OnACloudEnvironment needs the client
    // to stay tokenless.
    [Fact]
    [Trait("Cognito", "Live")]
    public async Task GET_ClubStandings_Should_Return_405()
    {
        await AuthenticateAsAsync(ManagerUserEmail);

        var response = await _httpClient.GetAsync("/kudos/clubstandings");

        response.StatusCode.Should().Be(HttpStatusCode.MethodNotAllowed);
    }

    [Fact]
    public async Task POST_ClubStandings_WithEmptyTeamList_Should_Return_400()
    {
        if (RunningAgainst.ACloudEnvironmentIsTrue())
        {
            // Without a token the authorizer answers first, so the handler never validates.
            return;
        }

        var response = await PostClubStandingsAsync();

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var body = await response.Content.ReadAsStringAsync();
        body.Should().Contain("teams");
    }

    [Fact]
    public async Task POST_ClubStandings_WithABlankTeamDivision_Should_Return_400()
    {
        if (RunningAgainst.ACloudEnvironmentIsTrue())
        {
            return;
        }

        var response = await PostClubStandingsAsync(($"{_teamPrefix} A", ""));

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var body = await response.Content.ReadAsStringAsync();
        body.Should().Contain("team divisions");
    }

    [Fact]
    public async Task POST_ClubStandings_WithMalformedBody_Should_Return_400()
    {
        if (RunningAgainst.ACloudEnvironmentIsTrue())
        {
            return;
        }

        var content = new StringContent("{ not json", Encoding.UTF8, "application/json");
        var response = await _httpClient.PostAsync("/kudos/clubstandings", content);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task POST_ClubStandings_WithWrongContentType_Should_Return_415()
    {
        if (RunningAgainst.ACloudEnvironmentIsTrue())
        {
            return;
        }

        var content = new StringContent("not json", Encoding.UTF8, "text/plain");
        var response = await _httpClient.PostAsync("/kudos/clubstandings", content);

        response.StatusCode.Should().Be(HttpStatusCode.UnsupportedMediaType);
    }

    // ------------------------------------------------------------------ helpers

    private async Task<HttpResponseMessage> PostClubStandingsAsync(params (string TeamName, string Division)[] teams)
    {
        var payload = JsonSerializer.Serialize(new
        {
            league = League,
            season = Season,
            club_name = ClubName,
            club_location = ClubLocation,
            teams = teams.Select(team => new { team_name = team.TeamName, team_division = team.Division }).ToArray()
        });

        return await _httpClient.PostAsync("/kudos/clubstandings",
            new StringContent(payload, Encoding.UTF8, "application/json"));
    }

    private static async Task<List<JsonElement>> ReadTeamsAsync(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();
        using var json = JsonDocument.Parse(body);
        // Clone() detaches each element from the document this method is about to dispose.
        return json.RootElement.GetProperty("teams").EnumerateArray().Select(e => e.Clone()).ToList();
    }

    private async Task AuthenticateAsAsync(string email)
    {
        var idToken = await LoginAndGetIdTokenAsync(email, TestUserPassword);
        _httpClient.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", idToken);
    }

    // Copied from TeamRegistrationsAcceptanceTests. Fourth copy in this namespace; extracting a
    // shared helper would mean changing the other three classes, which is its own task.
    // Thin binding to the shared CognitoTestLogin. Kept as a private method of the same name so the
    // call sites in this class stay untouched; the auth flow itself lives in one place now.
    private Task<string> LoginAndGetIdTokenAsync(string email, string password) =>
        CognitoTestLogin.GetIdTokenAsync(_cognitoClient, _userPoolId, _clientId, email, password);
}

using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using Amazon.CognitoIdentityProvider;
using FluentAssertions;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.APIGateway.AcceptanceTests;

[Trait("Environment", "Staging")]
public sealed class StrategyAcceptanceTests : IAsyncLifetime
{
    private const string TestUserEmail = "test_already_registered@user.test";
    private const string TestUserPassword = "aA1!56789012";

    private readonly HttpClient _httpClient;
    private readonly IAmazonCognitoIdentityProvider _cognitoClient;
    private readonly string _userPoolId;
    private readonly string _clientId;

    public StrategyAcceptanceTests()
    {
        var config = new Configuration.DataStore.Loader().GetEnvironmentVariables();
        _userPoolId = config.Cognito.UserPoolId;
        _clientId = config.Cognito.ClientId;
        _cognitoClient = new AmazonCognitoIdentityProviderClient();
        _httpClient = new HttpClient { BaseAddress = config.ApiGateWay.ApiBaseUrl, Timeout = TimeSpan.FromSeconds(30) };
    }

    public Task InitializeAsync() => Task.CompletedTask;

    public Task DisposeAsync()
    {
        _httpClient.Dispose();
        _cognitoClient.Dispose();
        return Task.CompletedTask;
    }

    [Fact]
    [Trait("Cognito", "Live")]
    public async Task GET_Should_Be_Protected()
    {
        if (RunningAgainst.ALocalEnvironmentIsTrue()) return;

        _httpClient.DefaultRequestHeaders.Authorization = null;

        var response = await _httpClient.GetAsync(ComparisonPath());

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);

        response = await _httpClient.GetAsync(ProjectionPath());

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task OPTONS_Should_Return_200_For_CORS_Preflight()
    {

        var request = new HttpRequestMessage(HttpMethod.Options, "/strategy/team-comparisons");
        request.Headers.Add("Origin", "http://localhost:3000");
        request.Headers.Add("Access-Control-Request-Method", "GET");
        var response = await _httpClient.SendAsync(request);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        response.Headers.Should().ContainKey("Access-Control-Allow-Origin");
        response.Headers.Should().ContainKey("Access-Control-Allow-Headers");
        response.Headers.Should().ContainKey("Access-Control-Allow-Methods");


        request = new HttpRequestMessage(HttpMethod.Options, "/strategy/table-projections");
        request.Headers.Add("Origin", "http://localhost:3000");
        request.Headers.Add("Access-Control-Request-Method", "GET");
        response = await _httpClient.SendAsync(request);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        response.Headers.Should().ContainKey("Access-Control-Allow-Origin");
        response.Headers.Should().ContainKey("Access-Control-Allow-Headers");
        response.Headers.Should().ContainKey("Access-Control-Allow-Methods");        
    }

    [Fact]
    [Trait("Cognito", "Live")]
    public async Task GET_TeamComparisons_ReturnPendingWithRetryAfter()
    {
        await AuthenticateAsync();

        var response = await _httpClient.GetAsync(ComparisonPath());

        response.StatusCode.Should().Be(HttpStatusCode.Accepted);
        response.Headers.RetryAfter.Should().NotBeNull();
        response.Headers.RetryAfter!.Delta.Should().Be(TimeSpan.FromSeconds(16));
        response.Headers.GetValues("Access-Control-Expose-Headers").Single().Should().Contain("Retry-After");
    }

    [Fact]
    [Trait("Cognito", "Live")]
    public async Task GET_TableProjections_ReturnEmptyObjectOnlyIfEveryConfiguredSourcePasses()
    {
        await AuthenticateAsync();

        HttpResponseMessage response;
        try
        {
            response = await _httpClient.GetAsync(ProjectionPath());
        }
        catch (OperationCanceledException exception)
        {
            throw new Xunit.Sdk.XunitException($"Strategy source validation timed out after 30 seconds. This is a failure; inspect the strategy Lambda logs for the source and request IDs. {exception.Message}");
        }

        using (response)
        {
            var body = await response.Content.ReadAsStringAsync();
            response.StatusCode.Should().Be(
                HttpStatusCode.OK,
                $"staging source validation must succeed; status={(int)response.StatusCode}, body={body}. If this is 503, inspect the strategy Lambda logs for the failing source.");
            using var json = JsonDocument.Parse(body);
            json.RootElement.ValueKind.Should().Be(JsonValueKind.Object);
            json.RootElement.EnumerateObject().Should().BeEmpty();
        }
    }

    private async Task AuthenticateAsync()
    {
        var idToken = await CognitoTestLogin.GetIdTokenAsync(
            _cognitoClient,
            _userPoolId,
            _clientId,
            TestUserEmail,
            TestUserPassword);
        _httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", idToken);
    }

    private static string ComparisonPath()
        => "/strategy/team-comparisons?league=CLTTL&season=2026-2027&team_division=Division%204&team_name=Morpeth%2010&opponent_team_name=Morpeth%209";

    private static string ProjectionPath()
        => "/strategy/table-projections?league=CLTTL&season=2026-2027&team_division=Division%204";

}

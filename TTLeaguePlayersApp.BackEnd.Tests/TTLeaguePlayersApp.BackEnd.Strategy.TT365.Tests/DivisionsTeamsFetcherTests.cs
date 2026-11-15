using TTLeaguePlayersApp.BackEnd.Strategy.TT365;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.Tests.Strategy.TT365;

public sealed class DivisionsTeamsFetcherTests
{
    private static readonly IReadOnlyDictionary<string, Uri> StrategySources = Clttl2026TestConfig.Load().StrategySources;
    private static readonly Uri DivisionsTeamsListUri = StrategySources["Divisions Teams List"];
    private static readonly Uri TeamPlayersUriPrefix = StrategySources["Divisions Teams Players List"];

    [Fact]
    public async Task FetchDivisionsAndTeamsAsync_FetchesTheConfiguredSourceAndReturnsItsContent()
    {
        const string html = "<select id=\"teamSelect\"></select>";
        var proxy = CreateProxy((DivisionsTeamsListUri, html));
        var fetcher = new CLTTLStrategy2026Fetcher(proxy, StrategySources);

        var result = await fetcher.FetchDivisionsAndTeamsAsync();

        Assert.Equal(html, result);
        Assert.Equal([DivisionsTeamsListUri], proxy.RequestedUrls);
    }

    [Fact]
    public async Task FetchTeamPlayersAsync_AppendsTheEscapedTeamIdToTheConfiguredPrefix()
    {
        const string json = "{\"teamPlayers\":[],\"otherPlayers\":[]}";
        var teamId = "team 75697";
        var expectedUri = new Uri(TeamPlayersUriPrefix.OriginalString + Uri.EscapeDataString(teamId));
        var proxy = CreateProxy((expectedUri, json));
        var fetcher = new CLTTLStrategy2026Fetcher(proxy, StrategySources);

        var result = await fetcher.FetchTeamPlayersAsync(teamId);

        Assert.Equal(json, result);
        Assert.Equal([expectedUri], proxy.RequestedUrls);
    }

    [Fact]
    public async Task FetchTeamPlayersAsync_PropagatesProxyFailure()
    {
        var teamId = "75697";
        var expectedUri = new Uri(TeamPlayersUriPrefix.OriginalString + teamId);
        var failure = new HttpRequestException("configured network failure");
        var proxy = new ScraperProxyImpersonator(new Dictionary<Uri, IReadOnlyList<ScraperProxyImpersonatorResponse>>
        {
            [expectedUri] = [ScraperProxyImpersonatorResponse.FromException(failure)]
        });
        var fetcher = new CLTTLStrategy2026Fetcher(proxy, StrategySources);

        var thrownException = await Assert.ThrowsAsync<HttpRequestException>(() => fetcher.FetchTeamPlayersAsync(teamId));

        Assert.Same(failure, thrownException);
        Assert.Equal([expectedUri], proxy.RequestedUrls);
    }

    private static ScraperProxyImpersonator CreateProxy((Uri Url, string Content) response) =>
        new(new Dictionary<Uri, IReadOnlyList<ScraperProxyImpersonatorResponse>>
        {
            [response.Url] = [ScraperProxyImpersonatorResponse.FromContent(response.Content)]
        });
}

using System.Net;
using CurlImpersonate.Enums;
using CurlImpersonate.Http;
using TTLeaguePlayersApp.BackEnd.Strategy.Lambdas;
using TTLeaguePlayersApp.BackEnd.Strategy.TT365;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.Tests.Strategy.TT365;

public sealed class FixturesFetcherTests
{
    [Fact]
    public async Task FetchFixturesAsync_FetchesTheConfiguredSourceOnce()
    {
        var sources = Clttl2026TestConfig.Load().StrategySources;
        var source = sources["Fixtures"];
        const string html = "<html>Fixtures response</html>";
        var proxy = new ScraperProxyImpersonator(new Dictionary<Uri, IReadOnlyList<ScraperProxyImpersonatorResponse>>
        {
            [source] = [ScraperProxyImpersonatorResponse.FromContent(html)]
        });
        var fetcher = new CLTTLStrategy2026Fetcher(proxy, sources);

        var result = await fetcher.FetchFixturesAsync();

        Assert.Equal(html, result);
        Assert.Equal([source], proxy.RequestedUrls);
    }

    [Theory]
    [InlineData(HttpStatusCode.Forbidden)]
    [InlineData(HttpStatusCode.GatewayTimeout)]
    public async Task FetchFixturesAsync_PreservesHttpErrorResponsesAsSourceFailures(HttpStatusCode status)
    {
        var sources = Clttl2026TestConfig.Load().StrategySources;
        var source = sources["Fixtures"];
        var failure = new HttpRequestException("configured fixtures fetch failure", null, status);
        var proxy = new ScraperProxyImpersonator(new Dictionary<Uri, IReadOnlyList<ScraperProxyImpersonatorResponse>>
        {
            [source] = [ScraperProxyImpersonatorResponse.FromException(failure)]
        });
        var fetcher = new CLTTLStrategy2026Fetcher(proxy, sources);

        var thrown = await Assert.ThrowsAsync<StrategySourceCheckException>(() => fetcher.FetchFixturesAsync());

        Assert.Equal("Fixtures", thrown.SourceName);
        Assert.Equal("fetch", thrown.Stage);
        Assert.False(thrown.IsTimeout);
        Assert.Same(failure, thrown.InnerException);
        Assert.Equal([source], proxy.RequestedUrls);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task FetchFixturesAsync_TypesConfirmedTimeoutAndPreservesItsCause(bool curlTimeout)
    {
        var sources = Clttl2026TestConfig.Load().StrategySources;
        Exception failure = curlTimeout
            ? new HttpRequestException("curl failed", new CurlException(CurlCode.OperationTimedOut))
            : new TaskCanceledException("HTTP deadline elapsed", new TimeoutException());
        var proxy = new ScraperProxyImpersonator(new Dictionary<Uri, IReadOnlyList<ScraperProxyImpersonatorResponse>>
        {
            [sources["Fixtures"]] = [ScraperProxyImpersonatorResponse.FromException(failure)]
        });
        var fetcher = new CLTTLStrategy2026Fetcher(proxy, sources);

        var thrown = await Assert.ThrowsAsync<StrategySourceCheckException>(() => fetcher.FetchFixturesAsync());

        Assert.Equal("Fixtures", thrown.SourceName);
        Assert.True(thrown.IsTimeout);
        Assert.Same(failure, thrown.InnerException);
    }

    [Fact]
    public async Task FetchFixturesAsync_LeavesUnexplainedCancellationUntyped()
    {
        var sources = Clttl2026TestConfig.Load().StrategySources;
        var failure = new TaskCanceledException("Unknown cancellation");
        var proxy = new ScraperProxyImpersonator(new Dictionary<Uri, IReadOnlyList<ScraperProxyImpersonatorResponse>>
        {
            [sources["Fixtures"]] = [ScraperProxyImpersonatorResponse.FromException(failure)]
        });
        var fetcher = new CLTTLStrategy2026Fetcher(proxy, sources);

        var thrown = await Assert.ThrowsAsync<TaskCanceledException>(() => fetcher.FetchFixturesAsync());

        Assert.Same(failure, thrown);
    }

    [Fact]
    public void Constructor_RejectsMissingFixturesSource()
    {
        var sources = Clttl2026TestConfig.Load().StrategySources.ToDictionary(pair => pair.Key, pair => pair.Value);
        sources.Remove("Fixtures");
        var proxy = new ScraperProxyImpersonator(new Dictionary<Uri, IReadOnlyList<ScraperProxyImpersonatorResponse>>());
        var thrown = Assert.Throws<ArgumentException>(() => new CLTTLStrategy2026Fetcher(proxy, sources));
        Assert.Contains("Fixtures", thrown.Message);
        Assert.Empty(proxy.RequestedUrls);
    }

    [Fact]
    public void Constructor_RejectsRelativeFixturesSourceWithoutContactingProxy()
    {
        var sources = Clttl2026TestConfig.Load().StrategySources.ToDictionary(pair => pair.Key, pair => pair.Value);
        sources["Fixtures"] = new Uri("fixtures", UriKind.Relative);
        var proxy = new ScraperProxyImpersonator(new Dictionary<Uri, IReadOnlyList<ScraperProxyImpersonatorResponse>>());
        var thrown = Assert.Throws<ArgumentException>(() => new CLTTLStrategy2026Fetcher(proxy, sources));

        Assert.Contains("Fixtures", thrown.Message);
        Assert.Contains("absolute", thrown.Message);
        Assert.Empty(proxy.RequestedUrls);
    }
}

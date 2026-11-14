using System.Net;
using CurlImpersonate.Enums;
using CurlImpersonate.Http;
using TTLeaguePlayersApp.BackEnd.Strategy.ScraperProxy;
using ScraperProxyClient = TTLeaguePlayersApp.BackEnd.Strategy.ScraperProxy.ScraperProxy;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.Tests.Strategy.ScraperProxy;

public class ScraperProxyTest
{
    [Fact]
    public async Task FetchAsync_ReturnsResponseTextForSuccessfulStatus()
    {
        var clock = new FakeClock();
        var handler = new SequenceHandler((_, _) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent("<html>content</html>")
        }));
        using var ownedProxy = CreateProxy(handler, clock);
        IScraperProxy proxy = ownedProxy;

        var responseText = await proxy.FetchAsync(new Uri("https://example.test/source"));

        Assert.Equal("<html>content</html>", responseText);
        Assert.Equal(1, handler.RequestCount);
        Assert.Empty(clock.Delays);
    }

    [Fact]
    public async Task FetchAsync_UsesRetryBackoffWhenFailedAttemptAlreadyTookLongerThanRequestInterval()
    {
        var clock = new FakeClock();
        var handler = new SequenceHandler((_, _) =>
        {
            clock.AdvanceBy(TimeSpan.FromSeconds(5));
            return Task.FromException<HttpResponseMessage>(new CurlException(CurlCode.CouldntConnect));
        }, (_, _) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)));
        using var proxy = CreateProxy(handler, clock);

        await proxy.FetchAsync(new Uri("https://example.test/source"));

        Assert.Equal(TimeSpan.FromSeconds(6), handler.RequestStartTimes[1] - handler.RequestStartTimes[0]);
        Assert.Equal(new[] { TimeSpan.FromSeconds(1) }, clock.Delays);
    }

    [Fact]
    public async Task FetchAsync_RetriesTransientCurlFailuresThenReturnsContent()
    {
        var handler = new SequenceHandler(
            (_, _) => Task.FromException<HttpResponseMessage>(new CurlException(CurlCode.CouldntConnect)),
            (_, _) => Task.FromException<HttpResponseMessage>(new HttpRequestException("wrapped curl failure", new CurlException(CurlCode.RecvError))),
            (_, _) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("ok") }));
        var clock = new FakeClock();
        using var proxy = CreateProxy(handler, clock);

        var responseText = await proxy.FetchAsync(new Uri("https://example.test/source"));

        Assert.Equal("ok", responseText);
        Assert.Equal(3, handler.RequestCount);
        Assert.Equal(new[] { TimeSpan.FromSeconds(3), TimeSpan.FromSeconds(3) }, clock.Delays);
        Assert.Equal(TimeSpan.FromSeconds(3), handler.RequestStartTimes[1] - handler.RequestStartTimes[0]);
        Assert.Equal(TimeSpan.FromSeconds(3), handler.RequestStartTimes[2] - handler.RequestStartTimes[1]);
    }

    [Fact]
    public async Task FetchAsync_UsesTwoSecondBackoffAfterSlowSecondAttemptFailure()
    {
        var clock = new FakeClock();
        var handler = new SequenceHandler(
            (_, _) => Task.FromException<HttpResponseMessage>(new CurlException(CurlCode.CouldntConnect)),
            (_, _) =>
            {
                clock.AdvanceBy(TimeSpan.FromSeconds(5));
                return Task.FromException<HttpResponseMessage>(new CurlException(CurlCode.RecvError));
            },
            (_, _) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("ok") }));
        using var proxy = CreateProxy(handler, clock);

        await proxy.FetchAsync(new Uri("https://example.test/source"));

        Assert.Equal(new[] { TimeSpan.FromSeconds(3), TimeSpan.FromSeconds(2) }, clock.Delays);
        Assert.Equal(TimeSpan.FromSeconds(7), handler.RequestStartTimes[2] - handler.RequestStartTimes[1]);
    }

    [Fact]
    public async Task FetchAsync_ExhaustsThreeTransientAttemptsAndPreservesLastFailure()
    {
        var finalFailure = new CurlException(CurlCode.CouldntConnect, "last attempt");
        var clock = new FakeClock();
        var handler = new SequenceHandler(
            (_, _) => Task.FromException<HttpResponseMessage>(new CurlException(CurlCode.CouldntConnect)),
            (_, _) => Task.FromException<HttpResponseMessage>(new CurlException(CurlCode.SendError)),
            (_, _) => Task.FromException<HttpResponseMessage>(finalFailure));
        using var proxy = CreateProxy(handler, clock);

        var exception = await Assert.ThrowsAsync<CurlException>(() => proxy.FetchAsync(new Uri("https://example.test/source")));

        Assert.Same(finalFailure, exception);
        Assert.Equal(3, handler.RequestCount);
        Assert.Equal(new[] { TimeSpan.FromSeconds(3), TimeSpan.FromSeconds(3) }, clock.Delays);
    }

    [Fact]
    public async Task FetchAsync_DoesNotRetryHttpFailureAndPreservesStatusCode()
    {
        var forbiddenContent = new TrackingContent("denied");
        var handler = new SequenceHandler(
            (_, _) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.Forbidden) { Content = forbiddenContent }),
            (_, _) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("recovered") }));
        using var proxy = CreateProxy(handler);

        var exception = await Assert.ThrowsAsync<HttpRequestException>(() => proxy.FetchAsync(new Uri("https://example.test/source")));

        Assert.Equal(HttpStatusCode.Forbidden, exception.StatusCode);
        Assert.True(forbiddenContent.IsDisposed);
        Assert.Equal("recovered", await proxy.FetchAsync(new Uri("https://example.test/source")));
        Assert.Equal(2, handler.RequestCount);
        proxy.Dispose();
        Assert.False(handler.IsDisposed);
    }

    [Fact]
    public async Task FetchAsync_DoesNotRetryPermanentCurlFailure()
    {
        var clock = new FakeClock();
        var handler = new SequenceHandler((_, _) => Task.FromException<HttpResponseMessage>(new CurlException(CurlCode.SslConnectError)));
        using var proxy = CreateProxy(handler, clock);

        await Assert.ThrowsAsync<CurlException>(() => proxy.FetchAsync(new Uri("https://example.test/source")));

        Assert.Equal(1, handler.RequestCount);
        Assert.Empty(clock.Delays);
    }

    [Fact]
    public async Task FetchAsync_AllowsIndependentRequestsToOverlap()
    {
        var firstRequestStarted = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var secondRequestStarted = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var releaseFirstRequest = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var handler = new SequenceHandler(async (_, _) =>
        {
            firstRequestStarted.SetResult();
            await releaseFirstRequest.Task;
            return new HttpResponseMessage(HttpStatusCode.OK);
        }, (_, _) =>
        {
            secondRequestStarted.SetResult();
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK));
        });
        using var proxy = CreateProxy(handler);

        var firstRequest = proxy.FetchAsync(new Uri("https://example.test/first"));
        await firstRequestStarted.Task;
        var secondRequest = proxy.FetchAsync(new Uri("https://example.test/second"));
        await secondRequestStarted.Task.WaitAsync(TimeSpan.FromSeconds(1));
        releaseFirstRequest.SetResult();
        await Task.WhenAll(firstRequest, secondRequest);

        Assert.Equal(2, handler.RequestCount);
    }

    [Fact]
    public async Task FetchAsync_LeavesStandardHttpClientTransportUntouched()
    {
        var handler = new SequenceHandler((_, _) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)));
        using var proxy = CreateProxy(handler);
        using var standardHttpClient = new HttpClient(new SequenceHandler((_, _) =>
            Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("standard") })));

        Assert.Equal("standard", await standardHttpClient.GetStringAsync("https://example.test/source"));
        await proxy.FetchAsync(new Uri("https://example.test/source"));
        Assert.Equal(1, handler.RequestCount);
    }

    private static ScraperProxyClient CreateProxy(SequenceHandler handler, FakeClock? clock = null)
    {
        clock ??= new FakeClock();
        handler.CaptureTime = () => clock.UtcNow;
        return new ScraperProxyClient(handler, disposeHandler: false, clock.DelayAsync, () => clock.UtcNow);
    }

    private sealed class FakeClock
    {
        private DateTimeOffset _utcNow = DateTimeOffset.UnixEpoch;
        public DateTimeOffset UtcNow => _utcNow;
        public List<TimeSpan> Delays { get; } = [];

        public Task DelayAsync(TimeSpan delay)
        {
            Delays.Add(delay);
            _utcNow += delay;
            return Task.CompletedTask;
        }

        public void AdvanceBy(TimeSpan duration) => _utcNow += duration;
    }

    private sealed class TrackingContent(string content) : StringContent(content)
    {
        public bool IsDisposed { get; private set; }

        protected override void Dispose(bool disposing)
        {
            IsDisposed = true;
            base.Dispose(disposing);
        }
    }

    private sealed class SequenceHandler(params Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>>[] responses) : HttpMessageHandler
    {
        private int _requestCount;

        public int RequestCount => _requestCount;
        public bool IsDisposed { get; private set; }
        public List<DateTimeOffset> RequestStartTimes { get; } = [];
        public Func<DateTimeOffset>? CaptureTime { get; set; }
        private readonly object _requestStartTimesLock = new();

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var requestNumber = Interlocked.Increment(ref _requestCount) - 1;
            if (CaptureTime is { } captureTime)
            {
                lock (_requestStartTimesLock)
                    RequestStartTimes.Add(captureTime());
            }
            return await responses[requestNumber](request, cancellationToken);
        }

        protected override void Dispose(bool disposing)
        {
            IsDisposed = true;
            base.Dispose(disposing);
        }
    }
}

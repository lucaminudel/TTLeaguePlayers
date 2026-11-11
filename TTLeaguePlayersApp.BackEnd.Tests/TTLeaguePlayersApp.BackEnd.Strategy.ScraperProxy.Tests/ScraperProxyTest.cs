using System.Net;
using CurlImpersonate.Enums;
using CurlImpersonate.Http;
using ScraperProxyClient = TTLeaguePlayersApp.BackEnd.Strategy.ScraperProxy.ScraperProxy;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.Tests.Strategy.ScraperProxy;

public class ScraperProxyTest
{
    [Fact]
    public async Task FetchAsync_ReturnsResponseTextForSuccessfulStatus()
    {
        var handler = new SequenceHandler((_, _) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent("<html>content</html>")
        }));
        using var proxy = CreateProxy(handler);

        var responseText = await proxy.FetchAsync(new Uri("https://example.test/source"));

        Assert.Equal("<html>content</html>", responseText);
        Assert.Equal(1, handler.RequestCount);
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
        Assert.Equal(new[]
        {
            TimeSpan.FromSeconds(1), TimeSpan.FromSeconds(2), TimeSpan.FromSeconds(2), TimeSpan.FromSeconds(1)
        }, clock.Delays);
    }

    [Fact]
    public async Task FetchAsync_ExhaustsThreeTransientAttemptsAndPreservesLastFailure()
    {
        var finalFailure = new CurlException(CurlCode.CouldntConnect, "last attempt");
        var handler = new SequenceHandler(
            (_, _) => Task.FromException<HttpResponseMessage>(new CurlException(CurlCode.CouldntConnect)),
            (_, _) => Task.FromException<HttpResponseMessage>(new CurlException(CurlCode.SendError)),
            (_, _) => Task.FromException<HttpResponseMessage>(finalFailure));
        using var proxy = CreateProxy(handler);

        var exception = await Assert.ThrowsAsync<CurlException>(() => proxy.FetchAsync(new Uri("https://example.test/source")));

        Assert.Same(finalFailure, exception);
        Assert.Equal(3, handler.RequestCount);
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
        var handler = new SequenceHandler((_, _) => Task.FromException<HttpResponseMessage>(new CurlException(CurlCode.SslConnectError)));
        using var proxy = CreateProxy(handler);

        await Assert.ThrowsAsync<CurlException>(() => proxy.FetchAsync(new Uri("https://example.test/source")));

        Assert.Equal(1, handler.RequestCount);
    }

    [Fact]
    public async Task FetchAsync_SpacesConcurrentRequestStartsByAtLeastThreeSeconds()
    {
        var clock = new FakeClock();
        var handler = new SequenceHandler((_, _) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)),
            (_, _) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)));
        using var proxy = CreateProxy(handler, clock);

        await Task.WhenAll(
            proxy.FetchAsync(new Uri("https://example.test/first")),
            proxy.FetchAsync(new Uri("https://example.test/second")));

        Assert.Equal(TimeSpan.FromSeconds(3), handler.RequestStartTimes[1] - handler.RequestStartTimes[0]);
        Assert.Contains(TimeSpan.FromSeconds(3), clock.Delays);
    }

    [Fact]
    public async Task FetchAsync_CancellationWhileWaitingForRequestGateDoesNotSendAnotherRequest()
    {
        var gateEntered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var releaseFirst = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var handler = new SequenceHandler(async (_, _) =>
        {
            gateEntered.SetResult();
            await releaseFirst.Task;
            return new HttpResponseMessage(HttpStatusCode.OK);
        });
        using var proxy = CreateProxy(handler);
        var firstRequest = proxy.FetchAsync(new Uri("https://example.test/first"));
        await gateEntered.Task;
        using var cancellation = new CancellationTokenSource();
        var queuedRequest = proxy.FetchAsync(new Uri("https://example.test/queued"), cancellation.Token);

        cancellation.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => queuedRequest);
        releaseFirst.SetResult();
        await firstRequest;

        Assert.Equal(1, handler.RequestCount);
    }

    [Fact]
    public async Task FetchAsync_CancellationDuringBackoffDoesNotRetry()
    {
        using var cancellation = new CancellationTokenSource();
        var handler = new SequenceHandler((_, _) => Task.FromException<HttpResponseMessage>(new CurlException(CurlCode.CouldntConnect)));
        var delayStarted = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        using var proxy = new ScraperProxyClient(handler, disposeHandler: false, async (_, token) =>
        {
            delayStarted.SetResult();
            await Task.Delay(Timeout.InfiniteTimeSpan, token);
        }, () => DateTimeOffset.UnixEpoch);

        var request = proxy.FetchAsync(new Uri("https://example.test/source"), cancellation.Token);
        await delayStarted.Task;
        cancellation.Cancel();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => request);
        Assert.Equal(1, handler.RequestCount);
    }

    [Fact]
    public async Task FetchAsync_CancellationInFlightDoesNotRetry()
    {
        using var cancellation = new CancellationTokenSource();
        var requestStarted = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var handler = new SequenceHandler(async (_, token) =>
        {
            requestStarted.SetResult();
            await Task.Delay(Timeout.InfiniteTimeSpan, token);
            return new HttpResponseMessage(HttpStatusCode.OK);
        });
        using var proxy = CreateProxy(handler);
        var request = proxy.FetchAsync(new Uri("https://example.test/source"), cancellation.Token);
        await requestStarted.Task;
        cancellation.Cancel();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => request);
        Assert.Equal(1, handler.RequestCount);
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

        public Task DelayAsync(TimeSpan delay, CancellationToken cancellationToken)
        {
            cancellationToken.ThrowIfCancellationRequested();
            Delays.Add(delay);
            _utcNow += delay;
            return Task.CompletedTask;
        }
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

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var requestNumber = Interlocked.Increment(ref _requestCount) - 1;
            if (CaptureTime is { } captureTime)
                RequestStartTimes.Add(captureTime());
            return await responses[requestNumber](request, cancellationToken);
        }

        protected override void Dispose(bool disposing)
        {
            IsDisposed = true;
            base.Dispose(disposing);
        }
    }
}

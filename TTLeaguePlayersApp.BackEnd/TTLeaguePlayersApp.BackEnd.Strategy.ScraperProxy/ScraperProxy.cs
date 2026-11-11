using CurlImpersonate.Enums;
using CurlImpersonate.Http;

namespace TTLeaguePlayersApp.BackEnd.Strategy.ScraperProxy;

public sealed class ScraperProxy : IDisposable
{
    private static readonly TimeSpan MinimumRequestInterval = TimeSpan.FromSeconds(3);
    private static readonly TimeSpan[] RetryDelays =
    [
        TimeSpan.FromSeconds(1),
        TimeSpan.FromSeconds(2)
    ];

    private readonly HttpClient _httpClient;
    private readonly HttpMessageHandler _handler;
    private readonly bool _disposeHandler;
    private readonly Func<TimeSpan, CancellationToken, Task> _delay;
    private readonly Func<DateTimeOffset> _getUtcNow;
    private readonly SemaphoreSlim _requestGate = new(1, 1);
    private DateTimeOffset? _lastRequestStartedAt;
    private bool _disposed;

    public ScraperProxy()
        : this(
            new CurlHandler(new CurlHandlerOptions { BrowserProfile = BrowserProfile.Chrome142, AllowAutoRedirect = true }),
            disposeHandler: true,
            delay: Task.Delay,
            getUtcNow: () => DateTimeOffset.UtcNow)
    {
    }

    public ScraperProxy(
        HttpMessageHandler handler,
        bool disposeHandler,
        Func<TimeSpan, CancellationToken, Task> delay,
        Func<DateTimeOffset> getUtcNow)
    {
        _handler = handler;
        _disposeHandler = disposeHandler;
        _delay = delay;
        _getUtcNow = getUtcNow;
        _httpClient = new HttpClient(handler, disposeHandler: false)
        {
            Timeout = TimeSpan.FromSeconds(20)
        };
    }

    public async Task<string> FetchAsync(Uri source, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(source);

        if (!source.IsAbsoluteUri)
            throw new ArgumentException("The source URI must be absolute.", nameof(source));

        ObjectDisposedException.ThrowIf(_disposed, this);

        Exception? lastTransientFailure = null;
        for (var attempt = 0; attempt < 3; attempt++)
        {
            await _requestGate.WaitAsync(cancellationToken);
            try
            {
                await WaitForRequestStartSlotAsync(cancellationToken);
                _lastRequestStartedAt = _getUtcNow();

                using var response = await _httpClient.GetAsync(source, cancellationToken);
                response.EnsureSuccessStatusCode();
                return await response.Content.ReadAsStringAsync(cancellationToken);
            }
            catch (Exception exception) when (IsTransientFailure(exception, cancellationToken))
            {
                lastTransientFailure = exception;
            }
            finally
            {
                _requestGate.Release();
            }

            if (attempt < RetryDelays.Length)
                await _delay(RetryDelays[attempt], cancellationToken);
        }

        System.Runtime.ExceptionServices.ExceptionDispatchInfo.Capture(lastTransientFailure!).Throw();

        throw new InvalidOperationException("The retry loop ended without a result or exception.");
    }

    private async Task WaitForRequestStartSlotAsync(CancellationToken cancellationToken)
    {
        if (_lastRequestStartedAt is not { } lastStartedAt)
            return;

        var elapsed = _getUtcNow() - lastStartedAt;
        var remaining = MinimumRequestInterval - elapsed;
        if (remaining > TimeSpan.Zero)
            await _delay(remaining, cancellationToken);
    }

    private static bool IsTransientFailure(Exception exception, CancellationToken cancellationToken)
    {
        if (cancellationToken.IsCancellationRequested)
            return false;

        if (exception is TaskCanceledException)
            return true;

        for (var current = exception; current != null; current = current.InnerException!)
        {
            if (current is CurlException curlException)
            {
                return curlException.ErrorCode is CurlCode.CouldntConnect
                    or CurlCode.SendError
                    or CurlCode.RecvError
                    or CurlCode.OperationTimedOut;
            }
        }

        return false;
    }

    public void Dispose()
    {
        if (_disposed)
            return;

        _disposed = true;
        _httpClient.Dispose();
        if (_disposeHandler)
            _handler.Dispose();
        _requestGate.Dispose();
    }
}

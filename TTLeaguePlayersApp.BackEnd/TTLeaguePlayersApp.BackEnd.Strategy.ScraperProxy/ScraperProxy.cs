using CurlImpersonate.Enums;
using CurlImpersonate.Http;

namespace TTLeaguePlayersApp.BackEnd.Strategy.ScraperProxy;

public sealed class ScraperProxy : IScraperProxy, IDisposable
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
    private readonly Func<TimeSpan, Task> _delay;
    private readonly Func<DateTimeOffset> _getUtcNow;
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
        Func<TimeSpan, Task> delay,
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

    public async Task<string> FetchAsync(Uri source)
    {
        ArgumentNullException.ThrowIfNull(source);

        if (!source.IsAbsoluteUri)
            throw new ArgumentException("The source URI must be absolute.", nameof(source));

        ObjectDisposedException.ThrowIf(_disposed, this);

        Exception? lastTransientFailure = null;
        for (var attempt = 0; attempt < 3; attempt++)
        {
            var attemptStartedAt = _getUtcNow();
            try
            {
                using var response = await _httpClient.GetAsync(source);
                response.EnsureSuccessStatusCode();
                return await response.Content.ReadAsStringAsync();
            }
            catch (Exception exception) when (IsTransientFailure(exception))
            {
                lastTransientFailure = exception;
            }

            if (attempt < RetryDelays.Length)
            {
                var elapsed = _getUtcNow() - attemptStartedAt;
                var remainingRequestInterval = MinimumRequestInterval - elapsed;
                var retryDelay = RetryDelays[attempt];
                await _delay(remainingRequestInterval > retryDelay ? remainingRequestInterval : retryDelay);
            }
        }

        System.Runtime.ExceptionServices.ExceptionDispatchInfo.Capture(lastTransientFailure!).Throw();

        throw new InvalidOperationException("The retry loop ended without a result or exception.");
    }

    private static bool IsTransientFailure(Exception exception)
    {
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
    }
}

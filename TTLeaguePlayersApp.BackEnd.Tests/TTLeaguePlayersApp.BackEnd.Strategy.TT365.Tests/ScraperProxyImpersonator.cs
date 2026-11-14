using TTLeaguePlayersApp.BackEnd.Strategy.ScraperProxy;

namespace TTLeaguePlayersApp.BackEnd.Tests.Strategy.TT365;

public sealed class ScraperProxyImpersonator : IScraperProxy
{
    private readonly Dictionary<string, ResponseSequence> _responsesByUrl;
    private readonly List<Uri> _requestedUrls = [];

    public ScraperProxyImpersonator(IReadOnlyDictionary<Uri, IReadOnlyList<ScraperProxyImpersonatorResponse>> responsesByUrl)
    {
        ArgumentNullException.ThrowIfNull(responsesByUrl);

        _responsesByUrl = new Dictionary<string, ResponseSequence>(StringComparer.Ordinal);
        foreach (var (url, responses) in responsesByUrl)
        {
            ArgumentNullException.ThrowIfNull(url);
            ArgumentNullException.ThrowIfNull(responses);
            if (!url.IsAbsoluteUri)
                throw new ArgumentException("Every configured URL must be absolute.", nameof(responsesByUrl));
            if (responses.Count == 0)
                throw new ArgumentException($"URL '{url.OriginalString}' must have at least one configured response.", nameof(responsesByUrl));
            if (!_responsesByUrl.TryAdd(url.OriginalString, new ResponseSequence(responses)))
                throw new ArgumentException($"URL '{url.OriginalString}' is configured more than once.", nameof(responsesByUrl));
        }
    }

    public IReadOnlyList<Uri> RequestedUrls => _requestedUrls.AsReadOnly();

    public Task<string> FetchAsync(Uri source)
    {
        ArgumentNullException.ThrowIfNull(source);
        if (!source.IsAbsoluteUri)
            throw new ArgumentException("The source URI must be absolute.", nameof(source));

        _requestedUrls.Add(source);

        if (!_responsesByUrl.TryGetValue(source.OriginalString, out var sequence))
            throw new InvalidOperationException($"No impersonated response is configured for exact URL '{source.OriginalString}'.");

        return sequence.Next(source);
    }

    private sealed class ResponseSequence(IReadOnlyList<ScraperProxyImpersonatorResponse> responses)
    {
        private int _nextResponseIndex;

        public Task<string> Next(Uri source)
        {
            if (_nextResponseIndex >= responses.Count)
                throw new InvalidOperationException($"No more impersonated responses are configured for URL '{source.OriginalString}'.");

            var response = responses[_nextResponseIndex++];
            return response.Exception is { } exception
                ? Task.FromException<string>(exception)
                : Task.FromResult(response.Content!);
        }
    }
}

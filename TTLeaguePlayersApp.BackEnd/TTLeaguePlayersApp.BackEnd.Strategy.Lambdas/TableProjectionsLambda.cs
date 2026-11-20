using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Amazon.Lambda.Core;
using TTLeaguePlayersApp.BackEnd.Configuration.DataStore;
using TTLeaguePlayersApp.BackEnd.Strategy.TT365;

namespace TTLeaguePlayersApp.BackEnd.Strategy.Lambdas;

public sealed class TableProjectionsLambda
{
    private const string PlayersSourceName = "Divisions Teams Players List";
    private const string Ranking = "Ranking";
    private const string TeamId = "75774";
    private const int MinimumHtmlBytes = 10_000;

    private static readonly string[] RequiredSourceNames =
    [
        "Divisions Teams List",
        PlayersSourceName,
        "League Tables",
        Ranking,
        "Fixtures"
    ];

    private static readonly Regex TitlePattern = new("<title\\b[^>]*>\\s*\\S.*?</title\\s*>", RegexOptions.IgnoreCase | RegexOptions.Singleline | RegexOptions.Compiled);
    private static readonly Regex BodyPattern = new("<body\\b[^>]*>", RegexOptions.IgnoreCase | RegexOptions.Compiled);

    private readonly ILoggerObserver _observer;
    private readonly IReadOnlyList<ActiveSeasonStrategyConfig> _activeSeasons;
    private readonly Func<Uri, Task<string>> _fetchAsync;

    public TableProjectionsLambda(
        ILoggerObserver observer,
        IReadOnlyList<ActiveSeasonStrategyConfig> activeSeasons,
        Func<Uri, Task<string>> fetchAsync)
    {
        _observer = observer;
        _activeSeasons = activeSeasons;
        _fetchAsync = fetchAsync;
    }

    public async Task HandleAsync(TableProjectionsRequest request, Dictionary<string, string> userClaims, ILambdaContext context)
    {
        ArgumentNullException.ThrowIfNull(request);
        var season = StrategyRequestValidation.GetConfiguredSeason(_activeSeasons, request.League, request.Season);
        var parameters = new Dictionary<string, string> { ["League"] = request.League!, ["Season"] = request.Season! };
        foreach (var sourceName in RequiredSourceNames)
        {
            if (!season.StrategySources.TryGetValue(sourceName, out var sourceUri))
                throw new InvalidOperationException($"The configured strategy source '{sourceName}' is missing.");

            if (sourceName == PlayersSourceName)
                sourceUri = AppendTeamId(sourceUri, TeamId);

            if (sourceName == Ranking)
                sourceUri = AppendTeamId(sourceUri, "1");

            var content = await StrategySourceFetch.FetchAsync(sourceName, sourceUri, _fetchAsync);
            if (sourceName == PlayersSourceName)
                ValidateNonEmptyJson(content);
            else
                ValidateHtml(sourceName, content);
        }

        _observer.OnRuntimeRegularEvent(
            "TABLE PROJECTIONS SOURCES VALIDATED",
            Source(),
            context,
            parameters,
            userClaims);
    }

    private static Uri AppendTeamId(Uri prefix, string teamId)
        => new(prefix.ToString() + Uri.EscapeDataString(teamId), UriKind.Absolute);

    private static void ValidateHtml(string sourceName, string content)
    {
        if (Encoding.UTF8.GetByteCount(content) <= MinimumHtmlBytes ||
            !TitlePattern.IsMatch(content) ||
            !BodyPattern.IsMatch(content))
        {
            throw new StrategySourceCheckException(sourceName, "The HTML response did not contain the required page markers and size.");
        }
    }

    private static void ValidateNonEmptyJson(string content)
    {
        try
        {
            using var document = JsonDocument.Parse(content);
            var isNonEmptyObject = document.RootElement.ValueKind == JsonValueKind.Object && document.RootElement.EnumerateObject().Any();
            var isNonEmptyArray = document.RootElement.ValueKind == JsonValueKind.Array && document.RootElement.GetArrayLength() > 0;
            if (!isNonEmptyObject && !isNonEmptyArray)
                throw new StrategySourceCheckException(PlayersSourceName, "The JSON response must be a non-empty object or array.");
        }
        catch (JsonException failure)
        {
            throw new StrategySourceCheckException(PlayersSourceName, failure.Message, failure);
        }
    }

    private static Dictionary<string, string> Source()
        => new() { ["Class"] = nameof(TableProjectionsLambda), ["Method"] = nameof(HandleAsync) };
}

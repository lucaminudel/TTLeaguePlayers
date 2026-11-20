using CurlImpersonate.Enums;
using CurlImpersonate.Http;
using TTLeaguePlayersApp.BackEnd.Strategy.Lambdas;

namespace TTLeaguePlayersApp.BackEnd.Strategy.TT365;

internal static class StrategySourceFetch
{
    public static async Task<string> FetchAsync(string sourceName, Uri sourceUri, Func<Uri, Task<string>> fetchAsync)
    {
        try
        {
            return await fetchAsync(sourceUri);
        }
        catch (Exception exception) when (exception is HttpRequestException or CurlException or InvalidDataException || IsConfirmedTimeout(exception))
        {
            var original = exception is InvalidDataException
                { InnerException: InvalidOperationException { InnerException: ArgumentException } decodingFailure }
                ? decodingFailure
                : exception;
            throw new StrategySourceCheckException(sourceName, original.Message, original, stage: "fetch",
                isTimeout: IsConfirmedTimeout(exception));
        }
    }

    private static bool IsConfirmedTimeout(Exception exception)
    {
        for (Exception? cause = exception; cause is not null; cause = cause.InnerException)
        {
            if (cause is HttpRequestException { StatusCode: not null })
                return false;

            if (cause is TimeoutException or CurlException { ErrorCode: CurlCode.OperationTimedOut })
                return true;
        }

        return false;
    }
}

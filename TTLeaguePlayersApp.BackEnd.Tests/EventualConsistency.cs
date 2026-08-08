namespace TTLeaguePlayersApp.BackEnd.Tests;

/// <summary>
/// Re-reads a query until the data written by the test's Arrange step is visible to it.
///
/// WHY THIS EXISTS. A DynamoDB global secondary index is only ever eventually consistent 
/// </summary>
public static class EventualConsistency
{
    /// <summary>How long to keep re-reading before giving up and letting the caller assert.</summary>
    private static readonly TimeSpan Timeout = TimeSpan.FromSeconds(5);

    private static readonly TimeSpan PollInterval = TimeSpan.FromMilliseconds(100);

    public static async Task<T> ReadUntilAsync<T>(Func<Task<T>> read, Func<T, bool> hasPropagated)
    {
        ArgumentNullException.ThrowIfNull(read);
        ArgumentNullException.ThrowIfNull(hasPropagated);

        var deadline = DateTime.UtcNow + Timeout;

        T result;
        while (true)
        {
            result = await read();

            if (hasPropagated(result))
            {
                return result;
            }

            if (DateTime.UtcNow >= deadline)
            {
                // Hand back what we last saw so the caller's assertion reports the domain problem.
                return result;
            }

            await Task.Delay(PollInterval);
        }
    }
}

using TTLeaguePlayersApp.BackEnd.Strategy.TT365;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.Tests.Strategy.TT365;

public sealed class CLTTLStrategy2026ProcessorTests
{
    private static readonly IReadOnlyDictionary<string, Uri> StrategySources = Clttl2026TestConfig.Load().StrategySources;
    private static readonly Uri DivisionsUri = StrategySources["Divisions Teams List"];
    private static readonly Uri PlayersUriPrefix = StrategySources["Divisions Teams Players List"];

    [Fact]
    public async Task ProcessAsync_PreservesOrderAndSharedTeamsWhileReusingCompleteGroups()
    {
        var divisionsHtml = ReadFixture("ProcessorTeams.html");
        var alphaUri = new Uri(PlayersUriPrefix.OriginalString + "11");
        var proxy = CreateProxy(
            (DivisionsUri, ScraperProxyImpersonatorResponse.FromContent(divisionsHtml)),
            (alphaUri, ScraperProxyImpersonatorResponse.FromContent(
                ReadFixture("GroupedRosters.json"))));
        var processor = new CLTTLStrategy2026Processor(proxy, StrategySources);

        var (allDivisions, anomalies) = await processor.GetAllDivisionsWithTeamsAndPlayers();

        Assert.Empty(anomalies);
        Assert.Equal(["Division 1", "Premier"], allDivisions.Keys);
        Assert.Equal(["Alpha", "Beta"], allDivisions["division 1"].Teams.Keys);
        Assert.Equal(["Alpha", "Beta", "Gamma"], allDivisions.Values.SelectMany(division => division.Teams.Keys));
        Assert.Equal(["Alpha One", "Alpha Two"], allDivisions["Division 1"].Teams["Alpha"].Players.Keys);
        Assert.Equal(["Beta One"], allDivisions["Division 1"].Teams["Beta"].Players.Keys);
        Assert.Equal(["Gamma One"], allDivisions["Premier"].Teams["Gamma"].Players.Keys);
        Assert.Equal([DivisionsUri, alphaUri], proxy.RequestedUrls);
    }

    [Fact]
    public async Task ProcessAsync_FetchesEachStillEmptyTeamOnceAndContinuesAfterEmptyDirectRoster()
    {
        var divisionsHtml = ReadFixture("ProcessorTeams.html");
        var alphaUri = new Uri(PlayersUriPrefix.OriginalString + "11");
        var betaUri = new Uri(PlayersUriPrefix.OriginalString + "12");
        var gammaUri = new Uri(PlayersUriPrefix.OriginalString + "13");
        var proxy = CreateProxy(
            (DivisionsUri, ScraperProxyImpersonatorResponse.FromContent(divisionsHtml)),
            (alphaUri, ScraperProxyImpersonatorResponse.FromContent(ReadFixture("EmptyRoster.json"))),
            (betaUri, ScraperProxyImpersonatorResponse.FromContent(ReadFixture("SinglePlayerRoster.json"))),
            (gammaUri, ScraperProxyImpersonatorResponse.FromContent(ReadFixture("EmptyRoster.json"))));
        var processor = new CLTTLStrategy2026Processor(proxy, StrategySources);

        var (allDivisions, anomalies) = await processor.GetAllDivisionsWithTeamsAndPlayers();

        Assert.Empty(anomalies);
        Assert.Empty(allDivisions["Division 1"].Teams["Alpha"].Players);
        Assert.Equal(["Beta Player"], allDivisions["Division 1"].Teams["Beta"].Players.Keys);
        Assert.Equal([DivisionsUri, alphaUri, betaUri, gammaUri], proxy.RequestedUrls);
    }

    [Fact]
    public async Task ProcessAsync_AccumulatesRecoverableAnomaliesAcrossFallbackRequests()
    {
        var divisionsHtml = ReadFixture("ProcessorTeams.html");
        var alphaUri = new Uri(PlayersUriPrefix.OriginalString + "11");
        var betaUri = new Uri(PlayersUriPrefix.OriginalString + "12");
        var gammaUri = new Uri(PlayersUriPrefix.OriginalString + "13");
        var proxy = CreateProxy(
            (DivisionsUri, ScraperProxyImpersonatorResponse.FromContent(divisionsHtml)),
            (alphaUri, ScraperProxyImpersonatorResponse.FromContent(
                ReadFixture("MalformedRoster.json"))),
            (betaUri, ScraperProxyImpersonatorResponse.FromContent(
                ReadFixture("UnknownTeamRoster.json"))),
            (gammaUri, ScraperProxyImpersonatorResponse.FromContent(ReadFixture("EmptyRoster.json"))));
        var processor = new CLTTLStrategy2026Processor(proxy, StrategySources);

        var (allDivisions, anomalies) = await processor.GetAllDivisionsWithTeamsAndPlayers();

        Assert.Equal(3, anomalies.Count);
        Assert.Contains(anomalies, anomaly => anomaly.Contains("player name", StringComparison.OrdinalIgnoreCase));
        Assert.Contains(anomalies, anomaly => anomaly.Contains("otherPlayers", StringComparison.Ordinal));
        Assert.Contains(anomalies, anomaly => anomaly.Contains("Unknown Club", StringComparison.Ordinal));
        Assert.Equal(["Alpha Player"], allDivisions["Division 1"].Teams["Alpha"].Players.Keys);
        Assert.Equal(["Beta Player"], allDivisions["Division 1"].Teams["Beta"].Players.Keys);
        Assert.Equal([DivisionsUri, alphaUri, betaUri, gammaUri], proxy.RequestedUrls);
    }

    [Fact]
    public async Task ProcessAsync_PropagatesRequiredFetchFailureWithoutReturningPartialResult()
    {
        var divisionsHtml = ReadFixture("ProcessorTeams.html");
        var alphaUri = new Uri(PlayersUriPrefix.OriginalString + "11");
        var expectedException = new InvalidOperationException("upstream unavailable");
        var proxy = CreateProxy(
            (DivisionsUri, ScraperProxyImpersonatorResponse.FromContent(divisionsHtml)),
            (alphaUri, ScraperProxyImpersonatorResponse.FromException(expectedException)));
        var processor = new CLTTLStrategy2026Processor(proxy, StrategySources);

        var actualException = await Assert.ThrowsAsync<InvalidOperationException>(() => processor.GetAllDivisionsWithTeamsAndPlayers());

        Assert.Same(expectedException, actualException);
        Assert.Equal([DivisionsUri, alphaUri], proxy.RequestedUrls);
    }

    private static string ReadFixture(string name) =>
        File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "Eligibility", name));

    private static ScraperProxyImpersonator CreateProxy(
        params (Uri Url, ScraperProxyImpersonatorResponse Response)[] responses) =>
        new(responses.ToDictionary(
            entry => entry.Url,
            entry => (IReadOnlyList<ScraperProxyImpersonatorResponse>)[entry.Response]));
}

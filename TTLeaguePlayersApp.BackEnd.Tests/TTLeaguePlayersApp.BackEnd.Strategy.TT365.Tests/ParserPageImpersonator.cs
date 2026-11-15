namespace TTLeaguePlayersApp.BackEnd.Tests.Strategy.TT365;

internal static class ParserPageImpersonator
{
    public static string Fetch(string sourceName, string html)
    {
        var source = Clttl2026TestConfig.Load().StrategySources[sourceName];
        if (sourceName == "Ranking")
            source = new Uri(source.OriginalString + "1");
        var proxy = new ScraperProxyImpersonator(new Dictionary<Uri, IReadOnlyList<ScraperProxyImpersonatorResponse>>
        {
            [source] = [ScraperProxyImpersonatorResponse.FromContent(html)]
        });
        return proxy.FetchAsync(source).GetAwaiter().GetResult();
    }

    public static string FetchTeamPlayers(string json, string teamId)
    {
        var prefix = Clttl2026TestConfig.Load().StrategySources["Divisions Teams Players List"];
        var source = new Uri(prefix.OriginalString + Uri.EscapeDataString(teamId));
        var proxy = new ScraperProxyImpersonator(new Dictionary<Uri, IReadOnlyList<ScraperProxyImpersonatorResponse>>
        {
            [source] = [ScraperProxyImpersonatorResponse.FromContent(json)]
        });
        return proxy.FetchAsync(source).GetAwaiter().GetResult();
    }
}

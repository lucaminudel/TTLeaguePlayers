using System.Globalization;
using System.Text.RegularExpressions;
using HtmlAgilityPack;
using TTLeaguePlayersApp.BackEnd.Configuration.DataStore;
using TTLeaguePlayersApp.BackEnd.Strategy.ScraperProxy;
using TTLeaguePlayersApp.BackEnd.Strategy.TT365;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.Tests.ExternalServicesAcceptanceTests.TT365;

public sealed class RankingContentStructureAcceptanceTests
{
    [Fact]
    public async Task FetchesEachRankingPageOnceAndFindsTheStructuresRequiredByTheParser()
    {
        var originalEnvironment = Environment.GetEnvironmentVariable("ENVIRONMENT");
        try
        {
            var configEnvironment = originalEnvironment is "dev" or "test" ? originalEnvironment : "dev";
            Environment.SetEnvironmentVariable("ENVIRONMENT", configEnvironment);
            var configJson = await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory, $"{configEnvironment}.env.json"));
            var clttl = Assert.Single(new Loader(configJson).GetEnvironmentVariables().ActiveSeasonsDataSource,
                season => season.League == "CLTTL" && season.Season == "2026-2027");
            var scraperProxy = new CountingScraperProxy();
            using (scraperProxy)
            {
                var parser = new CLTTLStrategy2026Parser();
                var fetcher = new CLTTLStrategy2026Fetcher(scraperProxy, clttl.StrategySources["Ranking"]);
                var pages = await fetcher.FetchRankingPagesAsync();

                Assert.NotEmpty(pages);
                Assert.NotEmpty(scraperProxy.RequestedUrls);
                Assert.Equal(scraperProxy.RequestedUrls.Count, scraperProxy.RequestedUrls.Distinct().Count());
                Assert.NotEmpty(parser.ParseRankingPlayers(pages).Players);

                foreach (var pageHtml in pages)
                {
                    Assert.True(parser.TryParseRankingPageMetadata(pageHtml, out var metadata));
                    Assert.NotNull(metadata);

                    var document = new HtmlDocument();
                    document.LoadHtml(pageHtml);
                    var table = document.DocumentNode.SelectSingleNode(
                        "//*[contains(concat(' ', normalize-space(@class), ' '), ' tt-ranking-table ')]");
                    Assert.NotNull(table);

                    var rows = table!.SelectNodes(".//tr[td]");
                    Assert.NotNull(rows);
                    Assert.NotEmpty(rows!);
                    var foundMemberLink = false;
                    foreach (var row in rows)
                    {
                        var nameCell = row.SelectSingleNode("./td[contains(concat(' ', normalize-space(@class), ' '), ' tt-ranking-col-name ')]");
                        var currentCell = row.SelectSingleNode("./td[contains(concat(' ', normalize-space(@class), ' '), ' tt-ranking-col-current ')]");
                        Assert.NotNull(nameCell);
                        Assert.NotNull(currentCell);
                        Assert.NotEmpty(HtmlEntity.DeEntitize(nameCell!.InnerText).Trim());
                        Assert.True(int.TryParse(
                            Regex.Replace(currentCell!.InnerText, @"\s|,", string.Empty),
                            NumberStyles.None,
                            CultureInfo.InvariantCulture,
                            out _));

                        if (nameCell.SelectNodes(".//a[@href]") is not { Count: > 0 } memberLinks)
                            continue;
                        foundMemberLink |= memberLinks.Any(link => Regex.IsMatch(
                            link.GetAttributeValue("href", string.Empty),
                            @"(?:\?|&)id=\d+(?:&|$)",
                            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant));
                    }

                    Assert.True(foundMemberLink, "Ranking rows should link to member pages with numeric IDs.");
                    var pagination = document.DocumentNode.SelectSingleNode(
                        "//*[contains(concat(' ', normalize-space(@class), ' '), ' pagination ')]");
                    Assert.NotNull(pagination);
                    var paginationLinks = pagination!.SelectNodes(".//a");
                    Assert.NotNull(paginationLinks);
                    Assert.NotEmpty(paginationLinks!);
                }
            }
        }
        finally
        {
            Environment.SetEnvironmentVariable("ENVIRONMENT", originalEnvironment);
        }
    }

    private sealed class CountingScraperProxy : IScraperProxy, IDisposable
    {
        private readonly ScraperProxy _inner = new();

        public List<Uri> RequestedUrls { get; } = [];

        public Task<string> FetchAsync(Uri uri)
        {
            RequestedUrls.Add(uri);
            return _inner.FetchAsync(uri);
        }

        public void Dispose() => _inner.Dispose();
    }
}

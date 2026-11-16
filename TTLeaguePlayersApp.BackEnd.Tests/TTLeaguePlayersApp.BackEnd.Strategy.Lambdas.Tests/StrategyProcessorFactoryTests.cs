using TTLeaguePlayersApp.BackEnd.Configuration.DataStore;
using TTLeaguePlayersApp.BackEnd.Strategy.Lambdas;
using TTLeaguePlayersApp.BackEnd.Strategy.ScraperProxy;
using TTLeaguePlayersApp.BackEnd.Strategy.TT365;
using TTLeaguePlayersApp.BackEnd.Tests.Strategy.TT365;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.Tests.Strategy.Lambdas;

public sealed class StrategyProcessorFactoryTests
{
    [Fact]
    public void Create_UsesConfiguredProcessorAndSources()
    {
        var processor = StrategyProcessorFactory.Create(Clttl2026TestConfig.Load(), new NoNetworkScraper());

        Assert.IsType<CLTTLStrategy2026Processor>(processor);
    }

    [Theory]
    [InlineData("MissingProcessor")]
    [InlineData("TT365.CLTTLStrategy2026Parser")]
    public void Create_RejectsUnknownOrNonProcessorTypes(string name)
    {
        var season = new ActiveSeasonStrategyConfig("League", "Season", name, new Dictionary<string, Uri>());

        var error = Assert.Throws<InvalidOperationException>(() => StrategyProcessorFactory.Create(season, new NoNetworkScraper()));

        Assert.Contains(name, error.Message, StringComparison.Ordinal);
        Assert.Contains("not a concrete IStrategyProcessor", error.Message, StringComparison.Ordinal);
    }

    private sealed class NoNetworkScraper : IScraperProxy
    {
        public Task<string> FetchAsync(Uri source) => throw new InvalidOperationException("Unexpected network request.");
    }
}

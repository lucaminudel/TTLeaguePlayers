namespace TTLeaguePlayersApp.BackEnd.Strategy.ScraperProxy;

public interface IScraperProxy
{
    Task<string> FetchAsync(Uri source);
}

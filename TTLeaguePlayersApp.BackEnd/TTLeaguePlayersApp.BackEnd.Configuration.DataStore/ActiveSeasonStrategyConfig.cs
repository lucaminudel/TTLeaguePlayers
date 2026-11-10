namespace TTLeaguePlayersApp.BackEnd.Configuration.DataStore;

public record ActiveSeasonStrategyConfig(string League, string Season, string CustomStrategyProcessor, IReadOnlyDictionary<string, Uri> StrategySources);

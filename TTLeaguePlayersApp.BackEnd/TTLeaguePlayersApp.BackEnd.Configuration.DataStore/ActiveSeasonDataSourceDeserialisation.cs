using System.Text.Json.Serialization;

namespace TTLeaguePlayersApp.BackEnd.Configuration.DataStore;

public partial class Loader
{
    internal class ActiveSeasonDataSourceDeserialisation
    {
        [JsonPropertyName("league")]
        public string League { get; set; } = string.Empty;
        [JsonPropertyName("season")]
        public string Season { get; set; } = string.Empty;
        [JsonPropertyName("custom_strategy_processor")]
        public string? CustomStrategyProcessor { get; set; }
        [JsonPropertyName("strategy_sources")]
        public Dictionary<string, string>? StrategySources { get; set; }
    }
}

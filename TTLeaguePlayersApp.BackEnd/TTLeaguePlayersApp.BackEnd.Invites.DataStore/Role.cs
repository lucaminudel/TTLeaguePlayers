using System.Text.Json.Serialization;

namespace TTLeaguePlayersApp.BackEnd.Invites.DataStore;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum Role
{
    PLAYER,
    CAPTAIN
}

using System.Text.Json.Serialization;

namespace TTLeaguePlayersApp.BackEnd.Invites.Lambdas;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum Role
{
    PLAYER,
    CAPTAIN
}

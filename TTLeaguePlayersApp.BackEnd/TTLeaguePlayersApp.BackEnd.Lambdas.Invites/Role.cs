using System.Text.Json.Serialization;

namespace TTLeaguePlayersApp.BackEnd.Lambdas.Invites;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum Role
{
    PLAYER,
    CAPTAIN
}

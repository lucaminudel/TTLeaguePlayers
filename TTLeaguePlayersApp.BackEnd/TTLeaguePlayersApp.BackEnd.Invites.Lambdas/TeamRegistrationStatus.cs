using System.Text.Json.Serialization;

namespace TTLeaguePlayersApp.BackEnd.Invites.Lambdas;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum TeamRegistrationStatus
{
    // A captain invite exists for the team and has been accepted.
    ACCEPTED,

    // A captain invite exists for the team and has not been accepted.
    PENDING,

    // No captain invite record exists for the team in this league and season.
    NOT_INVITED
}

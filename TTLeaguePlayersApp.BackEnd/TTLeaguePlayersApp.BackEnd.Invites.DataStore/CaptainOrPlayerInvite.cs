using System.Text.Json.Serialization;

namespace TTLeaguePlayersApp.BackEnd.Invites.DataStore;

public class CaptainOrPlayerInvite: Invite
{
    [JsonPropertyName("invitee_team")]
    public required string InviteeTeam { get; set; }

    [JsonPropertyName("team_division")]
    public required string TeamDivision { get; set; }
}

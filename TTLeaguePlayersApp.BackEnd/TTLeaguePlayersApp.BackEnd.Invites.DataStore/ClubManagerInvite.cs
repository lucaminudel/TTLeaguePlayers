using System.Text.Json.Serialization;

namespace TTLeaguePlayersApp.BackEnd.Invites.DataStore;

public class ClubManagerInvite: Invite
{
    
    [JsonPropertyName("invitee_club")]
    public required string InviteeClub { get; set; }

    [JsonPropertyName("club_location")]
    public required string ClubLocation { get; set; }

}

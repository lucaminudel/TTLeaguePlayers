using System.Text.Json.Serialization;

namespace TTLeaguePlayersApp.BackEnd.ClubsAndTournaments.DataStore;

// A club as it appears in the read-only listings (all clubs, clubs by location).
// Location and ClubName are carried by every item in the table, club and tournament alike, so a
// club's identity is always known. The promotion profile (Homepage and the socials) only exists
// once the club manager has submitted it, so a null Homepage means: this club has tournaments but
// has never been promoted. Distinct from Club, the write model, where Homepage is required.
public class ClubListing
{
    [JsonPropertyName("location")]
    public required string Location { get; set; }

    [JsonPropertyName("club_name")]
    public required string ClubName { get; set; }

    [JsonPropertyName("homepage")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public Uri? Homepage { get; set; }

    [JsonPropertyName("instagram")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public Uri? Instagram { get; set; }

    [JsonPropertyName("facebook")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public Uri? Facebook { get; set; }

    [JsonPropertyName("youtube")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public Uri? Youtube { get; set; }
}

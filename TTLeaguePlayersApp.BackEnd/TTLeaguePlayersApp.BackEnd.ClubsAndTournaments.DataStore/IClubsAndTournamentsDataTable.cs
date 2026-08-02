namespace TTLeaguePlayersApp.BackEnd.ClubsAndTournaments.DataStore;

public interface IClubsAndTournamentsDataTable
{
    Task UpsertClubAsync(PromotableClub club);
    Task<PromotableClub> RetrieveClubAsync(string location, string clubName);
    Task DeleteClubAsync(string location, string clubName);

    Task UpsertTournamentAsync(Tournament tournament);
    Task<Tournament> RetrieveTournamentAsync(string location, string clubName, string tournamentName);
    Task<List<Tournament>> RetrieveTournamentsForClubAsync(string location, string clubName);
    Task DeleteTournamentAsync(string location, string clubName, string tournamentName);

    Task<List<(ClubListing Club, List<Tournament> Tournaments)>> RetrieveAllClubsWithActiveTournamentsAsync(long now);
    Task<List<(ClubListing Club, List<Tournament> Tournaments)>> RetrieveClubsWithActiveTournamentsByLocationAsync(string location, long now);

    void Dispose();
}

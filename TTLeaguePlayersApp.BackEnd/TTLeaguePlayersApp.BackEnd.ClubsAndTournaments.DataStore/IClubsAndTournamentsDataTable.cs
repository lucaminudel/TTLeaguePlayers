namespace TTLeaguePlayersApp.BackEnd.ClubsAndTournaments.DataStore;

public interface IClubsAndTournamentsDataTable
{
    Task UpsertClubAsync(Club club);
    Task<Club> RetrieveClubAsync(string location, string clubName);
    Task DeleteClubAsync(string location, string clubName);

    Task UpsertTournamentAsync(Tournament tournament);
    Task<Tournament> RetrieveTournamentAsync(string location, string clubName, string tournamentName);
    Task DeleteTournamentAsync(string location, string clubName, string tournamentName);

    Task<List<(Club Club, List<Tournament> Tournaments)>> RetrieveAllClubsWithActiveTournamentsAsync(long now);
    Task<List<(Club Club, List<Tournament> Tournaments)>> RetrieveClubsWithActiveTournamentsByLocationAsync(string location, long now);

    void Dispose();
}

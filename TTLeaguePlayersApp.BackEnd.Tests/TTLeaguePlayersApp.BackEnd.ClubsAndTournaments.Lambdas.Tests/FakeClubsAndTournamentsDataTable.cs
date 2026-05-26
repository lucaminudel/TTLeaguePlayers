using System.Collections.Generic;
using System.Threading.Tasks;
using TTLeaguePlayersApp.BackEnd.ClubsAndTournaments.DataStore;

namespace TTLeaguePlayersApp.BackEnd.ClubsAndTournaments.Lambdas.Tests;

public class FakeClubsAndTournamentsDataTable : IClubsAndTournamentsDataTable
{
    public List<Club> UpsertedClubs { get; } = new();
    public List<Tournament> UpsertedTournaments { get; } = new();
    
    public List<(string location, string clubName)> DeletedClubs { get; } = new();
    public List<(string location, string clubName, string tournamentName)> DeletedTournaments { get; } = new();

    public Club? ClubToReturn { get; set; }
    public Tournament? TournamentToReturn { get; set; }
    
    public List<(Club Club, List<Tournament> Tournaments)> ClubsWithTournamentsToReturn { get; set; } = new();

    public bool ThrowOnUpsertClub { get; set; }
    public bool ThrowOnUpsertTournament { get; set; }
    public bool ThrowOnRetrieveAllClubsWithTournaments { get; set; }
    public bool ThrowOnRetrieveClubsWithTournamentsByLocation { get; set; }

    public Task UpsertClubAsync(Club club)
    {
        if (ThrowOnUpsertClub) throw new System.Exception("Simulated data store failure for club");
        UpsertedClubs.Add(club);
        return Task.CompletedTask;
    }

    public Task<Club> RetrieveClubAsync(string location, string clubName)
    {
        return Task.FromResult(ClubToReturn!);
    }

    public Task DeleteClubAsync(string location, string clubName)
    {
        DeletedClubs.Add((location, clubName));
        return Task.CompletedTask;
    }

    public Task UpsertTournamentAsync(Tournament tournament)
    {
        if (ThrowOnUpsertTournament) throw new System.Exception("Simulated data store failure for tournament");
        UpsertedTournaments.Add(tournament);
        return Task.CompletedTask;
    }

    public bool ThrowOnRetrieveTournament { get; set; }
    public bool ThrowRuntimeErrorOnRetrieveTournament { get; set; }

    public Task<Tournament> RetrieveTournamentAsync(string location, string clubName, string tournamentName)
    {
        if (ThrowOnRetrieveTournament) throw new KeyNotFoundException("Tournament not found");
        if (ThrowRuntimeErrorOnRetrieveTournament) throw new System.Exception("Simulated data store failure for tournament retrieval");
        return Task.FromResult(TournamentToReturn!);
    }

    public Task DeleteTournamentAsync(string location, string clubName, string tournamentName)
    {
        DeletedTournaments.Add((location, clubName, tournamentName));
        return Task.CompletedTask;
    }

    public Task<List<(Club Club, List<Tournament> Tournaments)>> RetrieveAllClubsWithActiveTournamentsAsync(long now)
    {
        if (ThrowOnRetrieveAllClubsWithTournaments) throw new System.Exception("Simulated data store failure for clubs with tournaments retrieval");
        return Task.FromResult(ClubsWithTournamentsToReturn);
    }

    public string? LastRetrieveLocation { get; private set; }

    public Task<List<(Club Club, List<Tournament> Tournaments)>> RetrieveClubsWithActiveTournamentsByLocationAsync(string location, long now)
    {
        LastRetrieveLocation = location;
        if (ThrowOnRetrieveClubsWithTournamentsByLocation) throw new System.Exception("Simulated data store failure for clubs with tournaments by location retrieval");
        return Task.FromResult(ClubsWithTournamentsToReturn);
    }

    public void Dispose()
    {
    }
}

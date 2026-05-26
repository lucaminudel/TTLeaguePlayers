using TTLeaguePlayersApp.BackEnd.Kudos.DataStore;

namespace TTLeaguePlayersApp.BackEnd.Kudos.Lambdas.Tests;

internal sealed class FakeKudosDataTable : IKudosDataTable
{
    public List<DataStore.Kudos> SavedKudos { get; } = new();
    public List<DataStore.Kudos> KudosToReturn { get; set; } = new();
    public RetrieveKudosGivenByPlayerRequest? LastRetrieveKudosGivenByPlayerRequest { get; private set; }
    public List<DeletedKudosRequest> DeletedKudos { get; } = new();

    public bool ThrowOnSaveKudos { get; set; }
    public bool ThrowOnRetrieveKudosGivenByPlayer { get; set; }

    public Task SaveKudosAsync(DataStore.Kudos kudos)
    {
        if (ThrowOnSaveKudos)
        {
            throw new System.Exception("Simulated data store failure for kudos save");
        }

        SavedKudos.Add(kudos);
        return Task.CompletedTask;
    }

    public Task<DataStore.Kudos> RetrieveKudosAsync(string league, string season, string division, string receivingTeam, string homeTeam, string awayTeam, string giverPersonSub)
    {
        return Task.FromResult(SavedKudos.First());
    }

    public Task<KudosSummary> RetrieveSummaryAsync(string league, string season, string division, string receivingTeam, string homeTeam, string awayTeam)
    {
        throw new NotImplementedException();
    }

        public Task DeleteKudosAsync(string league, string season, string division, string receivingTeam, string homeTeam, string awayTeam, string giverPersonSub)
        {
            DeletedKudos.Add(new DeletedKudosRequest
            {
                League = league,
                Season = season,
                Division = division,
                ReceivingTeam = receivingTeam,
                HomeTeam = homeTeam,
                AwayTeam = awayTeam,
                GiverPersonSub = giverPersonSub
            });

            return Task.CompletedTask;
        }

    public Task<List<DataStore.Kudos>> RetrieveKudosGivenByPlayerAsync(string league, string season, string giverPersonSub, string division, string giverTeam)
    {
        LastRetrieveKudosGivenByPlayerRequest = new RetrieveKudosGivenByPlayerRequest
        {
            League = league,
            Season = season,
            TeamDivision = division,
            TeamName = giverTeam,
            GiverPersonSub = giverPersonSub
        };

        if (ThrowOnRetrieveKudosGivenByPlayer)
        {
            throw new System.Exception("Simulated data store failure for kudos retrieval");
        }

        return Task.FromResult(KudosToReturn);
    }

    public Task<List<KudosSummary>> RetrieveKudosAwardedToTeamAsync(string league, string season, string division, string teamName)
    {
            throw new NotImplementedException();
    }

    public Task<List<KudosSummary>> RetrieveKudosAwardedToAllDivisionTeams(string league, string season, string division)
    {
            throw new NotImplementedException();
    }

    public void Dispose() { }

    public sealed record DeletedKudosRequest
    {
        public required string League { get; init; }
        public required string Season { get; init; }
        public required string Division { get; init; }
        public required string ReceivingTeam { get; init; }
        public required string HomeTeam { get; init; }
        public required string AwayTeam { get; init; }
        public required string GiverPersonSub { get; init; }
    }    
}

using Amazon.Lambda.TestUtilities;
using FluentAssertions;
using TTLeaguePlayersApp.BackEnd.Kudos.DataStore;
using TTLeaguePlayersApp.BackEnd.Kudos.Lambdas;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.Kudos.Lambdas.Tests;

public class RetrieveKudosAwardedToTeamLambdaTests
{
    private readonly TestLambdaContext _context = new();

    [Fact]
    public async Task HandleAsync_ReturnsKudosSummaryList_OnSuccess()
    {
        // Arrange
        var league = "CLTTL";
        var season = "2025-2026";
        var division = "Division 4";
        var teamName = "Morpeth 10";

        var request = new RetrieveKudosAwardedToTeamRequest
        {
            League = league,
            Season = season,
            TeamDivision = division,
            TeamName = teamName
        };

        var expectedSummaries = new List<KudosSummary>
        {
            new KudosSummary
            {
                League = league,
                Season = season,
                Division = division,
                ReceivingTeam = teamName,
                HomeTeam = teamName,
                AwayTeam = "TeamB",
                MatchDateTime = 1000L,
                PositiveKudosCount = 1,
                NeutralKudosCount = 0,
                NegativeKudosCount = 0
            }
        };

        var fakeDataTable = new FakeKudosDataTable();
        fakeDataTable.SummariesToReturn = expectedSummaries;
        
        var lambda = new RetrieveKudosAwardedToTeamLambda(new LoggerObserver(), fakeDataTable);

        // Act
        var result = await lambda.HandleAsync(request, _context);

        // Assert
        result.Should().BeEquivalentTo(expectedSummaries);
    }

    [Fact]
    public async Task HandleAsync_LogsAndThrows_OnException()
    {
        // Arrange
        var request = new RetrieveKudosAwardedToTeamRequest
        {
            League = "L",
            Season = "S",
            TeamDivision = "D",
            TeamName = "T"
        };

        var fakeDataTable = new FakeKudosDataTable();
        fakeDataTable.ExceptionToThrow = new Exception("DataStore error");
        
        var lambda = new RetrieveKudosAwardedToTeamLambda(new LoggerObserver(), fakeDataTable);

        // Act & Assert
        await lambda.Invoking(l => l.HandleAsync(request, _context))
            .Should().ThrowAsync<Exception>()
            .WithMessage("DataStore error");
    }

    private sealed class FakeKudosDataTable : IKudosDataTable
    {
        public List<KudosSummary> SummariesToReturn { get; set; } = new();
        public Exception? ExceptionToThrow { get; set; }

        public Task<List<KudosSummary>> RetrieveKudosAwardedToTeamAsync(string league, string season, string division, string teamName)
        {
            if (ExceptionToThrow != null) throw ExceptionToThrow;
            return Task.FromResult(SummariesToReturn);
        }

        public Task<List<KudosSummary>> RetrieveKudosAwardedToAllDivisionTeams(string league, string season, string division) => throw new NotImplementedException();

        public Task SaveKudosAsync(DataStore.Kudos kudos) => throw new NotImplementedException();
        public Task<DataStore.Kudos> RetrieveKudosAsync(string league, string season, string division, string receivingTeam, string homeTeam, string awayTeam, string giverPersonSub) => throw new NotImplementedException();
        public Task<KudosSummary> RetrieveSummaryAsync(string league, string season, string division, string receivingTeam, string homeTeam, string awayTeam) => throw new NotImplementedException();
        public Task DeleteKudosAsync(string league, string season, string division, string receivingTeam, string homeTeam, string awayTeam, string giverPersonSub) => throw new NotImplementedException();
        public Task<List<DataStore.Kudos>> RetrieveKudosGivenByPlayerAsync(string league, string season, string giverPersonSub, string division, string giverTeam) => throw new NotImplementedException();
        public void Dispose() { }
    }
}

using Amazon.Lambda.TestUtilities;
using FluentAssertions;
using TTLeaguePlayersApp.BackEnd.Kudos.DataStore;
using TTLeaguePlayersApp.BackEnd.Kudos.Lambdas;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.Kudos.Lambdas.Tests;

public class RetrieveKudosStandingsLambdaTests
{
    private readonly TestLambdaContext _context = new();

    [Fact]
    public async Task HandleAsync_CalculatesStandingsCorrectly()
    {
        // Arrange
        var league = "CLTTL";
        var season = "2025-2026";
        var division = "Division 4";

        var summaries = new List<KudosSummary>
        {
            // Team A: 2 positive matches, 0 negative
            new KudosSummary { ReceivingTeam = "TeamA", PositiveKudosCount = 1, NegativeKudosCount = 0, League = league, Season = season, Division = division, HomeTeam = "A", AwayTeam = "B" },
            new KudosSummary { ReceivingTeam = "TeamA", PositiveKudosCount = 2, NegativeKudosCount = 0, League = league, Season = season, Division = division, HomeTeam = "A", AwayTeam = "C" },
            
            // Team B: 1 positive match, 1 negative
            new KudosSummary { ReceivingTeam = "TeamB", PositiveKudosCount = 1, NegativeKudosCount = 0, League = league, Season = season, Division = division, HomeTeam = "B", AwayTeam = "A" },
            new KudosSummary { ReceivingTeam = "TeamB", PositiveKudosCount = 0, NegativeKudosCount = 1, League = league, Season = season, Division = division, HomeTeam = "B", AwayTeam = "D" },

            // Team C: 0 positive, 2 negative
            new KudosSummary { ReceivingTeam = "TeamC", PositiveKudosCount = 0, NegativeKudosCount = 1, League = league, Season = season, Division = division, HomeTeam = "C", AwayTeam = "A" },
            new KudosSummary { ReceivingTeam = "TeamC", PositiveKudosCount = 0, NegativeKudosCount = 1, League = league, Season = season, Division = division, HomeTeam = "C", AwayTeam = "E" }
        };

        var fakeDataTable = new FakeKudosDataTable { SummariesToReturn = summaries };
        var lambda = new RetrieveKudosStandingsLambda(new LoggerObserver(), fakeDataTable);
        var request = new RetrieveKudosStandingsRequest { League = league, Season = season, TeamDivision = division };

        // Act
        var result = await lambda.HandleAsync(request, _context);

        // Assert
        result.PositiveKudosTable.Should().HaveCount(2);
        result.PositiveKudosTable[0].TeamName.Should().Be("TeamA");
        result.PositiveKudosTable[0].Count.Should().Be(2);
        result.PositiveKudosTable[1].TeamName.Should().Be("TeamB");
        result.PositiveKudosTable[1].Count.Should().Be(1);

        result.NegativeKudosTable.Should().HaveCount(2);
        result.NegativeKudosTable[0].TeamName.Should().Be("TeamC");
        result.NegativeKudosTable[0].Count.Should().Be(2);
        result.NegativeKudosTable[1].TeamName.Should().Be("TeamB");
        result.NegativeKudosTable[1].Count.Should().Be(1);
    }

    private sealed class FakeKudosDataTable : IKudosDataTable
    {
        public List<KudosSummary> SummariesToReturn { get; set; } = new();

        public Task<List<KudosSummary>> RetrieveKudosAwardedToAllDivisionTeams(string league, string season, string division) => Task.FromResult(SummariesToReturn);

        public Task SaveKudosAsync(DataStore.Kudos kudos) => throw new NotImplementedException();
        public Task<DataStore.Kudos> RetrieveKudosAsync(string league, string season, string division, string receivingTeam, string homeTeam, string awayTeam, string giverPersonSub) => throw new NotImplementedException();
        public Task<KudosSummary> RetrieveSummaryAsync(string league, string season, string division, string receivingTeam, string homeTeam, string awayTeam) => throw new NotImplementedException();
        public Task DeleteKudosAsync(string league, string season, string division, string receivingTeam, string homeTeam, string awayTeam, string giverPersonSub) => throw new NotImplementedException();
        public Task<List<DataStore.Kudos>> RetrieveKudosGivenByPlayerAsync(string league, string season, string giverPersonSub, string division, string giverTeam) => throw new NotImplementedException();
        public Task<List<KudosSummary>> RetrieveKudosAwardedToTeamAsync(string league, string season, string division, string teamName) => throw new NotImplementedException();
        public void Dispose() { }
    }
}

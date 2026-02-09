using Amazon;
using Amazon.CognitoIdentityProvider;
using Amazon.CognitoIdentityProvider.Model;
using Amazon.Lambda.TestUtilities;
using FluentAssertions;
using System.Text.Json;
using TTLeaguePlayersApp.BackEnd.Cognito;
using TTLeaguePlayersApp.BackEnd.Kudos.DataStore;
using TTLeaguePlayersApp.BackEnd.Kudos.Lambdas;
using TTLeaguePlayersApp.BackEnd.Invites.Lambdas;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.Kudos.Lambdas.Tests;

public class CreateKudosLambdaTests
{
    private readonly TestLambdaContext _context = new();

    [Fact]
    public async Task HandleAsync_UpdatesCognitoActiveSeasonsWithLatestKudoDate()
    {
        // Arrange
        var giverSub = "user-123";
        var league = "CLTTL";
        var season = "2025-2026";
        var division = "Division 4";
        var teamName = "Morpeth 10";
        var personName = "Luca Minudel";
        var matchDate = 1735689600L;

        var request = new CreateKudosRequest
        {
            League = league,
            Season = season,
            Division = division,
            ReceivingTeam = "Morpeth 9",
            HomeTeam = teamName,
            AwayTeam = "Morpeth 9",
            MatchDateTime = matchDate,
            GiverTeam = teamName,
            GiverPersonName = personName,
            GiverPersonSub = giverSub,
            KudosValue = 1
        };

        var initialActiveSeasons = new List<ActiveSeason>
        {
            new ActiveSeason
            {
                League = league,
                Season = season,
                TeamDivision = division,
                TeamName = teamName,
                PersonName = personName,
                Role = "PLAYER",
                LatestKudos = new List<long>()
            }
        };

        var userClaims = new Dictionary<string, string>
        {
            { "sub", giverSub },
            { "custom:active_seasons", JsonSerializer.Serialize(initialActiveSeasons) }
        };

        var fakeDataTable = new FakeKudosDataTable();
        var fakeCognito = new FakeCognitoClient();
        
        var cognitoUsers = new CognitoUsers(fakeCognito, "pool-id");
        var lambda = new CreateKudosLambda(new LoggerObserver(), fakeDataTable, cognitoUsers);

        // Act
        await lambda.HandleAsync(request, userClaims, _context);

        // Assert
        fakeDataTable.SavedKudos.Should().HaveCount(1);
        fakeDataTable.SavedKudos[0].MatchDateTime.Should().Be(matchDate);

        fakeCognito.AdminUpdateUserAttributesCalls.Should().Be(1);
        var updateRequest = fakeCognito.LastAdminUpdateUserAttributesRequest;
        updateRequest.Should().NotBeNull();
        
        var seasonsJson = updateRequest!.UserAttributes.First(a => a.Name == "custom:active_seasons").Value;
        var updatedSeasons = JsonSerializer.Deserialize<List<ActiveSeason>>(seasonsJson);
        
        updatedSeasons.Should().NotBeNull();
        var targetSeason = updatedSeasons!.First(s => s.League == league && s.Season == season);
        targetSeason.LatestKudos.Should().Contain(matchDate);
    }

    [Fact]
    public async Task HandleAsync_KeepsOnlyTwoLatestKudosDatesInCognito()
    {
        // Arrange
        var giverSub = "user-123";
        var league = "CLTTL";
        var season = "2025-2026";
        var division = "Division 4";
        var teamName = "Morpeth 10";
        var personName = "Luca Minudel";

        // Initial dates: some old, some more recent. But the logic always adds the new one.
        // If we already have 2, and we add 1, it should keep the 2 largest including the new one.
        var initialActiveSeasons = new List<ActiveSeason>
        {
            new ActiveSeason
            {
                League = league,
                Season = season,
                TeamDivision = division,
                TeamName = teamName,
                PersonName = personName,
                Role = "PLAYER",
                LatestKudos = new List<long> { 1000L, 3000L } // Already have two
            }
        };

        var userClaims = new Dictionary<string, string>
        {
            { "sub", giverSub },
            { "custom:active_seasons", JsonSerializer.Serialize(initialActiveSeasons) }
        };

        var request = new CreateKudosRequest
        {
            League = league,
            Season = season,
            Division = division,
            ReceivingTeam = "Morpeth 9",
            HomeTeam = teamName,
            AwayTeam = "Morpeth 9",
            MatchDateTime = 2000L, // New date between existing ones
            GiverTeam = teamName,
            GiverPersonName = personName,
            GiverPersonSub = giverSub,
            KudosValue = 1
        };

        var fakeDataTable = new FakeKudosDataTable();
        var fakeCognito = new FakeCognitoClient();
        
        var cognitoUsers = new CognitoUsers(fakeCognito, "pool-id");
        var lambda = new CreateKudosLambda(new LoggerObserver(), fakeDataTable, cognitoUsers);

        // Act
        await lambda.HandleAsync(request, userClaims, _context);

        // Assert
        var updateRequest = fakeCognito.LastAdminUpdateUserAttributesRequest;
        updateRequest.Should().NotBeNull();
        
        var seasonsJson = updateRequest!.UserAttributes.First(a => a.Name == "custom:active_seasons").Value;
        var updatedSeasons = JsonSerializer.Deserialize<List<ActiveSeason>>(seasonsJson);
        
        var targetSeason = updatedSeasons!.First(s => s.League == league && s.Season == season);
        
        // Should keep 2000 and 3000 (the two latest), and they should be sorted (1000 dropped)
        targetSeason.LatestKudos.Should().HaveCount(2);
        targetSeason.LatestKudos[0].Should().Be(2000L);
        targetSeason.LatestKudos[1].Should().Be(3000L);
    }

    private sealed class FakeKudosDataTable : IKudosDataTable
    {
        public List<DataStore.Kudos> SavedKudos { get; } = new();

        public Task SaveKudosAsync(DataStore.Kudos kudos)
        {
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
            throw new NotImplementedException();
        }

        public Task<List<DataStore.Kudos>> RetrieveKudosGivenByPlayerAsync(string league, string season, string giverPersonSub, string division, string giverTeam)
        {
             throw new NotImplementedException();
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
    }

    private sealed class FakeCognitoClient : AmazonCognitoIdentityProviderClient
    {
        public int AdminUpdateUserAttributesCalls { get; private set; }
        public AdminUpdateUserAttributesRequest? LastAdminUpdateUserAttributesRequest { get; private set; }

        public FakeCognitoClient()
            : base(new Amazon.Runtime.AnonymousAWSCredentials(), new AmazonCognitoIdentityProviderConfig { RegionEndpoint = RegionEndpoint.USEast1 })
        {
        }

        public override Task<AdminUpdateUserAttributesResponse> AdminUpdateUserAttributesAsync(AdminUpdateUserAttributesRequest request, System.Threading.CancellationToken cancellationToken = default)
        {
            AdminUpdateUserAttributesCalls++;
            LastAdminUpdateUserAttributesRequest = request;
            return Task.FromResult(new AdminUpdateUserAttributesResponse());
        }
    }
}

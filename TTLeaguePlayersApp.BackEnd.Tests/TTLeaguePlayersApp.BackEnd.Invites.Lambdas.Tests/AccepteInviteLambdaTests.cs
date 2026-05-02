using Amazon.CognitoIdentityProvider.Model;
using Amazon.Lambda.TestUtilities;
using FluentAssertions;
using System.Text.Json;
using TTLeaguePlayersApp.BackEnd.Cognito;
using TTLeaguePlayersApp.BackEnd.Invites.DataStore;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.Invites.Lambdas.Tests;

public partial class AccepteInviteLambdaTests
{
    private readonly TestLambdaContext _context;
    private readonly FakeCognitoClient _cognitoClient;
    private readonly FakeInvitesDataTable _dataTable;
    private readonly AccepteInviteLambda _lambda;

    public AccepteInviteLambdaTests()
    {
        _context = new();

        _cognitoClient = new FakeCognitoClient
        {
            ListUsersResult = new ListUsersResponse
            {
                Users = new()
                {
                    new UserType
                    {
                        Username = "user-1",
                        Attributes = new() { new AttributeType { Name = "email", Value = "user@example.com" } }
                    }
                }
            }
        };

        _dataTable = new FakeInvitesDataTable();

        _lambda = new AccepteInviteLambda(
            observer: new LoggerObserver(),
            invitesDataTable: _dataTable,
            new CognitoUsers(
            cognitoClient: _cognitoClient,
            cognitoUserPoolId: "pool"));

    }

    [Fact]
    public async Task WhenInviteNotYetAccepted_UpdatesUserActiveSeasons_And_SetsInviteAcceptedDate()
    {
        var nanoId = "11223344";
        var acceptedAt = 444;
        var invite = CreatePlayerInvite(nanoId, acceptedAt: null, inviteeEmailId: "user@example.com");
        _dataTable.Seed(invite);

        var result = await _lambda.HandleAsync(nanoId, acceptedAt, _context);

        result.AcceptedAt.Should().Be(acceptedAt);
        _dataTable.Invites[nanoId].AcceptedAt.Should().Be(acceptedAt);
        _dataTable.MarkInviteAcceptedCalls.Should().Be(1);

        _cognitoClient.ListUsersCalls.Should().Be(1);
        _cognitoClient.AdminUpdateUserAttributesCalls.Should().Be(1);
        _cognitoClient.LastAdminUpdateUserAttributesRequest.Should().NotBeNull();

        var listUsersResponse = await _cognitoClient.ListUsersAsync(new ListUsersRequest());
        var user = listUsersResponse.Users.First();
        user.Attributes.Should().ContainSingle(a => a.Name == "custom:active_seasons");
        var seasonsJson = user.Attributes.Single(a => a.Name == "custom:active_seasons").Value;

        seasonsJson.Should().NotBeNullOrWhiteSpace();

        using var jsonDoc = JsonDocument.Parse(seasonsJson);
        jsonDoc.RootElement.ValueKind.Should().Be(JsonValueKind.Array);

        var match = jsonDoc.RootElement.EnumerateArray().FirstOrDefault(x =>
            x.TryGetProperty("league", out var league) && league.GetString() == invite.League &&
            x.TryGetProperty("season", out var season) && season.GetString() == invite.Season);

        match.ValueKind.Should().NotBe(JsonValueKind.Undefined);
    }

    [Fact]
    public async Task WhenCaptainInviteSuccefullyAccepted_UserActiveSeasonsUpdateIsWellFormed()
    {
        var nanoId = "44332211";
        var acceptedAt = 555;
        var invite = CreatePlayerInvite(nanoId, acceptedAt: null);
        _dataTable.Seed(invite);

        await _lambda.HandleAsync(nanoId, acceptedAt, _context);

        _cognitoClient.LastAdminUpdateUserAttributesRequest.Should().NotBeNull();

        var listUsersResponse = await _cognitoClient.ListUsersAsync(new ListUsersRequest());
        var user = listUsersResponse.Users.First();
        user.Attributes.Should().ContainSingle(a => a.Name == "custom:active_seasons");
        var seasonsJson = user.Attributes.Single(a => a.Name == "custom:active_seasons").Value;

        seasonsJson.Should().NotBeNullOrWhiteSpace();

        using var jsonDoc = JsonDocument.Parse(seasonsJson);
        var seasons = jsonDoc.RootElement;
        seasons.ValueKind.Should().Be(JsonValueKind.Array);

        var match = seasons.EnumerateArray().FirstOrDefault(x =>
            x.TryGetProperty("league", out var league) && league.GetString() == invite.League &&
            x.TryGetProperty("season", out var season) && season.GetString() == invite.Season);

        match.ValueKind.Should().NotBe(JsonValueKind.Undefined);

        match.GetProperty("league").GetString().Should().Be(invite.League);
        match.GetProperty("season").GetString().Should().Be(invite.Season);
        match.GetProperty("team_name").GetString().Should().Be(invite.InviteeTeam);
        match.GetProperty("team_division").GetString().Should().Be(invite.TeamDivision);
        match.GetProperty("person_name").GetString().Should().Be(invite.InviteeName);
        match.GetProperty("role").GetString().Should().Be(invite.InviteeRole.ToString());
    }

    [Fact]
    public async Task WhenCaptainInviteSuccefullyAccepted_OlderSeasonsSameLeagueUserActiveSeasonsItemsAreRemoved()
    {
        // Setup: Add season BCS, 2025-2026
        var unrelatedInviteNanoId = "aabbccdd";
        var unrelatedInvite = CreatePlayerInvite(unrelatedInviteNanoId, acceptedAt: null, 
                                             league: "BCS", season: "2025-2026");
        _dataTable.Seed(unrelatedInvite);
        await _lambda.HandleAsync(unrelatedInviteNanoId, acceptedAt: 111, _context);

        // Setup: Add season CLTTL, 2025-2026
        var firstInviteNanoId = "44332211";
        var firstInvite = CreatePlayerInvite(firstInviteNanoId, acceptedAt: null, 
                                             league: "CLTTL", season: "2025-2026");
        _dataTable.Seed(firstInvite);
        await _lambda.HandleAsync(firstInviteNanoId, acceptedAt: 444, _context);

        // Setup: Add season CLTTL, 2026-2027
        var secondInviteNanoId = "55667788";
        var secondInvite = CreatePlayerInvite(secondInviteNanoId, acceptedAt: null, 
                                              league: "CLTTL", season: "2026-2027");
        _dataTable.Seed(secondInvite);
        await _lambda.HandleAsync(secondInviteNanoId, acceptedAt: 777, _context);

        // Extract active seasons from user
        var listUsersResponse = await _cognitoClient.ListUsersAsync(new ListUsersRequest());
        var user = listUsersResponse.Users.First();
        var seasonsJson = user.Attributes.Single(a => a.Name == "custom:active_seasons").Value;
        using var jsonDoc = JsonDocument.Parse(seasonsJson);
        var seasons = jsonDoc.RootElement;

        // Assert only one season for CLTTL league is present 
        var duplicates = seasons.EnumerateArray().Count(x =>
            x.TryGetProperty("league", out var league) && league.GetString() == firstInvite.League);
        duplicates.Should().Be(1);

        // Assert the only one season for CLTTL league is the last season 
        var secondInviteSeasonCount = seasons.EnumerateArray().Count(x =>
            x.TryGetProperty("league", out var league) && league.GetString() == firstInvite.League &&
            x.TryGetProperty("season", out var season) && season.GetString() == secondInvite.Season);
        secondInviteSeasonCount.Should().Be(1);

        // Assert the unrelated BCS season is unaffected
        var unrelatedInviteSeasonCount = seasons.EnumerateArray().Count(x =>
            x.TryGetProperty("league", out var league) && league.GetString() == unrelatedInvite.League &&
            x.TryGetProperty("season", out var season) && season.GetString() == unrelatedInvite.Season);
        unrelatedInviteSeasonCount.Should().Be(1);
    }

    [Fact]
    public async Task WhenClubManagerInviteSuccefullyAccepted_UserManagedClubsUpdateIsWellFormed()
    {
        var nanoId = "44332211";
        var acceptedAt = 555;
        var invite = CreateClubManagerInvite(nanoId, acceptedAt: null);
        _dataTable.Seed(invite);

        await _lambda.HandleAsync(nanoId, acceptedAt, _context);

        _cognitoClient.LastAdminUpdateUserAttributesRequest.Should().NotBeNull();

        var listUsersResponse = await _cognitoClient.ListUsersAsync(new ListUsersRequest());
        var user = listUsersResponse.Users.First();
        user.Attributes.Should().ContainSingle(a => a.Name == "custom:managed_clubs");
        var seasonsJson = user.Attributes.Single(a => a.Name == "custom:managed_clubs").Value;

        seasonsJson.Should().NotBeNullOrWhiteSpace();

        using var jsonDoc = JsonDocument.Parse(seasonsJson);
        var seasons = jsonDoc.RootElement;
        seasons.ValueKind.Should().Be(JsonValueKind.Array);

        var match = seasons.EnumerateArray().FirstOrDefault(x =>
            x.TryGetProperty("league", out var league) && league.GetString() == invite.League &&
            x.TryGetProperty("season", out var season) && season.GetString() == invite.Season);

        match.ValueKind.Should().NotBe(JsonValueKind.Undefined);

        match.GetProperty("league").GetString().Should().Be(invite.League);
        match.GetProperty("season").GetString().Should().Be(invite.Season);
        match.GetProperty("club_name").GetString().Should().Be(invite.InviteeClub);
        match.GetProperty("club_location").GetString().Should().Be(invite.ClubLocation);
        match.GetProperty("manager_name").GetString().Should().Be(invite.InviteeName);
    }

    [Fact]
    public async Task WhenClubManagerInviteSuccefullyAccepted_OlderSeasonsSameLeagueUserActiveSeasonsItemsAreRemoved()
    {
        // Setup: Add season BCS, 2025-2026
        var unrelatedInviteNanoId = "aabbccdd";
        var unrelatedInvite = CreateClubManagerInvite(unrelatedInviteNanoId, acceptedAt: null, 
                                                      league: "BCS", season: "2025-2026");
        _dataTable.Seed(unrelatedInvite);
        await _lambda.HandleAsync(unrelatedInviteNanoId, acceptedAt: 111, _context);

        // Setup: Add season CLTTL, 2025-2026
        var firstInviteNanoId = "44332211";
        var firstInvite = CreateClubManagerInvite(firstInviteNanoId, acceptedAt: null, 
                                                  league: "CLTTL", season: "2025-2026");
        _dataTable.Seed(firstInvite);
        await _lambda.HandleAsync(firstInviteNanoId, acceptedAt: 444, _context);

        // Setup: Add season CLTTL, 2026-2027
        var secondInviteNanoId = "55667788";
        var secondInvite = CreateClubManagerInvite(secondInviteNanoId, acceptedAt: null, 
                                                   league: "CLTTL", season: "2026-2027");
        _dataTable.Seed(secondInvite);
        await _lambda.HandleAsync(secondInviteNanoId, acceptedAt: 777, _context);

        // Extract active seasons from user
        var listUsersResponse = await _cognitoClient.ListUsersAsync(new ListUsersRequest());
        var user = listUsersResponse.Users.First();
        var managedClubsJson = user.Attributes.Single(a => a.Name == "custom:managed_clubs").Value;
        using var jsonDoc = JsonDocument.Parse(managedClubsJson);
        var clubs = jsonDoc.RootElement;

        // Assert only one season for CLTTL league is present 
        var duplicates = clubs.EnumerateArray().Count(x =>
            x.TryGetProperty("league", out var league) && league.GetString() == firstInvite.League);
        duplicates.Should().Be(1);

        // Assert the only one season for CLTTL league is the last season 
        var secondInviteSeasonCount = clubs.EnumerateArray().Count(x =>
            x.TryGetProperty("league", out var league) && league.GetString() == firstInvite.League &&
            x.TryGetProperty("season", out var season) && season.GetString() == secondInvite.Season);
        secondInviteSeasonCount.Should().Be(1);

        // Assert the unrelated BCS season is unaffected
        var unrelatedInviteSeasonCount = clubs.EnumerateArray().Count(x =>
            x.TryGetProperty("league", out var league) && league.GetString() == unrelatedInvite.League &&
            x.TryGetProperty("season", out var season) && season.GetString() == unrelatedInvite.Season);
        unrelatedInviteSeasonCount.Should().Be(1);
    }

    [Fact]
    public async Task WhenPlayerInviteAcceptedAtUpdateFailsThenRetrySucceeds_UserActiveSeasonsDoesNotContainDuplicates()
    {
        var nanoId = "55667788";
        var acceptedAt = 777;
        var invite = CreatePlayerInvite(nanoId, acceptedAt: null);
        _dataTable.Seed(invite);

        _dataTable.ThrowOnceOnMarkInviteAccepted = new Exception("transient dynamodb failure");

        var firstAttempt = () => _lambda.HandleAsync(nanoId, acceptedAt, _context);
        await firstAttempt.Should().ThrowAsync<Exception>();

        var result = await _lambda.HandleAsync(nanoId, acceptedAt, _context);
        result.AcceptedAt.Should().Be(acceptedAt);

        _cognitoClient.AdminUpdateUserAttributesRequests.Should().NotBeNull();
        _cognitoClient.AdminUpdateUserAttributesRequests.Count.Should().BeGreaterThanOrEqualTo(2);

        var listUsersResponse = await _cognitoClient.ListUsersAsync(new ListUsersRequest());
        var user = listUsersResponse.Users.First();
        user.Attributes.Should().ContainSingle(a => a.Name == "custom:active_seasons");
        var seasonsJson = user.Attributes.Single(a => a.Name == "custom:active_seasons").Value;

        using var jsonDoc = JsonDocument.Parse(seasonsJson);
        var seasons = jsonDoc.RootElement;
        seasons.ValueKind.Should().Be(JsonValueKind.Array);

        var duplicates = seasons.EnumerateArray().Count(x =>
            x.TryGetProperty("league", out var league) && league.GetString() == invite.League &&
            x.TryGetProperty("season", out var season) && season.GetString() == invite.Season &&
            x.TryGetProperty("team_name", out var team) && team.GetString() == invite.InviteeTeam &&
            x.TryGetProperty("team_division", out var division) && division.GetString() == invite.TeamDivision &&
            x.TryGetProperty("person_name", out var person) && person.GetString() == invite.InviteeName &&
            x.TryGetProperty("role", out var role) && role.GetString() == invite.InviteeRole.ToString());

        duplicates.Should().Be(1);
    }

    [Fact]
    public async Task WhenClubManagerInviteAcceptedAtUpdateFailsThenRetrySucceeds_ManagedClubsDoesNotContainDuplicates()
    {
        var nanoId = "55667788";
        var acceptedAt = 777;
        var invite = CreateClubManagerInvite(nanoId, acceptedAt: null);
        _dataTable.Seed(invite);

        _dataTable.ThrowOnceOnMarkInviteAccepted = new Exception("transient dynamodb failure");

        var firstAttempt = () => _lambda.HandleAsync(nanoId, acceptedAt, _context);
        await firstAttempt.Should().ThrowAsync<Exception>();

        var result = await _lambda.HandleAsync(nanoId, acceptedAt, _context);
        result.AcceptedAt.Should().Be(acceptedAt);

        _cognitoClient.AdminUpdateUserAttributesRequests.Should().NotBeNull();
        _cognitoClient.AdminUpdateUserAttributesRequests.Count.Should().BeGreaterThanOrEqualTo(2);

        var listUsersResponse = await _cognitoClient.ListUsersAsync(new ListUsersRequest());
        var user = listUsersResponse.Users.First();
        user.Attributes.Should().ContainSingle(a => a.Name == "custom:managed_clubs");
        var seasonsJson = user.Attributes.Single(a => a.Name == "custom:managed_clubs").Value;

        using var jsonDoc = JsonDocument.Parse(seasonsJson);
        var seasons = jsonDoc.RootElement;
        seasons.ValueKind.Should().Be(JsonValueKind.Array);

        var duplicates = seasons.EnumerateArray().Count(x =>
            x.TryGetProperty("league", out var league) && league.GetString() == invite.League &&
            x.TryGetProperty("season", out var season) && season.GetString() == invite.Season &&
            x.TryGetProperty("club_name", out var club) && club.GetString() == invite.InviteeClub &&
            x.TryGetProperty("club_location", out var location) && location.GetString() == invite.ClubLocation &&
            x.TryGetProperty("manager_name", out var manager) && manager.GetString() == invite.InviteeName);

        duplicates.Should().Be(1);
    }

    [Fact]
    public async Task WhenInviteAlreadyAccepted_DoesNotUpdateUserActiveSeasonsOrInviteAcceptedDate()
    {
        var nanoId = "12345678";
        var invite = CreatePlayerInvite(nanoId, acceptedAt: 111);
        _dataTable.Seed(invite);

        var result = await _lambda.HandleAsync(nanoId, acceptedAt: 222, _context);

        result.NanoId.Should().Be(nanoId);
        result.AcceptedAt.Should().Be(111);

        _cognitoClient.ListUsersCalls.Should().Be(0);
        _cognitoClient.AdminUpdateUserAttributesCalls.Should().Be(0);
        _dataTable.MarkInviteAcceptedCalls.Should().Be(0);
    }

    [Fact]
    public async Task WhenUserActiveSeasonsUpdateFails_InviteAcceptedDateIsNotSet()
    {
        var nanoId = "87654321";
        var invite = CreatePlayerInvite(nanoId, acceptedAt: null);
        _dataTable.Seed(invite);

        _cognitoClient.ThrowOnAdminUpdate = new InternalErrorException("boom");

        var act = () => _lambda.HandleAsync(nanoId, acceptedAt: 333, _context);

        await act.Should().ThrowAsync<InternalErrorException>();

        _dataTable.MarkInviteAcceptedCalls.Should().Be(0);
        _dataTable.Invites[nanoId].AcceptedAt.Should().BeNull();
    }

    private static CaptainOrPlayerInvite CreatePlayerInvite(string nanoId, long? acceptedAt, string inviteeEmailId = "test@example.com", string league = "Test League", string season = "2025-2026" )
        => new()
        {
            NanoId = nanoId,
            InviteeName = "Test User",
            InviteeEmailId = inviteeEmailId,
            InviteeRole = Role.PLAYER,
            InviteeTeam = "Test Team",
            TeamDivision = "Test Division",
            League = league,
            Season = season,
            InvitedBy = "Test Inviter",
            CreatedAt = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
            AcceptedAt = acceptedAt
        };

    private static ClubManagerInvite CreateClubManagerInvite(string nanoId, long? acceptedAt, string inviteeEmailId = "test@example.com", string league = "Test League", string season = "2025-2026" )
        => new()
        {
            NanoId = nanoId,
            InviteeName = "Test User",
            InviteeEmailId = inviteeEmailId,
            InviteeRole = Role.CLUB_MANAGER,
            InviteeClub = "Test Club",
            ClubLocation = "London",
            League = league,
            Season = season,
            InvitedBy = "Test Inviter",
            CreatedAt = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
            AcceptedAt = acceptedAt
        };
}

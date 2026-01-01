using System.Collections.Concurrent;
using FluentAssertions;
using Xunit;
using Amazon.Lambda.Core;
using Amazon.Lambda.TestUtilities;
using TTLeaguePlayersApp.BackEnd;
using TTLeaguePlayersApp.BackEnd.Invites.Lambdas;
using TTLeaguePlayersApp.BackEnd.Invites.DataStore;
using TTLeaguePlayersApp.BackEnd.Configuration.DataStore;
using Amazon;

namespace TTLeaguePlayersApp.BackEnd.Invites.Lambdas.Tests;

public class FunctionTest : IAsyncLifetime
{
    private readonly ConcurrentBag<string> _createdNanoIds = new();
    private readonly TestLambdaContext _context = new();
    private InvitesDataTable? _invitesDataTable;
    private DeleteInviteLambda? _deleteInviteLambda;

    public Task InitializeAsync()
    {
        var loader = new Loader();
        var config = loader.GetEnvironmentVariables();

        Amazon.RegionEndpoint? region = null;
        if (!string.IsNullOrEmpty(config.DynamoDB.AWSRegion))
        {
            region = RegionEndpoint.GetBySystemName(config.DynamoDB.AWSRegion);
        }

        _invitesDataTable = new InvitesDataTable(config.DynamoDB.ServiceLocalUrl, region, config.DynamoDB.TablesNameSuffix);
        var observer = new LoggerObserver();
        _deleteInviteLambda = new DeleteInviteLambda(observer, _invitesDataTable);

        return Task.CompletedTask;
    }

    public async Task DisposeAsync()
    {
        if (_deleteInviteLambda != null)
        {
            foreach (var nanoId in _createdNanoIds)
            {
                try { await _deleteInviteLambda.HandleAsync(nanoId, _context); } catch { /* ignore */ }
            }
        }

        _invitesDataTable?.Dispose();
    }

    [Fact]
    public async Task TestGetInvite_ReturnsPassedNanoId()
    {
        _invitesDataTable.Should().NotBeNull();
        var invitesDataTable = _invitesDataTable!;

        // Create an invite to retrieve
        var nanoId = Random.Shared.Next(10_000_000, 99_999_999).ToString(); // 8 digits
        var testInvite = new Invite
        {
            NanoId = nanoId,
            InviteeName = "Test User",
            InviteeEmailId = "test@example.com",
            InviteeRole = Role.PLAYER,
            InviteeTeam = "Test Team",
            TeamDivision = "Test Division",
            League = "Test League",
            Season = "2025-2026",
            InvitedBy = "Test Inviter",
            CreatedAt = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
            AcceptedAt = null
        };
        await invitesDataTable.CreateNewInvite(testInvite);
        _createdNanoIds.Add(nanoId);

        // Invoke the lambda function and confirm the NanoId is echoed back
        var mockObserver = new LoggerObserver();
        var function = new GetInviteLambda(mockObserver, invitesDataTable);
        var invite = await function.HandleAsync(nanoId, _context);

        Assert.Equal(nanoId, invite.NanoId);
    }
}

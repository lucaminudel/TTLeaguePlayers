using Amazon.Lambda.TestUtilities;
using FluentAssertions;
using TTLeaguePlayersApp.BackEnd.Invites.DataStore;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.Invites.Lambdas.Tests;

public class DeleteInviteLambdaTests
{
    private readonly TestLambdaContext _context = new();
    private readonly FakeInvitesDataTable _dataTable = new();
    private readonly DeleteInviteLambda _lambda;

    public DeleteInviteLambdaTests()
    {
        _lambda = new DeleteInviteLambda(
            observer: new LoggerObserver(),
            invitesDataTable: _dataTable);
    }

    [Fact]
    public async Task WhenInviteExists_DeletesInviteSuccessfully()
    {
        var nanoId = "11223344";
        _dataTable.Seed(new CaptainOrPlayerInvite
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
            CreatedAt = DateTimeOffset.UtcNow.ToUnixTimeSeconds()
        });

        await _lambda.HandleAsync(nanoId, _context);

        _dataTable.Invites.Should().NotContainKey(nanoId);
    }

    [Fact]
    public async Task WhenNanoIdIsEmpty_Throws_ValidationException()
    {
        var act = () => _lambda.HandleAsync(string.Empty, _context);

        await act.Should().ThrowAsync<ValidationException>();
    }

    [Fact]
    public async Task WhenNanoIdIsWrongLength_Throws_ValidationException()
    {
        var act = () => _lambda.HandleAsync("short", _context);

        await act.Should().ThrowAsync<ValidationException>();
    }

}

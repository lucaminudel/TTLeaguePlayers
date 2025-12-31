using Xunit;
using Amazon.Lambda.Core;
using Amazon.Lambda.TestUtilities;
using TTLeaguePlayersApp.BackEnd;
using TTLeaguePlayersApp.BackEnd.Invites.Lambdas;
using TTLeaguePlayersApp.BackEnd.Invites.DataStore;
using TTLeaguePlayersApp.BackEnd.Configuration.DataStore;
using Amazon;

namespace TTLeaguePlayersApp.BackEnd.Invites.Lambdas.Tests;

public class FunctionTest
{
    [Fact]
    public async Task TestGetInvite_ReturnsPassedNanoId()
    {
        // Load config and create data table
        var loader = new Loader();
        var config = loader.GetEnvironmentVariables();
        Amazon.RegionEndpoint? region = null;
        if (!string.IsNullOrEmpty(config.DynamoDB.AWSRegion))
        {
            region = RegionEndpoint.GetBySystemName(config.DynamoDB.AWSRegion);
        }
        using var invitesDataTable = new InvitesDataTable(config.DynamoDB.ServiceLocalUrl, region, config.DynamoDB.TablesNameSuffix);

        // Create an invite to retrieve
        var testInvite = new Invite
        {
            NanoId = "12345678",
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

        // Invoke the lambda function and confirm the NanoId is echoed back
        var mockObserver = new LoggerObserver();
        var function = new GetInviteLambda(mockObserver, invitesDataTable);
        var context = new TestLambdaContext();
        var validNanoId = "12345678";
        var invite = await function.HandleAsync(validNanoId, context);

        Assert.Equal(validNanoId, invite.NanoId);
    }
}

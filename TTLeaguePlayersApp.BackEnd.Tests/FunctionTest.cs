using Xunit;
using Amazon.Lambda.Core;
using Amazon.Lambda.TestUtilities;
using TTLeaguePlayersApp.BackEnd;

namespace TTLeaguePlayersApp.BackEnd.Lambdas.Invites.Tests;

public class FunctionTest
{
    [Fact]
    public async Task TestGetInvite_ReturnsPassedNanoId()
    {
        // Invoke the lambda function and confirm the NanoId is echoed back
        var mockObserver = new LoggerObserver();
        var function = new GetInviteLambda(mockObserver);
        var context = new TestLambdaContext();
        var validNanoId = "12345678";
        var invite = await function.HandleAsync(validNanoId, context);

        Assert.Equal(validNanoId, invite.NanoId);
    }
}

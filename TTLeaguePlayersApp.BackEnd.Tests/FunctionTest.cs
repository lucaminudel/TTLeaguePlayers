using Xunit;
using Amazon.Lambda.Core;
using Amazon.Lambda.TestUtilities;

namespace TTLeaguePlayersApp.BackEnd.Lambdas.Invites.Tests;

public class FunctionTest
{
    [Fact]
    public async Task TestGetInvite_ReturnsPassedNanoId()
    {
        // Invoke the lambda function and confirm the NanoID is echoed back
        var function = new GetInviteLambda();
        var context = new TestLambdaContext();
        var invite = await function.HandleAsync("hello world", context);

        Assert.Equal("hello world", invite.NanoID);
    }
}

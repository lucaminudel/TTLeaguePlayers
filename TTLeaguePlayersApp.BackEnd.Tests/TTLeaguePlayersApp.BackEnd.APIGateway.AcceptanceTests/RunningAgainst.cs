using System;

namespace TTLeaguePlayersApp.BackEnd.APIGateway.AcceptanceTests;

public static class RunningAgainst
{
    public static bool ACloudEnvironmentIsTrue()
    {
        var environment = Environment.GetEnvironmentVariable("ENVIRONMENT") ?? "dev";
        return environment == "staging" || environment == "prod";
    }

    public static bool ALocalEnvironmentIsTrue()
    {
        
        return !ACloudEnvironmentIsTrue();
    }

}

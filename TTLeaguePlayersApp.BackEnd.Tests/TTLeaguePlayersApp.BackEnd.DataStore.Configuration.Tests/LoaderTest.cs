using Xunit;

// Disable parallelization to prevent environment variable conflicts
[assembly: CollectionBehavior(DisableTestParallelization = true)]

namespace TTLeaguePlayersApp.BackEnd.Configuration.DataStore.Tests;

[Trait("Environment", "Staging")]
public class LoaderTest : IDisposable
{
    private readonly string? _originalEnvironment;

    public LoaderTest()
    {
        _originalEnvironment = Environment.GetEnvironmentVariable("ENVIRONMENT");
    }

    public void Dispose()
    {
        if (_originalEnvironment != null)
        {
            Environment.SetEnvironmentVariable("ENVIRONMENT", _originalEnvironment);
        }
        else
        {
            Environment.SetEnvironmentVariable("ENVIRONMENT", null);
        }
    }

    [Theory]
    [InlineData("dev")]
    [InlineData("test")]
    [InlineData("staging")]
    [InlineData("prod")]
    public void GetEnvironmentVariables_ValidEnvironment_ReturnsConfig(string environment)
    {
        // Arrange
        Environment.SetEnvironmentVariable("ENVIRONMENT", environment);
        var loader = new Loader();

        // Act
        var config = loader.GetEnvironmentVariables();

        // Assert
        Assert.NotNull(config);
        
        // FrontEnd
        Assert.NotNull(config.FrontEnd);
        Assert.NotNull(config.FrontEnd.WebsiteBaseUrl);

        // ApiGateWay
        Assert.NotNull(config.ApiGateWay);
        Assert.NotNull(config.ApiGateWay.ApiBaseUrl);
        Assert.IsType<bool>(config.ApiGateWay.CreateInviteAutomaticallySendInviteEmail);

        // DynamoDB
        Assert.NotNull(config.DynamoDB);
        Assert.NotNull(config.DynamoDB.TablesNameSuffix);
        if (environment == "dev" || environment == "test")
            Assert.NotNull(config.DynamoDB.ServiceLocalUrl);
        Assert.NotNull(config.DynamoDB.AWSProfile);
        if (environment == "prod")
            Assert.NotNull(config.DynamoDB.AWSRegion); 

        // Cognito
        Assert.NotNull(config.Cognito);
        Assert.NotNull(config.Cognito.UserPoolId);
        Assert.NotNull(config.Cognito.ClientId);
        Assert.NotNull(config.Cognito.Domain);

        // EmailForwarder
        Assert.NotNull(config.EmailForwarder);
        Assert.NotEmpty(config.EmailForwarder.InviteEmailAddress);
        Assert.NotEmpty(config.EmailForwarder.ContactUsEmailAddress);
        Assert.NotEmpty(config.EmailForwarder.ForwardToEmailAddress);

        Assert.NotEmpty(config.ActiveSeasonsDataSource);
        Assert.All(config.ActiveSeasonsDataSource, season => Assert.NotNull(season.StrategySources));
        if (environment == "dev")
        {
            var clttl = Assert.Single(config.ActiveSeasonsDataSource, season => season.League == "CLTTL");
            Assert.Equal("TT365.CLTTLStrategy2026Processor", clttl.CustomStrategyProcessor);
            Assert.Equal(5, clttl.StrategySources.Count);
            Assert.EndsWith("teamId=", clttl.StrategySources["Divisions Teams Players List"].OriginalString);
        }
        else
        {
            Assert.All(config.ActiveSeasonsDataSource, season => Assert.Equal("", season.CustomStrategyProcessor));
            Assert.All(config.ActiveSeasonsDataSource, season => Assert.Empty(season.StrategySources));
        }
    }

    [Fact]
    public void GetEnvironmentVariables_InvalidEnvironment_ThrowsFileNotFoundException()
    {
        // Arrange
        Environment.SetEnvironmentVariable("ENVIRONMENT", "no_env");
        var loader = new Loader();

        // Act & Assert
        Assert.Throws<FileNotFoundException>(() => loader.GetEnvironmentVariables());
    }
}

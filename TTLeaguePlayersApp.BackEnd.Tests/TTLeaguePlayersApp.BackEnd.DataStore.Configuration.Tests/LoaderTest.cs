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

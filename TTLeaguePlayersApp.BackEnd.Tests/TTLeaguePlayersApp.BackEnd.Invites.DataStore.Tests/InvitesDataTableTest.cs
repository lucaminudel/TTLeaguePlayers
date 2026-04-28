using FluentAssertions;
using Xunit;
using System.Collections.Concurrent;

namespace TTLeaguePlayersApp.BackEnd.Invites.DataStore.Tests;

[Trait("Environment", "Staging")]
public class InvitesDataTableTest : IAsyncLifetime
{
    private readonly InvitesDataTable _db;
    private readonly ConcurrentBag<string> _createdNanoIds = new();

    public InvitesDataTableTest()
    {
        var config = new Configuration.DataStore.Loader().GetEnvironmentVariables();
        
        Amazon.RegionEndpoint? region = null;
        if (!string.IsNullOrEmpty(config.DynamoDB.AWSRegion))
        {
            region = Amazon.RegionEndpoint.GetBySystemName(config.DynamoDB.AWSRegion);
        }
        
        _db = new InvitesDataTable(config.DynamoDB.ServiceLocalUrl, region, config.DynamoDB.TablesNameSuffix!);
    }

    public Task InitializeAsync() => Task.CompletedTask;

    [Fact]
    public async Task CreateNewCaptainInvite_SavesItemSuccessfully()
    {
        // Arrange
        var invite = CreateCaptainTestInvite();

        // Act
        await TrackedCreate(invite);

        // Assert
        var retrieved = (CaptainOrPlayerInvite)await _db.RetrieveInvite(invite.NanoId);
        retrieved.Should().BeEquivalentTo(invite);
    }

    [Fact]
    public async Task CreateNewClubManagerInvite_SavesItemSuccessfully()
    {
        // Arrange
        var invite = CreateClubManagerTestInvite();

        // Act
        await TrackedCreate(invite);

        // Assert
        var retrieved = (ClubManagerInvite) await _db.RetrieveInvite(invite.NanoId);
        retrieved.Should().BeEquivalentTo(invite);
    }


    [Fact]
    public async Task CreateNewCaptainInvite_Throws_WhenRequiredFieldsAreMissing()
    {
        // Arrange
        var invite = CreateCaptainTestInvite();
        invite.InviteeName = ""; // Required field missing

        // Act
        Func<Task> act = async () => await _db.CreateNewInvite(invite);

        // Assert
       var exception = await act.Should().ThrowAsync<ValidationException>();
        exception.Which.Errors.Should().HaveCount(1);
        exception.Which.Errors.Should().Contain(e => e.Contains("invitee_name is required"));
    }

    [Fact]
    public async Task CreateNewCaptainInvite_Throws_WhenEmailIsInvalid()
    {
        // Arrange
        var invite = CreateCaptainTestInvite();
        invite.InviteeEmailId = "invalid-email";

        // Act
        Func<Task> act = async () => await _db.CreateNewInvite(invite);

        // Assert
       var exception = await act.Should().ThrowAsync<ValidationException>();
        exception.Which.Errors.Should().HaveCount(1);
        exception.Which.Errors.Should().Contain(e => e.Contains("invitee_email_id must be a valid email address"));
    }
    
    [Fact]
    public async Task CreateNewClubManagerInvite_Throws_WhenRequiredFieldsAreMissing()
    {
        // Arrange
        var invite = CreateClubManagerTestInvite();
        invite.InviteeClub = ""; // Required field missing

        // Act
        Func<Task> act = async () => await _db.CreateNewInvite(invite);

        // Assert
       var exception = await act.Should().ThrowAsync<ValidationException>();
        exception.Which.Errors.Should().HaveCount(1);
        exception.Which.Errors.Should().Contain(e => e.Contains("invitee_club is required"));
    }

    class UnexpectedInviteType : Invite { }

    [Fact]
    public async Task CreateNewInvite_Throws_WhenPassingAnUnexpectedInviteType()
    {

        // Arrange
        var unexpectedInviteType = new UnexpectedInviteType
        {
            NanoId = GenerateNanoId(),
            InviteeName = "Test User",
            InviteeEmailId = $"test-{Guid.NewGuid()}@example.com",
            InviteeRole = (Role) 999, // Invalid role to trigger the default case in CreateInviteFromRequest
            League = "TT League",
            Season = "2025",
            InvitedBy = "Admin User",
            CreatedAt = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
            AcceptedAt = null
        };

        // Act
        Func<Task> act = async () => await _db.CreateNewInvite(unexpectedInviteType);

        // Assert
       var exception = await act.Should().ThrowAsync<ValidationException>();
        exception.Which.Errors.Should().HaveCount(2);
        exception.Which.Errors.Should().Contain(e => e.Contains("Unknown invite type"));
        exception.Which.Errors.Should().Contain(e => e.Contains("invitee_role is not a valid role"));        
    }

    [Fact]
    public async Task RetrieveCaptainInvite_ReturnsItem()
    {
         // Arrange
        var invite = CreateCaptainTestInvite();
        await TrackedCreate(invite);

        // Act
        var retrieved = (CaptainOrPlayerInvite) await _db.RetrieveInvite(invite.NanoId);

        // Assert
        retrieved.Should().BeEquivalentTo(invite);
    }

    [Fact]
    public async Task RetrieveClubManagerInvite_ReturnsItem()
    {
         // Arrange
        var invite = CreateClubManagerTestInvite();
        await TrackedCreate(invite);

        // Act
        var retrieved = (ClubManagerInvite) await _db.RetrieveInvite(invite.NanoId);

        // Assert
        retrieved.Should().BeEquivalentTo(invite);
    }

    [Fact]
    public async Task RetrieveInvite_Throws_WhenNotFound()
    {
        // Arrange
        var nonExistentId = "non-existent-id";

        // Act
        Func<Task> act = async () => await _db.RetrieveInvite(nonExistentId);

        // Assert
        await act.Should().ThrowAsync<KeyNotFoundException>()
            .WithMessage($"Invite with NanoId '{nonExistentId}' not found.");
    }

    [Fact]
    public async Task RetrieveInvite_Throws_WhenIdIsEmpty()
    {
        // Act
        Func<Task> act = async () => await _db.RetrieveInvite("");

        // Assert
        await act.Should().ThrowAsync<ArgumentException>()
            .WithMessage("*NanoId cannot be null or empty*");
    }

    [Fact]
    public async Task MarkInviteAccepted_UpdatesItem()
    {
        // Arrange
        var invite = CreateCaptainTestInvite();
        await TrackedCreate(invite);
        var acceptedAt = DateTimeOffset.UtcNow.ToUnixTimeSeconds();

        // Act
        await _db.MarkInviteAccepted(invite.NanoId, acceptedAt);

        // Assert
        var retrieved = await _db.RetrieveInvite(invite.NanoId);
        retrieved.AcceptedAt.Should().Be(acceptedAt);
        retrieved.Should().BeEquivalentTo(invite, options => options.Excluding(i => i.AcceptedAt));
    }

    [Fact]
    public async Task MarkInviteAccepted_IsIdempotent()
    {
        // Arrange
        var invite = CreateCaptainTestInvite();
        await TrackedCreate(invite);
        var acceptedAt = DateTimeOffset.UtcNow.ToUnixTimeSeconds();

        // Act
        await _db.MarkInviteAccepted(invite.NanoId, acceptedAt);
        await _db.MarkInviteAccepted(invite.NanoId, acceptedAt); // Second call

        // Assert
        var retrieved = await _db.RetrieveInvite(invite.NanoId);
        retrieved.AcceptedAt.Should().Be(acceptedAt);
    }

    [Fact]
    public async Task MarkInviteAccepted_Throws_WhenNotFound()
    {
        // Arrange
        var nonExistentId = "non-existent-id";
        var acceptedAt = DateTimeOffset.UtcNow.ToUnixTimeSeconds();

        // Act
        Func<Task> act = async () => await _db.MarkInviteAccepted(nonExistentId, acceptedAt);

        // Assert
        await act.Should().ThrowAsync<KeyNotFoundException>()
            .WithMessage($"Invite with NanoId '{nonExistentId}' not found.");
    }

    [Fact]
    public async Task DeleteInvite_RemovesItem()
    {
        // Arrange
        var invite = CreateCaptainTestInvite();
        await _db.CreateNewInvite(invite); // Not tracked here because we delete it in 'Act'

        // Act
        await _db.DeleteInvite(invite.NanoId);

        // Assert
        Func<Task> act = async () => await _db.RetrieveInvite(invite.NanoId);
        await act.Should().ThrowAsync<KeyNotFoundException>();
    }
    
    // Helper to create a valid invite object
    private static CaptainOrPlayerInvite CreateCaptainTestInvite()
    {
        return new CaptainOrPlayerInvite
        {
            NanoId = GenerateNanoId(),
            InviteeName = "Test User",
            InviteeEmailId = $"test-{Guid.NewGuid()}@example.com",
            InviteeRole = Role.CAPTAIN,
            InviteeTeam = "Test Team",
            TeamDivision = "Division 1",
            League = "TT League",
            Season = "2025",
            InvitedBy = "Admin User",
            CreatedAt = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
            AcceptedAt = null
        };
    }

    private static ClubManagerInvite CreateClubManagerTestInvite()
    {
        return new ClubManagerInvite
        {
            NanoId = GenerateNanoId(),
            InviteeName = "Test User",
            InviteeEmailId = $"test-{Guid.NewGuid()}@example.com",
            InviteeRole = Role.CAPTAIN,
            InviteeClub = "Test Club",
            ClubLocation = "London",
            League = "TT League",
            Season = "2025",
            InvitedBy = "Admin User",
            CreatedAt = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
            AcceptedAt = null
        };
    }

    private async Task TrackedCreate(Invite invite)
    {
        await _db.CreateNewInvite(invite);
        _createdNanoIds.Add(invite.NanoId);
    }

    private static string GenerateNanoId()
    {
        // Simple mock of nano id
        return Guid.NewGuid().ToString("N")[..8];
    }

    public async Task DisposeAsync()
    {
        foreach (var nanoId in _createdNanoIds)
        {
            try { await _db.DeleteInvite(nanoId); } catch { /* ignore */ }
        }
        _db.Dispose();
    }
}

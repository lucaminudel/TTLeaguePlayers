using Amazon.CognitoIdentityProvider.Model;
using System.Text.Json;
using FluentAssertions;
using TTLeaguePlayersApp.BackEnd.Cognito;
using Xunit;

namespace TTLeaguePlayersApp.BackEnd.Cognito.Tests;

public class CognitoUsersTests
{
    #region ExtractManagedClubs

    [Fact]
    public void ExtractManagedClubs_WhenAttributeIsMissing_ReturnsEmptyList()
    {
        var user = new UserType { Attributes = new() };

        var result = CognitoUsers.ExtractManagedClubs(user);

        result.Should().BeEmpty();
    }

    [Fact]
    public void ExtractManagedClubs_WhenAttributeValueIsWhitespace_ReturnsEmptyList()
    {
        var user = new UserType
        {
            Attributes = new() { new() { Name = "custom:managed_clubs", Value = "   " } }
        };

        var result = CognitoUsers.ExtractManagedClubs(user);

        result.Should().BeEmpty();
    }

    [Fact]
    public void ExtractManagedClubs_WhenAttributeHasValidJson_ReturnsParsedList()
    {
        var managedClubs = new List<ManagedClub>
        {
            new() { League = "CLTTL", Season = "2025-2026", ClubName = "London TTC", ClubLocation = "London", ManagerName = "Alice" }
        };
        var user = new UserType
        {
            Attributes = new() { new() { Name = "custom:managed_clubs", Value = JsonSerializer.Serialize(managedClubs) } }
        };

        var result = CognitoUsers.ExtractManagedClubs(user);

        result.Should().BeEquivalentTo(managedClubs);
    }

    [Fact]
    public void ExtractManagedClubs_WhenAttributeIsMalformedJson_Throws_InvalidOperationException()
    {
        var user = new UserType
        {
            Attributes = new() { new() { Name = "custom:managed_clubs", Value = "not valid json" } }
        };

        var act = () => CognitoUsers.ExtractManagedClubs(user);

        act.Should().Throw<InvalidOperationException>();
    }

    #endregion

    #region FindConflictingLeagueSeasonEntry

    [Fact]
    public void FindConflictingLeagueSeasonEntry_WhenNoManagedClubs_ReturnsNull()
    {
        var result = CognitoUsers.FindConflictingLeagueSeasonEntry(
            new List<ManagedClub>(), league: "CLTTL", season: "2025-2026", clubName: "London TTC", clubLocation: "London");

        result.Should().BeNull();
    }

    [Fact]
    public void FindConflictingLeagueSeasonEntry_WhenExistingEntryIsForADifferentLeague_ReturnsNull()
    {
        var managedClubs = new List<ManagedClub>
        {
            new() { League = "BLTTL", Season = "2025-2026", ClubName = "Other Club", ClubLocation = "Brighton", ManagerName = "Bob" }
        };

        var result = CognitoUsers.FindConflictingLeagueSeasonEntry(
            managedClubs, league: "CLTTL", season: "2025-2026", clubName: "London TTC", clubLocation: "London");

        result.Should().BeNull();
    }

    [Fact]
    public void FindConflictingLeagueSeasonEntry_WhenExistingEntryIsForADifferentSeason_ReturnsNull()
    {
        var managedClubs = new List<ManagedClub>
        {
            new() { League = "CLTTL", Season = "2024-2025", ClubName = "Other Club", ClubLocation = "Brighton", ManagerName = "Bob" }
        };

        var result = CognitoUsers.FindConflictingLeagueSeasonEntry(
            managedClubs, league: "CLTTL", season: "2025-2026", clubName: "London TTC", clubLocation: "London");

        result.Should().BeNull();
    }

    [Fact]
    public void FindConflictingLeagueSeasonEntry_WhenExistingEntryIsTheSameClubAndLocation_ReturnsNull()
    {
        var managedClubs = new List<ManagedClub>
        {
            new() { League = "CLTTL", Season = "2025-2026", ClubName = "London TTC", ClubLocation = "London", ManagerName = "Alice" }
        };

        var result = CognitoUsers.FindConflictingLeagueSeasonEntry(
            managedClubs, league: "CLTTL", season: "2025-2026", clubName: "London TTC", clubLocation: "London");

        result.Should().BeNull();
    }

    [Fact]
    public void FindConflictingLeagueSeasonEntry_WhenExistingEntrySameLeagueSeasonButDifferentClubName_ReturnsIt()
    {
        var conflicting = new ManagedClub { League = "CLTTL", Season = "2025-2026", ClubName = "Other Club", ClubLocation = "London", ManagerName = "Bob" };
        var managedClubs = new List<ManagedClub> { conflicting };

        var result = CognitoUsers.FindConflictingLeagueSeasonEntry(
            managedClubs, league: "CLTTL", season: "2025-2026", clubName: "London TTC", clubLocation: "London");

        result.Should().BeSameAs(conflicting);
    }

    [Fact]
    public void FindConflictingLeagueSeasonEntry_WhenExistingEntrySameLeagueSeasonButDifferentLocation_ReturnsIt()
    {
        var conflicting = new ManagedClub { League = "CLTTL", Season = "2025-2026", ClubName = "London TTC", ClubLocation = "Manchester", ManagerName = "Bob" };
        var managedClubs = new List<ManagedClub> { conflicting };

        var result = CognitoUsers.FindConflictingLeagueSeasonEntry(
            managedClubs, league: "CLTTL", season: "2025-2026", clubName: "London TTC", clubLocation: "London");

        result.Should().BeSameAs(conflicting);
    }

    #endregion
}

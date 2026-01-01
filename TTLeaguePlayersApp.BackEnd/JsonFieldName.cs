using System;
using System.Linq;
using System.Text.Json.Serialization;

namespace TTLeaguePlayersApp.BackEnd;

public static class JsonFieldName
{
    public static string For<T>(string propertyName)
    {
        if (string.IsNullOrWhiteSpace(propertyName))
        {
            return propertyName;
        }

        // Be resilient to different casing (e.g. "nanoId" vs "NanoId").
        var prop = typeof(T)
            .GetProperties()
            .FirstOrDefault(p => string.Equals(p.Name, propertyName, StringComparison.OrdinalIgnoreCase));

        var attribute = prop?.GetCustomAttributes(typeof(JsonPropertyNameAttribute), true)
            .FirstOrDefault() as JsonPropertyNameAttribute;

        return attribute?.Name ?? propertyName;
    }
}

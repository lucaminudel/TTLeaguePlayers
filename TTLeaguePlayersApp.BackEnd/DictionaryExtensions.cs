using System.Numerics;

namespace TTLeaguePlayersApp.BackEnd;

public static class DictionaryExtensions
{
    public static Dictionary<TKey, TValue> With<TKey, TValue>(this Dictionary<TKey, TValue> dict, TKey key, TValue value)
        where TKey : notnull
    {
        var result = new Dictionary<TKey, TValue>(dict) { [key] = value };
        return result;
    }

    public static Dictionary<string, string> With(this Dictionary<string, string> dict, System.Net.HttpStatusCode value)
    {
        var result = new Dictionary<string, string>(dict) { ["ResponseStatusCode"] = value.ToString() };
        return result;
    }

    public static Dictionary<string, string> With(this Dictionary<string, string> dict, System.Net.HttpStatusCode value, string errorMessage)
    {
        var result = new Dictionary<string, string>(dict) { ["ResponseStatusCode"] = value.ToString(), ["Message"] = errorMessage };
        return result;
    }

}
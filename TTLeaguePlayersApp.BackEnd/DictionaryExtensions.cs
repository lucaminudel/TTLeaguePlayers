namespace TTLeaguePlayersApp.BackEnd;

public static class DictionaryExtensions
{
    public static Dictionary<TKey, TValue> With<TKey, TValue>(this Dictionary<TKey, TValue> dict, TKey key, TValue value)
        where TKey : notnull
    {
        var result = new Dictionary<TKey, TValue>(dict) { [key] = value };
        return result;
    }

    public static Dictionary<TKey, TValue> Merge<TKey, TValue>(this Dictionary<TKey, TValue> dict1, Dictionary<TKey, TValue> dict2)
        where TKey : notnull
    {
        var result = new Dictionary<TKey, TValue>(dict1);
        foreach (var kvp in dict2)
            result[kvp.Key] = kvp.Value;
        return result;
    }
}
using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using HtmlAgilityPack;

namespace TTLeaguePlayersApp.BackEnd.Strategy.TT365;

public sealed class CLTTLStrategy2026Parser
{
    private static readonly string[] DateFormats = ["d MMM yyyy", "dd MMM yyyy", "d MMMM yyyy", "dd MMMM yyyy"];

    public (IReadOnlyDictionary<string, Player> AllPlayers, IReadOnlyList<string> Anomalies) ParseRankingPlayers(IEnumerable<string> rankingPageHtml)
    {
        ArgumentNullException.ThrowIfNull(rankingPageHtml);

        var players = new Dictionary<string, (Player Player, int RankingId)>(StringComparer.OrdinalIgnoreCase);
        var anomalies = new List<string>();
        var pageNumber = 0;

        foreach (var html in rankingPageHtml)
        {
            pageNumber++;
            if (html is null)
                throw new ArgumentException("Accepted ranking pages cannot contain null HTML.", nameof(rankingPageHtml));

            var document = new HtmlDocument();
            document.LoadHtml(html);
            var table = document.DocumentNode.SelectSingleNode(
                "//*[contains(concat(' ', normalize-space(@class), ' '), ' tt-ranking-table ')]");
            if (table is null)
                throw new InvalidOperationException($"Accepted ranking page {pageNumber} has no ranking table.");

            var rows = table.SelectNodes(".//tr[td]");
            if (rows is null)
                continue;

            for (var rowNumber = 0; rowNumber < rows.Count; rowNumber++)
            {
                var row = rows[rowNumber];
                var nameCell = row.SelectSingleNode("./td[contains(concat(' ', normalize-space(@class), ' '), ' tt-ranking-col-name ')]");
                var currentCell = row.SelectSingleNode("./td[contains(concat(' ', normalize-space(@class), ' '), ' tt-ranking-col-current ')]");
                var name = nameCell is null
                    ? string.Empty
                    : HtmlEntity.DeEntitize(nameCell.InnerText).Replace('\u00a0', ' ').Trim();
                var currentText = currentCell is null ? string.Empty : NormalizeText(currentCell.InnerText);
                var hasCurrent = TryParseCurrent(currentText, out var current);
                var rowLabel = $"page {pageNumber}, row {rowNumber + 1}";

                if (string.Equals(name, "Hidden", StringComparison.OrdinalIgnoreCase))
                    continue;

                if (name.Length == 0 || !hasCurrent)
                {
                    var missing = new List<string>();
                    if (name.Length == 0)
                        missing.Add("name");
                    if (!hasCurrent)
                        missing.Add("numeric Current ranking");
                    anomalies.Add($"Skipped {rowLabel}: missing {string.Join(" and ", missing)}.");
                    continue;
                }

                name = NormalizeSpecialSpacing(name);
                if (name.Length == 0)
                {
                    anomalies.Add($"Skipped {rowLabel}: name was empty after normalization.");
                    continue;
                }

                var hasRankingId = TryParseRankingId(nameCell, out var rankingId);
                if (!hasRankingId)
                    anomalies.Add($"{rowLabel} ({name}) has no valid numeric member ID; using 0.");

                var candidate = new Player(name, current);
                if (!players.TryGetValue(name, out var existing))
                {
                    players.Add(name, (candidate, rankingId));
                    continue;
                }

                if (rankingId > existing.RankingId)
                {
                    players.Remove(name);
                    players.Add(candidate.Name, (candidate, rankingId));
                }
                var selectedId = Math.Max(rankingId, existing.RankingId);
                var selection = rankingId == existing.RankingId
                    ? "equal member IDs; kept the first entry"
                    : $"selected member ID {selectedId}";
                anomalies.Add($"Duplicate player name '{name}' at {rowLabel}; {selection}.");
            }
        }

        if (players.Count == 0)
            throw new InvalidOperationException("Ranking pages contained no usable player names.");

        return (players.ToDictionary(entry => entry.Key, entry => entry.Value.Player, StringComparer.OrdinalIgnoreCase),
                anomalies);
    }

    public bool TryParseRankingPageMetadata(string html, out RankingPageMetadata? metadata)
    {
        ArgumentNullException.ThrowIfNull(html);
        metadata = null;

        var document = new HtmlDocument();
        document.LoadHtml(html);
        var body = document.DocumentNode.SelectSingleNode("//body") ?? document.DocumentNode;
        var pageText = NormalizeText(string.Join(" ", body.Descendants()
            .Where(node => node.NodeType == HtmlNodeType.Text)
            .Select(node => HtmlEntity.DeEntitize(node.InnerText))));

        var datesMatch = DatesRegex.Match(pageText);
        var rangeMatch = RangeRegex.Match(pageText);
        if (!datesMatch.Success || !rangeMatch.Success)
            return false;

        if (!TryParseDate(datesMatch.Groups["lastUpdated"].Value, out var lastUpdated)
            || !TryParseDate(datesMatch.Groups["periodEnding"].Value, out var periodEnding)
            || !TryParseInteger(rangeMatch.Groups["start"].Value, out var rangeStart)
            || !TryParseInteger(rangeMatch.Groups["end"].Value, out var rangeEnd)
            || !TryParseInteger(rangeMatch.Groups["total"].Value, out var totalPlayers))
            return false;

        var pagination = document.DocumentNode.SelectSingleNode(
            "//*[contains(concat(' ', normalize-space(@class), ' '), ' pagination ')]");
        if (pagination is null)
            return false;

        var pageLinks = pagination.SelectNodes(".//a");
        if (pageLinks is null || pageLinks.Count == 0)
            return false;

        var activePageLinks = pagination.SelectNodes(
            ".//li[contains(concat(' ', normalize-space(@class), ' '), ' active ')]//a");
        if (activePageLinks is null || activePageLinks.Count != 1
            || !TryParseInteger(NormalizeText(activePageLinks[0].InnerText), out var currentPage))
            return false;

        var numberedPages = pageLinks
            .Select(link => TryParseInteger(NormalizeText(link.InnerText), out var pageNumber) ? pageNumber : (int?)null)
            .Where(pageNumber => pageNumber.HasValue)
            .Select(pageNumber => pageNumber!.Value)
            .ToArray();
        if (numberedPages.Length == 0)
            return false;

        var nextPageLinks = pageLinks
            .Where(link => IsNextPageLabel(NormalizeText(link.InnerText)))
            .ToArray();
        if (nextPageLinks.Length != 1)
            return false;

        var nextPageLink = nextPageLinks[0];
        var nextPageListItem = nextPageLink.Ancestors("li").FirstOrDefault();
        var nextDisabled = nextPageListItem is not null && HasClass(nextPageListItem, "disabled");
        var nextHref = nextPageLink.GetAttributeValue("href", string.Empty);
        var nextPageMatch = PageQueryRegex.Match(nextHref);
        if (!nextPageMatch.Success || !TryParseInteger(nextPageMatch.Groups["page"].Value, out var nextPage))
            return false;

        var lastPage = numberedPages.Max();
        if (rangeStart < 1 || rangeEnd < rangeStart || totalPlayers < rangeEnd
            || currentPage < 1 || lastPage < currentPage || nextPage != currentPage + 1)
            return false;

        if (nextDisabled && (currentPage != lastPage || rangeEnd != totalPlayers))
            return false;
        if (!nextDisabled && (currentPage >= lastPage || rangeEnd >= totalPlayers))
            return false;

        metadata = new RankingPageMetadata(
            lastUpdated,
            periodEnding,
            rangeStart,
            rangeEnd,
            totalPlayers,
            currentPage,
            lastPage,
            nextPage,
            nextDisabled);
        return true;
    }
    
    public (OrderedDictionary<string, Division> AllDivisions, OrderedDictionary<string, Team> AllTeams) ParseDivisionsAndTeams(string html)
    {
        ArgumentNullException.ThrowIfNull(html);

        var document = new HtmlDocument();
        document.LoadHtml(html);
        var selector = document.DocumentNode.SelectSingleNode("//select[@id='teamSelect']");
        if (selector is null)
            throw new InvalidOperationException("The divisions and teams page has no team selector.");

        var allDivisions = new OrderedDictionary<string, Division>(StringComparer.OrdinalIgnoreCase);
        var allTeams = new OrderedDictionary<string, Team>(StringComparer.OrdinalIgnoreCase);
        var divisionGroups = selector.SelectNodes("./optgroup");
        if (divisionGroups is null || divisionGroups.Count == 0)
            throw new InvalidOperationException("The team selector has no division groups.");

        foreach (var divisionGroup in divisionGroups)
        {
            var rawDivisionName = NormalizeHtmlName(divisionGroup.GetAttributeValue("label", string.Empty));
            if (rawDivisionName.Length == 0)
                throw new InvalidOperationException("A division group has no usable name.");

            var divisionName = NormalizeDivisionName(rawDivisionName);
            if (allDivisions.ContainsKey(divisionName))
                throw new InvalidOperationException($"The team selector contains duplicate division '{divisionName}'.");

            var division = new Division(divisionName);
            allDivisions.Add(divisionName, division);

            var teamOptions = divisionGroup.SelectNodes("./option");
            if (teamOptions is null || teamOptions.Count == 0)
                throw new InvalidOperationException($"Division '{divisionName}' has no teams.");

            foreach (var teamOption in teamOptions)
            {
                var teamName = NormalizeHtmlName(teamOption.InnerText);
                if (teamName.Length == 0)
                    throw new InvalidOperationException($"Division '{divisionName}' contains a team with no usable name.");
                if (!int.TryParse(
                    teamOption.GetAttributeValue("value", string.Empty),
                    NumberStyles.None,
                    CultureInfo.InvariantCulture,
                    out var teamId) || teamId <= 0)
                {
                    throw new InvalidOperationException($"Team '{teamName}' in division '{divisionName}' has an invalid team ID.");
                }
                if (allTeams.ContainsKey(teamName))
                    throw new InvalidOperationException($"The team selector contains duplicate team '{teamName}'.");

                var team = new Team(division, teamName, teamId);
                division.Teams.Add(teamName, team);
                allTeams.Add(teamName, team);
            }
        }

        return (allDivisions, allTeams);
    }

    public IReadOnlyList<string> ParseTeamPlayers(string teamPlayersjson, Team requestedTeam, IReadOnlyDictionary<string, Team> allTeams)
    {
        ArgumentNullException.ThrowIfNull(teamPlayersjson);
        ArgumentNullException.ThrowIfNull(requestedTeam);
        ArgumentNullException.ThrowIfNull(allTeams);

        using var document = JsonDocument.Parse(teamPlayersjson);
        var root = document.RootElement;
        if (root.ValueKind != JsonValueKind.Object
            || !root.TryGetProperty("teamPlayers", out var teamPlayers)
            || teamPlayers.ValueKind != JsonValueKind.Array)
        {
            throw new InvalidOperationException("The team players response must contain a teamPlayers array.");
        }

        var anomalies = new List<string>();
        var pendingGroups = new List<(Team Team, OrderedDictionary<string, Player> Players)>
        {
            (requestedTeam, ParsePlayerGroup(teamPlayers.EnumerateArray(), $"team '{requestedTeam.Name}'", anomalies))
        };

        if (!root.TryGetProperty("otherPlayers", out var otherPlayers)
            || otherPlayers.ValueKind != JsonValueKind.Array)
        {
            anomalies.Add("The team players response has no otherPlayers array; no reusable team rosters were available.");
            AddPlayerGroups(pendingGroups);
            return anomalies;
        }

        var playerGroupsByTeam = new OrderedDictionary<string, List<JsonElement>>(StringComparer.OrdinalIgnoreCase);
        var otherPlayerIndex = 0;
        foreach (var otherPlayer in otherPlayers.EnumerateArray())
        {
            otherPlayerIndex++;
            if (!TryGetRequiredString(otherPlayer, "teamName", out var teamName))
            {
                anomalies.Add($"Skipped otherPlayers entry {otherPlayerIndex}: missing team name.");
                continue;
            }

            teamName = teamName.Replace('\u00a0', ' ');

            if (!playerGroupsByTeam.TryGetValue(teamName, out var teamGroup))
            {
                teamGroup = [];
                playerGroupsByTeam.Add(teamName, teamGroup);
            }

            teamGroup.Add(otherPlayer);
        }

        foreach (var (teamName, entries) in playerGroupsByTeam)
        {
            if (!allTeams.TryGetValue(teamName, out var team))
            {
                anomalies.Add($"Skipped otherPlayers group for unknown team '{teamName}'.");
                continue;
            }

            pendingGroups.Add((
                team,
                ParsePlayerGroup(entries, $"team '{team.Name}'", anomalies)));
        }

        AddPlayerGroups(pendingGroups);
        return anomalies;
    }

    private static bool TryParseDate(string text, out DateOnly date)
    {
        if (DateTime.TryParseExact(
            NormalizeText(text),
            DateFormats,
            CultureInfo.InvariantCulture,
            DateTimeStyles.AllowWhiteSpaces,
            out var parsedDate))
        {
            date = DateOnly.FromDateTime(parsedDate);
            return true;
        }

        date = default;
        return false;
    }

    private static bool TryParseInteger(string text, out int value) =>
        int.TryParse(text.Replace(",", string.Empty, StringComparison.Ordinal), NumberStyles.None, CultureInfo.InvariantCulture, out value);

    private static bool TryParseCurrent(string text, out int current) =>
        int.TryParse(text.Replace(",", string.Empty, StringComparison.Ordinal), NumberStyles.None, CultureInfo.InvariantCulture, out current);

    private static bool TryParseRankingId(HtmlNode? nameCell, out int rankingId)
    {
        var memberLink = nameCell?.SelectSingleNode(".//a[@href]");
        var href = memberLink?.GetAttributeValue("href", string.Empty) ?? string.Empty;
        var match = Regex.Match(href, @"(?:\?|&)id=(?<id>\d+)(?:&|$)", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        if (match.Success && int.TryParse(match.Groups["id"].Value, NumberStyles.None, CultureInfo.InvariantCulture, out rankingId))
            return true;

        rankingId = 0;
        return false;
    }

    private static string NormalizeSpecialSpacing(string name)
    {
        var match = DuplicateWordSpacingRegex.Match(name);
        return match.Success
            ? $"{match.Groups["first"].Value} {match.Groups["second"].Value}{match.Groups["remaining"].Value}".Trim()
            : name;
    }

    private static bool IsNextPageLabel(string text) => text is "›" or "»" || text.Equals("Next", StringComparison.OrdinalIgnoreCase);

    private static OrderedDictionary<string, Player> ParsePlayerGroup(
        IEnumerable<JsonElement> entries,
        string teamContext,
        ICollection<string> anomalies)
    {
        var players = new OrderedDictionary<string, Player>(StringComparer.OrdinalIgnoreCase);
        var entryIndex = 0;

        foreach (var entry in entries)
        {
            entryIndex++;
            if (!TryGetRequiredString(entry, "name", out var playerName))
            {
                anomalies.Add($"Skipped player {entryIndex} for {teamContext}: missing player name.");
                continue;
            }

            if (!players.TryAdd(playerName, new Player(playerName, null)))
                anomalies.Add($"Skipped duplicate player '{playerName}' for {teamContext}.");
        }

        if (entryIndex > 0 && players.Count == 0)
            throw new InvalidOperationException($"The nonempty roster for {teamContext} contained no usable player names.");

        return players;
    }

    private static bool TryGetRequiredString(JsonElement element, string propertyName, out string value)
    {
        if (element.ValueKind == JsonValueKind.Object
            && element.TryGetProperty(propertyName, out var property)
            && property.ValueKind == JsonValueKind.String
            && !string.IsNullOrWhiteSpace(property.GetString()))
        {
            value = property.GetString()!.Trim();
            return true;
        }

        value = string.Empty;
        return false;
    }

    private static void AddPlayerGroups(IEnumerable<(Team Team, OrderedDictionary<string, Player> Players)> groups)
    {
        foreach (var (team, players) in groups)
        {
            if (team.Players.Count > 0)
                continue;

            foreach (var (playerName, player) in players)
                team.Players.Add(playerName, player);
        }
    }

    private static string NormalizeHtmlName(string value) => HtmlEntity.DeEntitize(value).Replace('\u00a0', ' ').Trim();

    private static string NormalizeDivisionName(string divisionName)
    {
        var match = WordNumberedDivisionRegex.Match(divisionName);
        if (match.Success && DivisionNumbers.TryGetValue(match.Groups["number"].Value, out var number))
            return $"Division {number}";

        return divisionName;
    }

    private static bool HasClass(HtmlNode node, string className) =>
        node.GetAttributeValue("class", string.Empty)
            .Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .Contains(className, StringComparer.Ordinal);

    private static string NormalizeText(string text) => Regex.Replace(text.Replace('\u00a0', ' '), @"\s+", " ").Trim();

    private static readonly Regex DatesRegex = new(
        @"Last updated:\s*:?\s*(?<lastUpdated>\d{1,2}\s+[A-Za-z]+\s+\d{4})\s*[·•]\s*Period ending:\s*:?\s*(?<periodEnding>\d{1,2}\s+[A-Za-z]+\s+\d{4})",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);

    private static readonly Regex RangeRegex = new(
        @"Showing\s+(?<start>[\d,]+)\s*[–—-]\s*(?<end>[\d,]+)\s+of\s+(?<total>[\d,]+)\s+ranked players\b",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);

    private static readonly Regex PageQueryRegex = new(
        @"(?:\?|&)p=(?<page>\d+)(?:&|$)",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);

    private static readonly IReadOnlyDictionary<string, string> DivisionNumbers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
    {
        ["One"] = "1",
        ["Two"] = "2",
        ["Three"] = "3",
        ["Four"] = "4",
        ["Five"] = "5",
        ["Six"] = "6",
        ["Seven"] = "7",
        ["Eight"] = "8",
        ["Nine"] = "9",
        ["Ten"] = "10"
    };

    private static readonly Regex WordNumberedDivisionRegex = new(
        @"^Division\s+(?<number>\S+)$",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);

    private static readonly Regex DuplicateWordSpacingRegex = new(
        @"^(?<first>\S+)\s+(?<second>\S+) {2}(?<removed>\S+)(?<remaining>(?:\s+\S+)*)$",
        RegexOptions.CultureInvariant | RegexOptions.Compiled);

}

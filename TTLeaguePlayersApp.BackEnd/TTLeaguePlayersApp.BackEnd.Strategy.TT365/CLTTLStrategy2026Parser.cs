using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using HtmlAgilityPack;
using TTLeaguePlayersApp.BackEnd.TTLeaguePlayersApp.BackEnd.Strategy.Lambdas;

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

                name = NormalizeText(NormalizeSpecialSpacing(name));
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
    
    public (OrderedDictionary<string, Division> AllDivisions, OrderedDictionary<string, (Team Team, int Id)> AllTeams) ParseDivisionsAndTeams(string eligibilityPageHtml)
    {
        ArgumentNullException.ThrowIfNull(eligibilityPageHtml);

        var document = new HtmlDocument();
        document.LoadHtml(eligibilityPageHtml);
        var selector = document.DocumentNode.SelectSingleNode("//select[@id='teamSelect']");
        if (selector is null)
            throw new InvalidOperationException("The divisions and teams page has no team selector.");

        var allDivisions = new OrderedDictionary<string, Division>(StringComparer.OrdinalIgnoreCase);
        var allTeams = new OrderedDictionary<string, (Team Team, int Id)>(StringComparer.OrdinalIgnoreCase);
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

                var team = new Team(teamName);
                division.Teams.Add(teamName, team);
                allTeams.Add(teamName, (team, teamId));
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
        var hasUnknownDestination = false;
        foreach (var otherPlayer in otherPlayers.EnumerateArray())
        {
            otherPlayerIndex++;
            if (!TryGetRequiredString(otherPlayer, "teamName", out var teamName))
            {
                anomalies.Add($"Skipped otherPlayers entry {otherPlayerIndex}: missing team name.");
                hasUnknownDestination = true;
                continue;
            }

            teamName = NormalizeText(teamName);

            if (!playerGroupsByTeam.TryGetValue(teamName, out var teamGroup))
            {
                teamGroup = [];
                playerGroupsByTeam.Add(teamName, teamGroup);
            }

            teamGroup.Add(otherPlayer);
        }

        if (hasUnknownDestination)
        {
            AddPlayerGroups(pendingGroups);
            return anomalies;
        }

        var teamsByNormalizedName = allTeams.Values.ToLookup(team => NormalizeText(team.Name), StringComparer.OrdinalIgnoreCase);
        foreach (var (teamName, entries) in playerGroupsByTeam)
        {
            var matchingTeams = teamsByNormalizedName[teamName].ToArray();
            if (matchingTeams.Length != 1)
            {
                anomalies.Add($"Skipped otherPlayers group for unknown or ambiguous team '{teamName}'.");
                continue;
            }

            var team = matchingTeams[0];
            if (ReferenceEquals(team, requestedTeam))
                continue;
            var groupAnomalies = new List<string>();
            try
            {
                var players = ParsePlayerGroup(entries, $"team '{team.Name}'", groupAnomalies);
                anomalies.AddRange(groupAnomalies);
                if (groupAnomalies.Count == 0)
                    pendingGroups.Add((team, players));
            }
            catch (InvalidOperationException error)
            {
                anomalies.AddRange(groupAnomalies);
                anomalies.Add($"Skipped reusable roster for team '{team.Name}': {error.Message}");
            }
        }

        AddPlayerGroups(pendingGroups);
        return anomalies;
    }

    public OrderedDictionary<string, DivisionTable> ParseDivisionTables(string tablesPageHtml)
    {
        ArgumentNullException.ThrowIfNull(tablesPageHtml);

        var document = new HtmlDocument();
        document.LoadHtml(tablesPageHtml);
        var sections = document.DocumentNode.SelectNodes(
            "//div[contains(concat(' ', normalize-space(@class), ' '), ' tt-table-section ')]");
        if (sections is null || sections.Count == 0)
            throw new InvalidOperationException("The league tables page has no division table sections.");

        var divisionTables = new OrderedDictionary<string, DivisionTable>(StringComparer.OrdinalIgnoreCase);
        foreach (var section in sections)
        {
            var rawDivisionName = NormalizeHtmlName(section.SelectSingleNode(
                ".//h3[contains(concat(' ', normalize-space(@class), ' '), ' tt-table-division-title ')]")?.InnerText ?? string.Empty);
            if (rawDivisionName.Length == 0)
                throw new InvalidOperationException("A league table division has no usable name.");

            var divisionName = NormalizeDivisionName(rawDivisionName);
            if (divisionTables.ContainsKey(divisionName))
                throw new InvalidOperationException($"The league tables page contains duplicate division '{divisionName}'.");

            var table = section.SelectSingleNode(
                ".//table[contains(concat(' ', normalize-space(@class), ' '), ' tt-league-table ')]");
            if (table is null)
                throw new InvalidOperationException($"Division '{divisionName}' has no league table.");

            var headerCells = table.SelectNodes("./thead/tr/th");
            if (headerCells is null || headerCells.Count == 0)
                throw new InvalidOperationException($"Division '{divisionName}' has no table headers.");

            var headers = headerCells.Select(cell => NormalizeHtmlName(cell.InnerText)).ToArray();
            if (headers.Any(string.IsNullOrWhiteSpace))
                throw new InvalidOperationException($"Division '{divisionName}' has an empty table header.");
            if (headers.Distinct(StringComparer.OrdinalIgnoreCase).Count() != headers.Length)
                throw new InvalidOperationException($"Division '{divisionName}' has duplicate table headers.");

            var columnIndexes = GetRequiredTableColumnIndexes(divisionName, headers);
            var bodyRows = table.SelectNodes("./tbody/tr");
            if (bodyRows is null || bodyRows.Count == 0)
                throw new InvalidOperationException($"Division '{divisionName}' has no team rows.");

            var divisionTable = new DivisionTable(divisionName);
            var rowNumber = 0;
            foreach (var row in bodyRows)
            {
                rowNumber++;
                var cells = row.SelectNodes("./td");
                if (cells is null || cells.Count != headers.Length)
                    throw new InvalidOperationException($"Division '{divisionName}' row {rowNumber} does not match its table headers.");

                var teamName = NormalizeHtmlName(cells[columnIndexes["Team"]].InnerText);
                if (teamName.Length == 0)
                    throw new InvalidOperationException($"Division '{divisionName}' row {rowNumber} has no team name.");
                if (divisionTable.TeamsStanding.ContainsKey(teamName))
                    throw new InvalidOperationException($"Division '{divisionName}' contains duplicate team '{teamName}'.");

                divisionTable.TeamsStanding.Add(teamName, new TeamStanding(
                    ParseTableInteger(cells[columnIndexes["P"]], divisionName, rowNumber, "played"),
                    ParseTableInteger(cells[columnIndexes["SF"]], divisionName, rowNumber, "sets for"),
                    ParseTableInteger(cells[columnIndexes["SA"]], divisionName, rowNumber, "sets against"),
                    ParseTableInteger(cells[columnIndexes["Pts"]], divisionName, rowNumber, "points")));
            }

            if (divisionTable.TeamsStanding.Values.Sum(standing => (long)standing.SetsFor) !=
                divisionTable.TeamsStanding.Values.Sum(standing => (long)standing.SetsAgainst))
                throw new InvalidOperationException($"Division '{divisionName}' has unequal sets for and against.");

            divisionTables.Add(divisionName, divisionTable);
        }

        return divisionTables;
    }

    public void ValidateFixtureDivisionCoverage(OrderedDictionary<string, Division> divisions, OrderedDictionary<string, List<Fixture>> fixtures)
    {
        foreach (var name in divisions.Keys)
            if (!fixtures.Keys.Any(key => string.Equals(key, name, StringComparison.OrdinalIgnoreCase)))
                throw new InvalidOperationException($"Roster division '{name}' is missing from fixtures.");
    }

    public IReadOnlyList<string> CheckTableFixtureIntegrity(OrderedDictionary<string, DivisionTable> tables, OrderedDictionary<string, List<Fixture>> fixtures)
    {
        ArgumentNullException.ThrowIfNull(tables);
        ArgumentNullException.ThrowIfNull(fixtures);

        var anomalies = new List<string>();
        foreach (var (divisionName, table) in tables)
        {
            if (!fixtures.Keys.Any(key => string.Equals(key, divisionName, StringComparison.OrdinalIgnoreCase)))
                throw new InvalidOperationException($"Table division '{divisionName}' is missing from fixtures.");
            var matches = fixtures
                .Where(entry => string.Equals(entry.Key, divisionName, StringComparison.OrdinalIgnoreCase))
                .SelectMany(entry => entry.Value)
                .Where(fixture => fixture.Played)
                .ToArray();

            foreach (var (teamName, standing) in table.TeamsStanding)
            {
                long played = 0, setsFor = 0, setsAgainst = 0;
                foreach (var fixture in matches)
                {
                    var home = string.Equals(fixture.HomeTeamName, teamName, StringComparison.OrdinalIgnoreCase);
                    var away = string.Equals(fixture.AwayTeamName, teamName, StringComparison.OrdinalIgnoreCase);
                    if (!home && !away) continue;
                    if (!fixture.HomeTeamScore.HasValue || !fixture.AwayTeamScore.HasValue)
                        throw new InvalidOperationException("A played fixture has a missing score.");
                    played++;
                    setsFor += home ? fixture.HomeTeamScore.Value : fixture.AwayTeamScore.Value;
                    setsAgainst += home ? fixture.AwayTeamScore.Value : fixture.HomeTeamScore.Value;
                }

                if (standing.Played != played || standing.SetsFor != setsFor || standing.SetsAgainst != setsAgainst)
                    anomalies.Add($"Division '{divisionName}', team '{teamName}': table P/SF/SA = {standing.Played}/{standing.SetsFor}/{standing.SetsAgainst}; fixtures = {played}/{setsFor}/{setsAgainst}.");
            }
        }
        return anomalies;
    }

    public OrderedDictionary<string, List<Fixture>> ParseDivisionFixtures(string fixturesPageHtml)
    {
        ArgumentNullException.ThrowIfNull(fixturesPageHtml);
        var document = new HtmlDocument();
        document.LoadHtml(fixturesPageHtml);
        var elements = document.DocumentNode.SelectNodes(
            "//h3[contains(concat(' ', normalize-space(@class), ' '), ' tt-potm-division-title ')] | " +
            "//div[contains(concat(' ', normalize-space(@class), ' '), ' tt-fixture-week-header ')] | " +
            "//table[contains(concat(' ', normalize-space(@class), ' '), ' tt-fixture-table ')]");
        if (elements is null)
            throw new InvalidOperationException("The fixtures page has no division fixtures.");

        var divisions = new OrderedDictionary<string, List<Fixture>>(StringComparer.OrdinalIgnoreCase);
        List<Fixture>? currentDivision = null;
        string? currentDivisionName = null;
        (DateOnly Start, DateOnly End)? currentWeek = null;
        var divisionHasTable = false;
        var scoredCount = 0;
        var scoredWithPlayers = 0;
        var walkovers = 0;

        foreach (var element in elements)
        {
            if (HasClass(element, "tt-potm-division-title"))
            {
                if (currentWeek is not null)
                    throw new InvalidOperationException("A fixtures week is missing its fixture table.");
                if (currentDivision is not null && !divisionHasTable)
                    throw new InvalidOperationException($"Division '{currentDivisionName}' has no fixture table.");
                var name = NormalizeDivisionName(NormalizeHtmlName(element.InnerText));
                if (string.IsNullOrWhiteSpace(name) || divisions.ContainsKey(name))
                    throw new InvalidOperationException($"Fixtures page contains an empty or duplicate division name '{name}'.");
                currentDivisionName = name;
                currentDivision = [];
                divisions.Add(name, currentDivision);
                currentWeek = null;
                divisionHasTable = false;
                walkovers = 0;
            }
            else if (HasClass(element, "tt-fixture-week-header"))
            {
                if (currentDivision is null || currentWeek is not null)
                    throw new InvalidOperationException("A fixtures week is missing its division or fixture table.");
                var nextElement = element.NextSibling;
                while (nextElement is not null && nextElement.NodeType != HtmlNodeType.Element)
                    nextElement = nextElement.NextSibling;
                if (nextElement is not null && HasClass(nextElement, "tt-fixture-skipped"))
                    continue;
                currentWeek = ParseFixtureWeek(element);
            }
            else
            {
                if (currentDivision is null || currentWeek is null)
                    throw new InvalidOperationException("A fixture table is missing its division or week.");
                var rows = element.SelectNodes("./tbody/tr");
                if (rows is null || rows.Count == 0)
                    throw new InvalidOperationException($"Division '{currentDivisionName}' has an empty fixture table.");
                foreach (var row in rows)
                {
                    if (row.SelectSingleNode(".//*[contains(concat(' ', normalize-space(@class), ' '), ' tt-fixture-badge-void ')]") is not null)
                        continue;
                    var fixture = ParseFixture(row, currentWeek.Value);
                    currentDivision.Add(fixture);
                    if (!fixture.Played)
                        continue;
                    scoredCount++;
                    if (fixture.HomeTeamPlayersScore.Count == 0 && fixture.AwayTeamPlayersScore.Count == 0)
                    {
                        if (++walkovers > 5)
                            throw new InvalidOperationException($"Division '{currentDivisionName}' has more than five scored fixtures without player wins.");
                    }
                    else
                        scoredWithPlayers++;
                }
                divisionHasTable = true;
                currentWeek = null;
            }
        }
        if (currentDivision is null || !divisionHasTable || currentWeek is not null)
            throw new InvalidOperationException("The fixtures page has an incomplete division or week.");
        if (scoredCount > 0 && scoredWithPlayers == 0)
            throw new InvalidOperationException("All scored fixtures on the page are missing player wins.");
        return divisions;
    }

    //
    // Private members
    //

    private static Dictionary<string, int> GetRequiredTableColumnIndexes(string divisionName, IReadOnlyList<string> headers)
    {
        var requiredColumns = new[] { "Team", "P", "SF", "SA", "Pts" };
        var indexes = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        for (var index = 0; index < headers.Count; index++)
            indexes.Add(headers[index], index);

        foreach (var requiredColumn in requiredColumns)
        {
            if (!indexes.ContainsKey(requiredColumn))
                throw new InvalidOperationException($"Division '{divisionName}' is missing the '{requiredColumn}' table header.");
        }

        return indexes;
    }

    private static (DateOnly Start, DateOnly End) ParseFixtureWeek(HtmlNode header)
    {
        var period = header.SelectSingleNode(".//*[contains(concat(' ', normalize-space(@class), ' '), ' tt-fixture-week-period ')]");
        var dates = Regex.Matches(NormalizeHtmlName(period?.InnerText ?? string.Empty), @"\d{1,2}\s+[A-Za-z]+\s+\d{4}");
        if (dates.Count != 2 || !TryParseDate(dates[0].Value, out var start) || !TryParseDate(dates[1].Value, out var end) || end < start)
            throw new InvalidOperationException("A fixture week has an invalid date range.");
        return (start, end);
    }

    private static Fixture ParseFixture(HtmlNode row, (DateOnly Start, DateOnly End) week)
    {
        var dateText = NormalizeText(NormalizeHtmlName(row.SelectSingleNode("./td[contains(concat(' ', normalize-space(@class), ' '), ' tt-fixture-date ')]")?.InnerText ?? string.Empty));
        var dates = new List<DateOnly>();
        foreach (var year in new[] { week.Start.Year, week.End.Year }.Distinct())
        {
            if (DateTime.TryParseExact($"{dateText} {year}", ["ddd d MMM yyyy", "ddd dd MMM yyyy", "ddd d MMMM yyyy", "ddd dd MMMM yyyy"], CultureInfo.InvariantCulture, DateTimeStyles.None, out var value))
            {
                var date = DateOnly.FromDateTime(value);
                if (date >= week.Start && date <= week.End)
                    dates.Add(date);
            }
        }
        if (dates.Count != 1)
            throw new InvalidOperationException($"Fixture date '{dateText}' cannot be unambiguously resolved within its week.");

        var teams = row.SelectNodes("./td[contains(concat(' ', normalize-space(@class), ' '), ' tt-fixture-teamcell ')]");
        if (teams is null || teams.Count != 2)
            throw new InvalidOperationException("A fixture must contain exactly two team cells.");
        var homeName = FixtureTeamName(teams[0]);
        var awayName = FixtureTeamName(teams[1]);
        if (string.Equals(homeName, awayName, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("A fixture cannot have the same team on both sides.");
        var scoreCell = row.SelectSingleNode("./td[contains(concat(' ', normalize-space(@class), ' '), ' tt-fixture-score ')]")
            ?? throw new InvalidOperationException("A fixture is missing its score cell.");
        var scoreNode = scoreCell.SelectSingleNode(".//*[contains(concat(' ', normalize-space(@class), ' '), ' tt-result-score-text ')]");
        var homePlayers = ParseFixturePlayers(teams[0], "tt-fixture-scorecard-home");
        var awayPlayers = ParseFixturePlayers(teams[1], "tt-fixture-scorecard-away");
        if (scoreNode is null)
        {
            var scoreText = NormalizeHtmlName(scoreCell.InnerText);
            if (!string.Equals(scoreText, "vs", StringComparison.OrdinalIgnoreCase) &&
                scoreCell.SelectSingleNode(".//*[contains(concat(' ', normalize-space(@class), ' '), ' tt-fixture-badge-postponed ') or contains(concat(' ', normalize-space(@class), ' '), ' tt-fixture-badge-rearranged ')]") is null)
                throw new InvalidOperationException($"Fixture '{homeName}' versus '{awayName}' has an unrecognized score '{scoreText}'.");
            if (homePlayers.Present || awayPlayers.Present)
                throw new InvalidOperationException("An unplayed fixture has player scores.");
            return new Fixture(dates[0], false, homeName, awayName, null, null, [], []);
        }
        var match = Regex.Match(NormalizeHtmlName(scoreNode.InnerText), @"^(\d+)\s*[-–]\s*(\d+)$");
        if (!match.Success || !int.TryParse(match.Groups[1].Value, out var homeScore) || !int.TryParse(match.Groups[2].Value, out var awayScore) || homeScore + awayScore != 10)
            throw new InvalidOperationException($"Fixture '{homeName}' versus '{awayName}' has an invalid match score.");
        if (homePlayers.Present != awayPlayers.Present)
            throw new InvalidOperationException("A scored fixture has a player list for only one team.");
        if (homePlayers.Forfeits > 1 || awayPlayers.Forfeits > 1 || homePlayers.Forfeits + awayPlayers.Forfeits > 1)
            throw new InvalidOperationException("A fixture with multiple forfeits cannot be interpreted unambiguously.");
        if (homePlayers.Present && homePlayers.Players.Sum(player => player.Won) + awayPlayers.Players.Sum(player => player.Won) != 9)
            throw new InvalidOperationException("A scored fixture must account for nine singles wins.");
        if (homePlayers.Present)
        {
            if (homePlayers.Players.Count + homePlayers.Forfeits != 3 || awayPlayers.Players.Count + awayPlayers.Forfeits != 3)
                throw new InvalidOperationException("Each scorecard must contain three players including forfeits.");
            var homeSingles = homePlayers.Players.Sum(player => player.Won);
            var awaySingles = awayPlayers.Players.Sum(player => player.Won);
            if (homeScore - homeSingles is < 0 or > 1 || awayScore - awaySingles is < 0 or > 1 ||
                homeScore - homeSingles + awayScore - awaySingles != 1)
                throw new InvalidOperationException("Player wins do not match the team scores and one doubles point.");
        }
        var home = AdjustFixturePlayers(homePlayers.Players, awayPlayers.Players.Count, awayPlayers.Forfeits);
        var away = AdjustFixturePlayers(awayPlayers.Players, homePlayers.Players.Count, homePlayers.Forfeits);
        return new Fixture(dates[0], true, homeName, awayName, homeScore, awayScore, home, away);
    }

    private static string FixtureTeamName(HtmlNode cell)
    {
        var name = NormalizeHtmlName(cell.SelectSingleNode(".//a[contains(concat(' ', normalize-space(@class), ' '), ' tt-team-link ')]")?.InnerText ?? string.Empty);
        return name.Length > 0 ? name : throw new InvalidOperationException("A fixture has an empty team name.");
    }

    private static (bool Present, int Forfeits, List<(string Name, int Won)> Players) ParseFixturePlayers(HtmlNode cell, string className)
    {
        var list = cell.SelectSingleNode($".//ul[contains(concat(' ', normalize-space(@class), ' '), ' {className} ')]");
        if (list is null)
            return (false, 0, []);
        var rows = list.SelectNodes("./li[contains(concat(' ', normalize-space(@class), ' '), ' tt-fixture-scorecard-player ')]");
        if (rows is null || rows.Count == 0)
            throw new InvalidOperationException("A fixture player list is empty.");
        var players = new List<(string Name, int Won)>();
        var playerNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var forfeits = 0;
        foreach (var player in rows)
        {
            var rawScore = NormalizeHtmlName(player.SelectSingleNode(".//*[contains(concat(' ', normalize-space(@class), ' '), ' tt-fixture-scorecard-score ')]")?.InnerText ?? string.Empty);
            if (!int.TryParse(rawScore, NumberStyles.None, CultureInfo.InvariantCulture, out var won) || won is < 0 or > 3)
                throw new InvalidOperationException("A fixture player has an invalid win count.");
            var forfeit = player.SelectSingleNode(".//*[contains(concat(' ', normalize-space(@class), ' '), ' tt-fixture-scorecard-forfeit ')]");
            var name = NormalizeText(NormalizeHtmlName(player.SelectSingleNode(".//a[contains(concat(' ', normalize-space(@class), ' '), ' tt-player-link ')]")?.InnerText ?? string.Empty));
            if (forfeit is not null || string.Equals(name, "Forfeit", StringComparison.OrdinalIgnoreCase))
            {
                if (won != 0)
                    throw new InvalidOperationException("A forfeiting player has nonzero wins.");
                forfeits++;
            }
            else if (name.Length == 0)
                throw new InvalidOperationException("A fixture player has no name.");
            else if (!playerNames.Add(name))
                throw new InvalidOperationException($"A fixture player list contains the duplicate name '{name}'.");
            else
                players.Add((name, won));
        }
        return (true, forfeits, players);
    }

    private static IReadOnlyList<PlayerScore> AdjustFixturePlayers(List<(string Name, int Won)> players, int opponentsPlayed, int opposingForfeits)
    {
        if (players.Any(player => player.Won < opposingForfeits || player.Won > opponentsPlayed + opposingForfeits || player.Won - opposingForfeits > opponentsPlayed))
            throw new InvalidOperationException("A forfeit adjustment would produce negative player wins.");
        return players.Select(player => new PlayerScore(player.Name, player.Won - opposingForfeits, opponentsPlayed)).ToArray();
    }

    private static int ParseTableInteger(HtmlNode cell, string divisionName, int rowNumber, string valueName)
    {
        var value = NormalizeHtmlName(cell.InnerText);
        if (!int.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out var parsedValue))
            throw new InvalidOperationException($"Division '{divisionName}' row {rowNumber} has an invalid {valueName} value.");

        return parsedValue;
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

    private static OrderedDictionary<string, Player> ParsePlayerGroup(IEnumerable<JsonElement> entries, string teamContext,
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

            playerName = NormalizeText(playerName);
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

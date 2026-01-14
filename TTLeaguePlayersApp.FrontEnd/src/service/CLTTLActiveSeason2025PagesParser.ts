export interface Fixture {
    startDate: Date;
    venue: string;
    homeTeam: string;
    homeTeamPlayers: string[];
    awayTeam: string;
    awayTeamPlayers: string[];
    isCompleted: boolean;
}

export class CLTTLActiveSeason2025PagesParser {
    /**
     * Extracts the list of team names by parsing the division table's HTML page.
     * @param tableHtmlPage The HTML content of the division table page.
     * @returns An array of team names.
     */
    public getTeams(tableHtmlPage: string): string[] {
        const parser = new DOMParser();
        const doc = parser.parseFromString(tableHtmlPage, 'text/html');
        const tableDiv = doc.getElementById('Tables');

        if (!tableDiv) {
            return [];
        }

        const teamCells = tableDiv.querySelectorAll('td.teamName');
        const teams: string[] = [];

        teamCells.forEach((cell) => {
            // Look for span.visible-xs, if not found try span.hidden-xs
            let span = cell.querySelector('span.visible-xs');
            span ??= cell.querySelector('span.hidden-xs');

            if (span) {
                const anchor = span.querySelector('a');
                if (anchor?.textContent) {
                    teams.push(anchor.textContent.trim());
                }
            }
        });

        return teams;
    }

    public getTeamFixtures(fixturesHtmlPage: string): Fixture[] {
        const parser = new DOMParser();
        const doc = parser.parseFromString(fixturesHtmlPage, 'text/html');
        // Search inside the fixturesHtmsPage all the fixtures inside the element <div id="Fixtures" class="fixtures divStyle">
        const fixturesDiv = doc.getElementById('Fixtures');

        if (!fixturesDiv) {
            return [];
        }

        // Changed from .fixture.complete to .fixture to include unplayed fixtures
        const fixtureElements = fixturesDiv.querySelectorAll('.fixture');
        const fixtures: Fixture[] = [];

        fixtureElements.forEach((fixtureEl) => {
            // inside <div class="date" itemprop="startDate"> you find info on the fixture start date and time
            const dateEl = fixtureEl.querySelector('.date[itemprop="startDate"]');

            const timeTag = dateEl?.querySelector('time');
            let startDate = new Date();
            if (dateEl && timeTag) {
                const dateStr = timeTag.getAttribute('datetime'); // "2025-09-29"
                const fullText = dateEl.textContent;
                const timeMatch = fullText ? /(\d{2}:\d{2})/.exec(fullText) : null;

                if (dateStr && timeMatch) {
                    startDate = new Date(`${dateStr}T${timeMatch[1]}`);
                } else if (dateStr) {
                    startDate = new Date(dateStr);
                }
            }

            // then you find the <venueName> string
            const venueEl = fixtureEl.querySelector('.venue span a') ?? fixtureEl.querySelector('.venue span');
            const venue = (venueEl?.textContent ?? '').trim();

            // then insid <div class="homeTeam"> you find the name of the <homeTeam>
            const homeTeamDiv = fixtureEl.querySelector('.homeTeam');
            const homeTeamEl = homeTeamDiv?.querySelector('.teamName span a') ?? homeTeamDiv?.querySelector('.teamName');
            const homeTeam = (homeTeamEl?.textContent ?? '').trim();

            const homePlayerEls = homeTeamDiv?.querySelectorAll('.playerName span a');
            const homeTeamPlayers: string[] = [];
            if (homePlayerEls && homePlayerEls.length > 0) {
                homePlayerEls.forEach(el => {
                    const text = (el.textContent).trim();
                    if (text) homeTeamPlayers.push(text);
                });
            } else {
                const spans = homeTeamDiv?.querySelectorAll('.playerName span');
                spans?.forEach(el => {
                    const text = (el.textContent).trim();
                    if (text) homeTeamPlayers.push(text);
                });
            }

            // then insid <div class="awayTeam"> you find the name of the <awayTeam>
            const awayTeamDiv = fixtureEl.querySelector('.awayTeam');
            const awayTeamEl = awayTeamDiv?.querySelector('.teamName span a') ?? awayTeamDiv?.querySelector('.teamName');
            const awayTeam = (awayTeamEl?.textContent ?? '').trim();

            const awayPlayerEls = awayTeamDiv?.querySelectorAll('.playerName span a');
            const awayTeamPlayers: string[] = [];
            if (awayPlayerEls && awayPlayerEls.length > 0) {
                awayPlayerEls.forEach(el => {
                    const text = (el.textContent).trim();
                    if (text) awayTeamPlayers.push(text);
                });
            } else {
                const spans = awayTeamDiv?.querySelectorAll('.playerName span');
                spans?.forEach(el => {
                    const text = (el.textContent).trim();
                    if (text) awayTeamPlayers.push(text);
                });
            }

            const isCompleted = fixtureEl.classList.contains('complete');

            fixtures.push({
                startDate,
                venue,
                homeTeam,
                homeTeamPlayers,
                awayTeam,
                awayTeamPlayers,
                isCompleted
            });

        });

        return fixtures;
    }

    public getTeamPlayers(playersHtmlPage: string): string[] {
        const parser = new DOMParser();
        const doc = parser.parseFromString(playersHtmlPage, 'text/html');
        const averagesDiv = doc.getElementById('Averages');

        if (!averagesDiv) {
            return [];
        }

        const playerLinks = averagesDiv.querySelectorAll('a[title="View player statistics"]');
        const players: string[] = [];

        playerLinks.forEach((link) => {
            const name = (link.textContent).trim();
            if (name) {
                players.push(name);
            }
        });

        return players;
    }

    public getTeamIds(allPlayersHtmlPage: string): { team: string; id: number }[] {
        const parser = new DOMParser();
        const doc = parser.parseFromString(allPlayersHtmlPage, 'text/html');
        const teamSelect = doc.querySelector('select#t');

        if (!teamSelect) {
            return [];
        }

        const options = teamSelect.querySelectorAll('option');
        const teamIds: { team: string; id: number }[] = [];

        options.forEach((option) => {
            const idValue = option.getAttribute('value');
            if (idValue && idValue !== '') {
                teamIds.push({
                    team: (option.textContent).trim(),
                    id: parseInt(idValue, 10)
                });
            }
        });

        return teamIds;
    }
}

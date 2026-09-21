import type { ClubTeamWithDivision } from '../../../types/clubTeam';

/**
 * One row of the league site's fixtures page in its Simple view (`&vm=2`).
 *
 * That view carries the date, time, the two teams and the venue — no players, no score, no
 * completion state — and it is the only division-wide view small enough for the CORS proxy. Nothing
 * in the app read the players or the completion flag, so the shape is deliberately these four.
 *
 * `startDateTime` is the page's wall-clock time labelled as UTC ("19:30" -> "T19:30:00Z"): it is
 * the key under which kudos are stored, so this reading must never change.
 */
export interface Fixture {
    startDateTime: Date;
    venue: string;
    homeTeam: string;
    awayTeam: string;
}

const MONTHS: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
};

/**
 * The fixtures page prints dates without a year ("Mon 29 Sep"). A season runs from the autumn of
 * one year into the spring of the next, so the year is the season's first year from August to
 * December and its second year from January to July.
 */
function yearFor(month: string, seasonStartYear: number): number {
    return parseInt(month, 10) >= 8 ? seasonStartYear : seasonStartYear + 1;
}

export class CLTTLActiveSeason2025PagesParser {
    /**
     * Extracts the list of team names by parsing the division table's HTML page, in table order.
     * @param tableHtmlPage The HTML content of the division table page.
     * @returns An array of team names.
     */
    public getTeams(tableHtmlPage: string): string[] {
        const parser = new DOMParser();
        const doc = parser.parseFromString(tableHtmlPage, 'text/html');
        const table = doc.querySelector('table.tt-league-table');

        if (!table) {
            return [];
        }

        const teams: string[] = [];
        table.querySelectorAll('tbody tr td.tt-table-col-team a.tt-team-link').forEach((anchor) => {
            const name = anchor.textContent.trim();
            if (name) {
                teams.push(name);
            }
        });

        return teams;
    }

    /**
     * Extracts every fixture of the division from the fixtures page in its Simple view (`&vm=2`).
     *
     * The page is one table per week; each row is date | time | home | away | venue. The date cell
     * reads "Mon 29 Sep" and may also carry a badge ("R" rearranged, "P" postponed, "V" void);
     * only the "DD Mon" part is read, so the day name and any badge letter are ignored.
     */
    public getTeamFixtures(fixturesHtmlPage: string): Fixture[] {
        const parser = new DOMParser();
        const doc = parser.parseFromString(fixturesHtmlPage, 'text/html');

        if (!doc.querySelector('table.tt-fixture-table')) {
            return [];
        }

        // The page names its own season ("Winter 2025-26"); its first year dates the fixtures.
        const seasonName = doc.querySelector('input[name="leagueName"]')?.getAttribute('value') ?? '';
        const seasonMatch = /(\d{4})/.exec(seasonName);
        const seasonStartYear = seasonMatch ? parseInt(seasonMatch[1], 10) : new Date().getFullYear();

        const fixtures: Fixture[] = [];

        doc.querySelectorAll('table.tt-fixture-table tbody tr').forEach((row) => {
            const dateText = (row.querySelector('td.tt-fixture-date')?.textContent ?? '').trim();
            const timeText = (row.querySelector('td.tt-fixture-time')?.textContent ?? '').trim();

            const dateMatch = /(\d{1,2}) ([A-Za-z]{3})/.exec(dateText);
            const timeMatch = /(\d{2}):(\d{2})/.exec(timeText);
            const month = dateMatch ? MONTHS[dateMatch[2].toLowerCase()] : undefined;

            let startDateTime = new Date();
            if (dateMatch && month && timeMatch) {
                const day = dateMatch[1].padStart(2, '0');
                const year = yearFor(month, seasonStartYear);
                startDateTime = new Date(`${String(year)}-${month}-${day}T${timeMatch[1]}:${timeMatch[2]}:00Z`);
            }

            const teamLinks = row.querySelectorAll('a.tt-team-link');
            const homeTeam = teamLinks.length > 0 ? teamLinks[0].textContent.trim() : '';
            const awayTeam = teamLinks.length > 1 ? teamLinks[1].textContent.trim() : '';

            const venue = (row.querySelector('td.tt-fixture-venue')?.textContent ?? '').trim();

            fixtures.push({ startDateTime, venue, homeTeam, awayTeam });
        });

        return fixtures;
    }

    /**
     * Extracts the players listed on the division's averages page filtered to one team (`&t=<id>`).
     * A team with no averages yet gets a page without the table, hence `[]`.
     */
    public getTeamPlayers(playersHtmlPage: string): string[] {
        const parser = new DOMParser();
        const doc = parser.parseFromString(playersHtmlPage, 'text/html');
        const table = doc.querySelector('table.tt-averages-table');

        if (!table) {
            return [];
        }

        const players: string[] = [];
        table.querySelectorAll('td.tt-averages-col-player a.tt-player-link').forEach((link) => {
            const name = link.textContent.trim();
            if (name) {
                players.push(name);
            }
        });

        return players;
    }

    /**
     * Extracts the teams of a club, each with its division, from the club's page.
     * Every row of the Teams table is returned: the page shows the season the site considers
     * current, and its League column is not used to filter.
     *
     * The division is a column of that table, already spelled as the app spells it
     * ("Premier", "Division 4"), so it is taken verbatim.
     */
    public getClubTeams(clubHtmlPage: string): ClubTeamWithDivision[] {
        const parser = new DOMParser();
        const doc = parser.parseFromString(clubHtmlPage, 'text/html');
        const table = doc.querySelector('table.tt-contact-table');

        if (!table) {
            return [];
        }

        const teams: ClubTeamWithDivision[] = [];

        table.querySelectorAll('tbody tr').forEach((row) => {
            // League | Division | Team | Captain
            const cells = row.querySelectorAll('td');
            const team = cells.length > 2 ? cells[2].textContent.trim() : '';

            if (team) {
                teams.push({
                    team_name: team,
                    team_division: cells[1].textContent.trim()
                });
            }
        });

        return teams;
    }

    /**
     * Extracts the team ids from the team filter of the division's averages page. The select lists
     * only that division's teams; the empty "All Teams" option is skipped.
     */
    public getTeamIds(allPlayersHtmlPage: string): { team: string; id: number }[] {
        const parser = new DOMParser();
        const doc = parser.parseFromString(allPlayersHtmlPage, 'text/html');
        const teamSelect = doc.querySelector('select#filterTeam');

        if (!teamSelect) {
            return [];
        }

        const teamIds: { team: string; id: number }[] = [];

        teamSelect.querySelectorAll('option').forEach((option) => {
            const idValue = option.getAttribute('value');
            if (idValue && /^\d+$/.test(idValue)) {
                teamIds.push({
                    team: option.textContent.trim(),
                    id: parseInt(idValue, 10)
                });
            }
        });

        return teamIds;
    }

}

import type { ClubTeamWithDivision } from '../../../types/clubTeam';

const DIVISION_WORDS: Record<string, string> = {
    one: '1',
    two: '2',
    three: '3',
    four: '4',
    five: '5',
    six: '6',
    seven: '7',
};

function normalizeDivision(division: string): string {
    const match = /^Division\s+([a-z]+)$/i.exec(division);
    if (!match) {
        return division;
    }

    const number = DIVISION_WORDS[match[1].toLowerCase()];
    return number ? `Division ${number}` : division;
}

export class CLTTLManagedClub2026PagesParser {
    /**
     * Every row of the Teams table is returned: the page shows the season the site considers
     * current, and its League column is not used to filter.
     *
     * Word-form division numbers are normalized to the numeric labels used by the app.
     */
    public getClubTeams(clubHtmlPage: string): ClubTeamWithDivision[] {
        const parser = new DOMParser();
        const doc = parser.parseFromString(clubHtmlPage, 'text/html');
        const table = doc.querySelector('table.tt-contact-table');

        if (!table) {
            throw new Error('Club teams table missing');
        }

        const teams: ClubTeamWithDivision[] = [];

        const rows = table.querySelectorAll('tbody tr');
        rows.forEach((row) => {
            // League | Division | Team | Captain
            const cells = row.querySelectorAll('td');
            const team = cells.length > 2 ? cells[2].textContent.trim() : '';

            if (team) {
                teams.push({
                    team_name: team,
                    team_division: normalizeDivision(cells[1].textContent.trim())
                });
            }
        });

        if (rows.length > 0 && teams.length === 0) {
            throw new Error('No usable club team rows');
        }
        return teams;
    }
}

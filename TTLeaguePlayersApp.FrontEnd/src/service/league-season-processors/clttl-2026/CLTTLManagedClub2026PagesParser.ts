import type { ClubTeamWithDivision } from '../../../types/clubTeam';

export class CLTTLManagedClub2026PagesParser {
    /**
     * Every row of the Teams table is returned: the page shows the season the site considers
     * current, and its League column is not used to filter.
     *
     * Division text is trimmed and returned verbatim; it is not mapped to configured
     * division labels (for example, "Division Four" is not converted to "Division 4").
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
                    team_division: cells[1].textContent.trim()
                });
            }
        });

        if (rows.length > 0 && teams.length === 0) {
            throw new Error('No usable club team rows');
        }
        return teams;
    }
}

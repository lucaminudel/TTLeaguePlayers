import type { ClubTeamWithDivision } from '../../../types/clubTeam';

export class CLTTLManagedClub2025PagesParser {
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
}

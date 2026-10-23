import { describe, it, expect } from 'vitest';
import { CLTTLManagedClub2025PagesParser } from '../../../../../src/service/active-season-processors/clttl-2026/CLTTLManagedClub2025PagesParser';
import fs from 'fs';
import path from 'path';

function readSnapshot(name: string): string {
    return fs.readFileSync(path.resolve(__dirname, 'data', name), 'utf-8');
}

describe('CLTTLManagedClub2025PagesParser', () => {
    it('skips rows with fewer than three cells and whitespace-only team names', () => {
        const parser = new CLTTLManagedClub2025PagesParser();
        const html = `<table class="tt-contact-table"><tbody>
            <tr></tr>
            <tr><td>Winter</td></tr>
            <tr><td>Winter</td><td>Division 1</td></tr>
            <tr><td>Winter</td><td>Division 1</td><td>   </td></tr>
            <tr><td>Winter</td><td>Division 1</td><td>Real Team</td></tr>
        </tbody></table>`;

        expect(parser.getClubTeams(html)).toEqual([{ team_name: 'Real Team', team_division: 'Division 1' }]);
    });

    it('selects the club table and trims names and divisions without filtering league labels', () => {
        const parser = new CLTTLManagedClub2025PagesParser();
        const html = `<table><tbody><tr><td>Other</td><td>Other</td><td>Decoy Team</td></tr></tbody></table>
            <table class="tt-contact-table"><tbody>
                <tr><td>Winter 2025-26</td><td>  Division Four  </td><td>  Older Team  </td></tr>
                <tr><td>Winter 2026-27</td><td>  Premier  </td><td>  Current Team  </td></tr>
            </tbody></table>`;

        expect(parser.getClubTeams(html)).toEqual([
            { team_name: 'Older Team', team_division: 'Division Four' },
            { team_name: 'Current Team', team_division: 'Premier' }
        ]);
    });

    describe('getClubTeams', () => {
        it('should extract every team with its division from a club html page', () => {
            const parser = new CLTTLManagedClub2025PagesParser();
            const teams = parser.getClubTeams(readSnapshot('club_teams_morpeth.html'));

            // Page order and division labels are preserved after trimming. The League column is ignored:
            // the page shows the season the site considers current.
            expect(teams).toHaveLength(12);
            expect(teams).toEqual([
                { team_name: 'Morpeth 1', team_division: 'Premier' },
                { team_name: 'Morpeth 2', team_division: 'Premier' },
                { team_name: 'Morpeth 3', team_division: 'Premier' },
                { team_name: 'Morpeth 5', team_division: 'Division 1' },
                { team_name: 'Morpeth 6', team_division: 'Division 1' },
                { team_name: 'Morpeth 7', team_division: 'Division 1' },
                { team_name: 'Morpeth 8', team_division: 'Division 2' },
                { team_name: 'Morpeth 9', team_division: 'Division 4' },
                { team_name: 'Morpeth 10', team_division: 'Division 4' },
                { team_name: 'Morpeth 11 Jr', team_division: 'Division 4' },
                { team_name: 'Morpeth 12', team_division: 'Division 5' },
                { team_name: 'Morpeth 13 Jr', team_division: 'Division 6' }
            ]);
        });

        it('keeps a team whose division cell is empty, with an empty division', () => {
            // Never seen live. The row is kept because My Club Teams needs every team the club page
            // lists and reads only the name. ClubStandingsList filters these out before calling the
            // standings endpoint; see its "drops a team with no division" test.
            const html = `<html><body><table class="table tt-contact-table"><thead><tr>
                <th>League</th><th>Division</th><th>Team</th><th>Captain</th></tr></thead><tbody>
                <tr><td>Winter 2026-27</td><td></td><td>Odd Team</td><td>Someone</td></tr>
            </tbody></table></body></html>`;

            const parser = new CLTTLManagedClub2025PagesParser();

            expect(parser.getClubTeams(html)).toEqual([
                { team_name: 'Odd Team', team_division: '' }
            ]);
        });

        it('skips a row whose team cell is empty', () => {
            const html = `<html><body><table class="table tt-contact-table"><tbody>
                <tr><td>Winter 2026-27</td><td>Division 1</td><td></td><td>Nobody</td></tr>
                <tr><td>Winter 2026-27</td><td>Division 1</td><td>Real Team</td><td>Someone</td></tr>
            </tbody></table></body></html>`;

            const parser = new CLTTLManagedClub2025PagesParser();

            expect(parser.getClubTeams(html)).toEqual([
                { team_name: 'Real Team', team_division: 'Division 1' }
            ]);
        });

        it('should preserve the team names exactly as the site spells them', () => {
            const parser = new CLTTLManagedClub2025PagesParser();
            const teams = parser.getClubTeams(readSnapshot('club_teams_aa_academy.html'));

            expect(teams).toEqual([
                { team_name: 'AA Academy 1', team_division: 'Premier' },
                { team_name: 'AA Academy 2', team_division: 'Division 2' },
                { team_name: 'AA Academy 3', team_division: 'Division 3' },
                { team_name: 'AA Academy 4', team_division: 'Division 5' }
            ]);
        });

        it('should extract named teams as well as numbered ones', () => {
            const parser = new CLTTLManagedClub2025PagesParser();
            const teams = parser.getClubTeams(readSnapshot('club_teams_walworth.html'));

            expect(teams).toEqual([
                { team_name: 'Walworth Gainsford', team_division: 'Division 2' },
                { team_name: 'Walworth Enigma', team_division: 'Division 3' },
                { team_name: 'Walworth Tigers', team_division: 'Division 3' },
                { team_name: 'Walworth Wonderers', team_division: 'Division 7' }
            ]);
        });

        it('should return empty array if the teams table is missing', () => {
            const parser = new CLTTLManagedClub2025PagesParser();
            const teams = parser.getClubTeams('<html><body></body></html>');
            expect(teams).toEqual([]);
        });
    });
});

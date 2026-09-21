import { describe, it, expect } from 'vitest';
import { CLTTLActiveSeason2025PagesParser } from '../../../../../src/service/active-season-processors/clttl-2025/CLTTLActiveSeason2025PagesParser';
import fs from 'fs';
import path from 'path';

// The html files under data/ are live captures of the league site (2026-09-21, after its
// re-platforming): Division Four of Winter 2025-26 for the division pages, and the club pages
// (which list the season the site considers current, Winter 2026-27 at capture time).
function readSnapshot(name: string): string {
    return fs.readFileSync(path.resolve(__dirname, 'data', name), 'utf-8');
}

describe('CLTTLActiveSeason2025PagesParser', () => {
    describe('getTeams', () => {
        it('should extract team names from division table html', () => {
            const parser = new CLTTLActiveSeason2025PagesParser();
            const teams = parser.getTeams(readSnapshot('division_table.html'));

            // Table order (league position), not alphabetical.
            const expectedTeams = [
                'Flick TTC 2',
                'Fusion 5',
                'Fusion 6 Jr',
                'Highbury 2',
                'Walworth Tigers',
                'Irving 4',
                'Morpeth 9',
                'Highbury 3',
                'Morpeth 10',
                'St Katharines Trust 6',
                'Apex 4'
            ];

            expect(teams).toHaveLength(11);
            expect(teams).toEqual(expectedTeams);
        });

        it('should return empty array if the league table is missing', () => {
            const parser = new CLTTLActiveSeason2025PagesParser();
            const teams = parser.getTeams('<html><body><div>No Tables here</div></body></html>');
            expect(teams).toEqual([]);
        });
    });

    describe('getTeamFixtures', () => {
        it('should extract fixtures from the division fixtures html (Simple view)', () => {
            const parser = new CLTTLActiveSeason2025PagesParser();
            const fixtures = parser.getTeamFixtures(readSnapshot('division_fixtures.html'));

            expect(fixtures.length).toBe(110);

            // First fixture: Fusion 5 v's Morpeth 10. The page shows "Mon 29 Sep" with no year: the
            // year comes from the page's season ("Winter 2025-26"), and the time is kept as the
            // page's wall-clock reading labelled UTC, exactly as the kudos stored so far were keyed.
            const firstFixture = fixtures[0];
            expect(firstFixture).toEqual({
                startDateTime: new Date('2025-09-29T19:30:00Z'),
                venue: 'Fusion',
                homeTeam: 'Fusion 5',
                awayTeam: 'Morpeth 10'
            });

            // A fixture from Week 2 (index 5): Highbury 3 v's Fusion 5
            const week2Fixture = fixtures[5];
            expect(week2Fixture.startDateTime).toEqual(new Date('2025-10-07T19:15:00Z'));
            expect(week2Fixture.venue).toBe('Bridge Academy');
            expect(week2Fixture.homeTeam).toBe('Highbury 3');
            expect(week2Fixture.awayTeam).toBe('Fusion 5');

            // Second to last fixture: Fusion 6 Jr v's Highbury 2 — March, so the year has rolled over
            const secondToLastFixture = fixtures[fixtures.length - 2];
            expect(secondToLastFixture.startDateTime).toEqual(new Date('2026-03-27T19:20:00Z'));
            expect(secondToLastFixture.venue).toBe('Fusion');
            expect(secondToLastFixture.homeTeam).toBe('Fusion 6 Jr');
            expect(secondToLastFixture.awayTeam).toBe('Highbury 2');

            // Last fixture: Highbury 2 v's Flick TTC 2. Its date cell also carries the "R"
            // (rearranged) badge after the date; only the "DD Mon" part is read.
            const lastFixture = fixtures[fixtures.length - 1];
            expect(lastFixture.startDateTime).toEqual(new Date('2026-03-31T19:15:00Z'));
            expect(lastFixture.venue).toBe('Bridge Academy');
            expect(lastFixture.homeTeam).toBe('Highbury 2');
            expect(lastFixture.awayTeam).toBe('Flick TTC 2');
        });

        it('should expose exactly the four Fixture fields', () => {
            const parser = new CLTTLActiveSeason2025PagesParser();
            const fixtures = parser.getTeamFixtures(readSnapshot('division_fixtures.html'));

            // The Simple view carries no players, score or completion state, and nothing in the
            // app reads them: the shape is deliberately date, venue, home team, away team.
            for (const fixture of fixtures) {
                expect(Object.keys(fixture).sort()).toEqual(['awayTeam', 'homeTeam', 'startDateTime', 'venue']);
            }
        });

        it('should infer the year from the season on the page: Aug-Dec first year, Jan-Jul second', () => {
            const html = `<html><body>
                <input type="hidden" name="leagueName" value="Winter 2027-28" />
                <table class="table table-sm tt-fixture-table"><tbody>
                    <tr class=""><td class="tt-fixture-date">Mon 03 Aug</td><td class="tt-fixture-time">18:45</td>
                        <td><a class="tt-team-link">A</a></td><td><a class="tt-team-link">B</a></td><td class="tt-fixture-venue">V</td></tr>
                    <tr class=""><td class="tt-fixture-date">Thu 31 Dec</td><td class="tt-fixture-time">19:00</td>
                        <td><a class="tt-team-link">A</a></td><td><a class="tt-team-link">B</a></td><td class="tt-fixture-venue">V</td></tr>
                    <tr class=""><td class="tt-fixture-date">Fri 01 Jan</td><td class="tt-fixture-time">19:15</td>
                        <td><a class="tt-team-link">A</a></td><td><a class="tt-team-link">B</a></td><td class="tt-fixture-venue">V</td></tr>
                    <tr class=""><td class="tt-fixture-date">Sat 31 Jul</td><td class="tt-fixture-time">19:30</td>
                        <td><a class="tt-team-link">A</a></td><td><a class="tt-team-link">B</a></td><td class="tt-fixture-venue">V</td></tr>
                </tbody></table>
            </body></html>`;

            const parser = new CLTTLActiveSeason2025PagesParser();
            const fixtures = parser.getTeamFixtures(html);

            expect(fixtures.map((f) => f.startDateTime)).toEqual([
                new Date('2027-08-03T18:45:00Z'),
                new Date('2027-12-31T19:00:00Z'),
                new Date('2028-01-01T19:15:00Z'),
                new Date('2028-07-31T19:30:00Z')
            ]);
        });

        it('should return empty array if the fixtures table is missing', () => {
            const parser = new CLTTLActiveSeason2025PagesParser();
            const fixtures = parser.getTeamFixtures('<html><body><div>No Fixtures here</div></body></html>');
            expect(fixtures).toEqual([]);
        });
    });

    describe('getTeamPlayers', () => {
        it('should extract players from team players html', () => {
            const parser = new CLTTLActiveSeason2025PagesParser();
            const players = parser.getTeamPlayers(readSnapshot('division_team_players.html'));

            // Spelled exactly as the site spells them ("de Giovanni", lower-case particle).
            expect(players.length).toBe(7);
            expect(players).toEqual([
                'Katrina Yiwen Sun',
                'Ke Xin Li',
                'Kevin Ji',
                'Luca Minudel',
                'Suzy Song',
                'Michele de Giovanni',
                'Dave Mesfin'
            ]);
        });

        it('should return empty array if the averages table is missing', () => {
            // What the site serves for a team with no averages yet: the filters, no table.
            const parser = new CLTTLActiveSeason2025PagesParser();
            const players = parser.getTeamPlayers('<html><body><select id="filterTeam"></select></body></html>');
            expect(players).toEqual([]);
        });
    });

    describe('getTeamIds', () => {
        it('should extract team names and IDs from the division averages html', () => {
            const parser = new CLTTLActiveSeason2025PagesParser();
            const teamIds = parser.getTeamIds(readSnapshot('division_all_players.html'));

            // Select order (alphabetical), scoped to the division. The empty "All Teams" option is skipped.
            expect(teamIds.length).toBe(11);
            expect(teamIds).toEqual([
                { team: 'Apex 4', id: 73246 },
                { team: 'Flick TTC 2', id: 73248 },
                { team: 'Fusion 5', id: 73149 },
                { team: 'Fusion 6 Jr', id: 73150 },
                { team: 'Highbury 2', id: 73245 },
                { team: 'Highbury 3', id: 73216 },
                { team: 'Irving 4', id: 73247 },
                { team: 'Morpeth 10', id: 73142 },
                { team: 'Morpeth 9', id: 73141 },
                { team: 'St Katharines Trust 6', id: 73160 },
                { team: 'Walworth Tigers', id: 73249 }
            ]);
        });

        it('should return empty array if the team select is missing', () => {
            const parser = new CLTTLActiveSeason2025PagesParser();
            const teamIds = parser.getTeamIds('<html><body></body></html>');
            expect(teamIds).toEqual([]);
        });
    });

    describe('getClubTeams', () => {
        it('should extract every team with its division from a club html page', () => {
            const parser = new CLTTLActiveSeason2025PagesParser();
            const teams = parser.getClubTeams(readSnapshot('club_teams_morpeth.html'));

            // Page order. The division is a column of the Teams table, spelled as the app spells it
            // ("Premier", "Division 4"), so no transform is applied. The League column is ignored:
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

            const parser = new CLTTLActiveSeason2025PagesParser();

            expect(parser.getClubTeams(html)).toEqual([
                { team_name: 'Odd Team', team_division: '' }
            ]);
        });

        it('skips a row whose team cell is empty', () => {
            const html = `<html><body><table class="table tt-contact-table"><tbody>
                <tr><td>Winter 2026-27</td><td>Division 1</td><td></td><td>Nobody</td></tr>
                <tr><td>Winter 2026-27</td><td>Division 1</td><td>Real Team</td><td>Someone</td></tr>
            </tbody></table></body></html>`;

            const parser = new CLTTLActiveSeason2025PagesParser();

            expect(parser.getClubTeams(html)).toEqual([
                { team_name: 'Real Team', team_division: 'Division 1' }
            ]);
        });

        it('should preserve the team names exactly as the site spells them', () => {
            const parser = new CLTTLActiveSeason2025PagesParser();
            const teams = parser.getClubTeams(readSnapshot('club_teams_aa_academy.html'));

            expect(teams).toEqual([
                { team_name: 'AA Academy 1', team_division: 'Premier' },
                { team_name: 'AA Academy 2', team_division: 'Division 2' },
                { team_name: 'AA Academy 3', team_division: 'Division 3' },
                { team_name: 'AA Academy 4', team_division: 'Division 5' }
            ]);
        });

        it('should extract named teams as well as numbered ones', () => {
            const parser = new CLTTLActiveSeason2025PagesParser();
            const teams = parser.getClubTeams(readSnapshot('club_teams_walworth.html'));

            expect(teams).toEqual([
                { team_name: 'Walworth Gainsford', team_division: 'Division 2' },
                { team_name: 'Walworth Enigma', team_division: 'Division 3' },
                { team_name: 'Walworth Tigers', team_division: 'Division 3' },
                { team_name: 'Walworth Wonderers', team_division: 'Division 7' }
            ]);
        });

        it('should return empty array if the teams table is missing', () => {
            const parser = new CLTTLActiveSeason2025PagesParser();
            const teams = parser.getClubTeams('<html><body></body></html>');
            expect(teams).toEqual([]);
        });
    });
});

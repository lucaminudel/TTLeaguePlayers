import { describe, it, expect } from 'vitest';
import { CLTTLActiveSeason2025PagesParser } from '../../../../../src/service/active-season-processors/clttl-2025/CLTTLActiveSeason2025PagesParser';
import fs from 'fs';
import path from 'path';

describe('CLTTLActiveSeason2025PagesParser', () => {
    describe('getTeams', () => {
        it('should extract team names from division table html', () => {
            const filePath = path.resolve(__dirname, 'data/division_table.html');
            const htmlContent = fs.readFileSync(filePath, 'utf-8');

            const parser = new CLTTLActiveSeason2025PagesParser();
            const teams = parser.getTeams(htmlContent);

            const expectedTeams = [
                'Flick TTC 2',
                'Fusion 5',
                'Fusion 6 Jr',
                'Irving 4',
                'Highbury 2',
                'Highbury 3',
                'Walworth Tigers',
                'Morpeth 10',
                'St Katharines 6',
                'Morpeth 9',
                'Apex 4'
            ];

            expect(teams).toHaveLength(11);
            expect(teams).toEqual(expectedTeams);
        });

        it('should return empty array if Table div is missing', () => {
            const parser = new CLTTLActiveSeason2025PagesParser();
            const teams = parser.getTeams('<html><body><div>No Tables here</div></body></html>');
            expect(teams).toEqual([]);
        });
    });

    describe('getTeamFixtures', () => {
        it('should extract fixtures from division fixtures html', () => {
            const filePath = path.resolve(__dirname, 'data/division_fixtures.html');
            const htmlContent = fs.readFileSync(filePath, 'utf-8');

            const parser = new CLTTLActiveSeason2025PagesParser();
            const fixtures = parser.getTeamFixtures(htmlContent);

            expect(fixtures.length).toBe(110);

            // First fixture: Fusion 5 v's Morpeth 10
            const firstFixture = fixtures[0];
            expect(firstFixture.startDateTime).toEqual(new Date('2025-09-29T19:30:00Z'));
            expect(firstFixture.venue).toBe('Fusion');
            expect(firstFixture.homeTeam).toBe('Fusion 5');
            expect(firstFixture.homeTeamPlayers).toEqual(['Yufeng Qiu', 'Charlie Boom', 'Stephen Odili']);
            expect(firstFixture.awayTeam).toBe('Morpeth 10');
            expect(firstFixture.awayTeamPlayers).toEqual(['Michele De Giovanni', 'Luca Minudel', 'Dave Mesfin']);
            expect(firstFixture.isCompleted).toBe(true);

            // A fixture from Week 2 (index 5): Highbury 3 v's Fusion 5
            const week2Fixture = fixtures[5];
            expect(week2Fixture.startDateTime).toEqual(new Date('2025-10-07T19:15:00Z'));
            expect(week2Fixture.venue).toBe('Bridge Academy');
            expect(week2Fixture.homeTeam).toBe('Highbury 3');
            expect(week2Fixture.homeTeamPlayers).toEqual(['Oscar Wallentin', 'Marcin Szymanski', 'Gustav Roedstroem']);
            expect(week2Fixture.awayTeam).toBe('Fusion 5');
            expect(week2Fixture.awayTeamPlayers).toEqual(['Shan Jiang', 'Charlie Boom', 'David Cole']);
            expect(week2Fixture.isCompleted).toBe(true);

            // Second to last fixture: Irving 4 v's Morpeth 10 from Week 26
            const secondToLastFixture = fixtures[fixtures.length - 2];
            expect(secondToLastFixture.startDateTime).toEqual(new Date('2026-03-24T19:00:00Z'));
            expect(secondToLastFixture.venue).toBe('All Saints, New Cross');
            expect(secondToLastFixture.homeTeam).toBe('Irving 4');
            expect(secondToLastFixture.homeTeamPlayers).toEqual([]); // unplayed
            expect(secondToLastFixture.awayTeam).toBe('Morpeth 10');
            expect(secondToLastFixture.awayTeamPlayers).toEqual([]); // unplayed
            expect(secondToLastFixture.isCompleted).toBe(false);

            // Last fixture: Fusion 6 Jr v's Highbury 2 from Week 26
            const lastFixture = fixtures[fixtures.length - 1];
            expect(lastFixture.startDateTime).toEqual(new Date('2026-03-27T18:30:00Z'));
            expect(lastFixture.venue).toBe('Fusion');
            expect(lastFixture.homeTeam).toBe('Fusion 6 Jr');
            expect(lastFixture.homeTeamPlayers).toEqual([]); // unplayed
            expect(lastFixture.awayTeam).toBe('Highbury 2');
            expect(lastFixture.awayTeamPlayers).toEqual([]); // unplayed
            expect(lastFixture.isCompleted).toBe(false);
        });

        it('should return empty array if Fixtures div is missing', () => {
            const parser = new CLTTLActiveSeason2025PagesParser();
            const fixtures = parser.getTeamFixtures('<html><body><div>No Fixtures here</div></body></html>');
            expect(fixtures).toEqual([]);
        });
    });

    describe('getTeamPlayers', () => {
        it('should extract players from team players html', () => {
            const filePath = path.resolve(__dirname, 'data/division_team_players.html');
            const htmlContent = fs.readFileSync(filePath, 'utf-8');

            const parser = new CLTTLActiveSeason2025PagesParser();
            const players = parser.getTeamPlayers(htmlContent);

            expect(players.length).toBe(6);
            expect(players).toEqual([
                'Ke Xin Li',
                'Kevin Ji',
                'Luca Minudel',
                'Suzy Song',
                'Michele De Giovanni',
                'Dave Mesfin'
            ]);
        });

        it('should return empty array if Averages div is missing', () => {
            const parser = new CLTTLActiveSeason2025PagesParser();
            const players = parser.getTeamPlayers('<html><body></body></html>');
            expect(players).toEqual([]);
        });
    });

    describe('getTeamIds', () => {
        it('should extract team names and IDs from all players html', () => {
            const filePath = path.resolve(__dirname, 'data/division_all_players.html');
            const htmlContent = fs.readFileSync(filePath, 'utf-8');

            const parser = new CLTTLActiveSeason2025PagesParser();
            const teamIds = parser.getTeamIds(htmlContent);

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

        it('should return empty array if t select is missing', () => {
            const parser = new CLTTLActiveSeason2025PagesParser();
            const teamIds = parser.getTeamIds('<html><body></body></html>');
            expect(teamIds).toEqual([]);
        });
    });

    describe('getClubTeams', () => {
        it('should extract every team name from a club html page', () => {
            const filePath = path.resolve(__dirname, 'data/club_teams_morpeth.html');
            const htmlContent = fs.readFileSync(filePath, 'utf-8');

            const parser = new CLTTLActiveSeason2025PagesParser();
            const teams = parser.getClubTeams(htmlContent);

            // Morpeth is the widest fixture available: its 12 teams span FOUR different division
            // slugs, so this single assertion covers the number-word map for One, Two, Four and
            // Five at once. The divisions come from the team links' hrefs, not from any column.
            expect(teams).toHaveLength(12);
            expect(teams).toEqual([
                { team_name: 'Morpeth 1', team_division: 'Division 1' },
                { team_name: 'Morpeth 10', team_division: 'Division 4' },
                { team_name: 'Morpeth 11', team_division: 'Division 5' },
                { team_name: 'Morpeth 12 Jr', team_division: 'Division 5' },
                { team_name: 'Morpeth 2', team_division: 'Division 1' },
                { team_name: 'Morpeth 3', team_division: 'Division 1' },
                { team_name: 'Morpeth 4', team_division: 'Division 1' },
                { team_name: 'Morpeth 5', team_division: 'Division 1' },
                { team_name: 'Morpeth 6', team_division: 'Division 1' },
                { team_name: 'Morpeth 7', team_division: 'Division 2' },
                { team_name: 'Morpeth 8', team_division: 'Division 2' },
                { team_name: 'Morpeth 9', team_division: 'Division 4' }
            ]);
        });

        // The transform is UNCONDITIONAL — no test for whether a slug "looks like" it needs
        // converting, and no failure branch. These pin both halves of that: a slug with a number
        // word becomes a digit, and one without simply passes through capitalised.
        it.each([
            ['Division_Four', 'Division 4'],
            ['Division_One', 'Division 1'],
            ['Division_Nine', 'Division 9'],
            ['Division_Premier', 'Division Premier'],
            ['division_one', 'Division 1'],
            ['Division_Two_A', 'Division 2 A'],
            ['Premier', 'Premier']
        ])('turns the division slug %s into %s', (slug, expected) => {
            const html = `<html><body><div id="TeamsList"><table><tbody><tr><td>
                <a href="/CentralLondon/Results/Team/Statistics/Winter_2025-26/${slug}/Some_Team">Some Team</a>
            </td></tr></tbody></table></div></body></html>`;

            const parser = new CLTTLActiveSeason2025PagesParser();

            expect(parser.getClubTeams(html)).toEqual([
                { team_name: 'Some Team', team_division: expected }
            ]);
        });

        it('keeps a team whose link carries no division, with an empty division', () => {
            // Never seen live — all 85 team rows across the 17 configured clubs carry a full link.
            // The row is kept because My Club Teams needs every team the club page lists and reads
            // only the name. ClubStandingsList filters these out before calling the standings
            // endpoint; see its "drops a team with no division" test.
            const html = `<html><body><div id="TeamsList"><table><tbody><tr><td>
                <a href="/Linkless">Odd Team</a>
            </td></tr></tbody></table></div></body></html>`;

            const parser = new CLTTLActiveSeason2025PagesParser();

            expect(parser.getClubTeams(html)).toEqual([
                { team_name: 'Odd Team', team_division: '' }
            ]);
        });

        it('should preserve the team names exactly as the site spells them', () => {
            const filePath = path.resolve(__dirname, 'data/club_teams_aa_academy.html');
            const htmlContent = fs.readFileSync(filePath, 'utf-8');

            const parser = new CLTTLActiveSeason2025PagesParser();
            const teams = parser.getClubTeams(htmlContent);

            // The site is inconsistent about the capitalisation of "SJoA"; it is not normalised.
            // The TEAM NAME is untouched — only the division slug is transformed.
            expect(teams.map((team) => team.team_name)).toEqual([
                'AA Academy SJoA 1',
                'AA Academy SJoA 2',
                'AA Academy Sjoa 3',
                'AA Academy Sjoa 4'
            ]);
        });

        it('should extract named teams as well as numbered ones', () => {
            const filePath = path.resolve(__dirname, 'data/club_teams_walworth.html');
            const htmlContent = fs.readFileSync(filePath, 'utf-8');

            const parser = new CLTTLActiveSeason2025PagesParser();
            const teams = parser.getClubTeams(htmlContent);

            expect(teams).toEqual([
                { team_name: 'Walworth Enigma', team_division: 'Division 3' },
                { team_name: 'Walworth Gainsford', team_division: 'Division 2' },
                { team_name: 'Walworth Tigers', team_division: 'Division 4' },
                { team_name: 'Walworth Wonderers', team_division: 'Division 7' }
            ]);
        });

        it('should return empty array if TeamsList div is missing', () => {
            const parser = new CLTTLActiveSeason2025PagesParser();
            const teams = parser.getClubTeams('<html><body></body></html>');
            expect(teams).toEqual([]);
        });
    });
});

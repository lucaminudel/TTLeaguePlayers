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
            expect(firstFixture.startDate).toEqual(new Date('2025-09-29T19:30'));
            expect(firstFixture.venue).toBe('Fusion');
            expect(firstFixture.homeTeam).toBe('Fusion 5');
            expect(firstFixture.homeTeamPlayers).toEqual(['Yufeng Qiu', 'Charlie Boom', 'Stephen Odili']);
            expect(firstFixture.awayTeam).toBe('Morpeth 10');
            expect(firstFixture.awayTeamPlayers).toEqual(['Michele De Giovanni', 'Luca Minudel', 'Dave Mesfin']);
            expect(firstFixture.isCompleted).toBe(true);

            // A fixture from Week 2 (index 5): Highbury 3 v's Fusion 5
            const week2Fixture = fixtures[5];
            expect(week2Fixture.startDate).toEqual(new Date('2025-10-07T19:15'));
            expect(week2Fixture.venue).toBe('Bridge Academy');
            expect(week2Fixture.homeTeam).toBe('Highbury 3');
            expect(week2Fixture.homeTeamPlayers).toEqual(['Oscar Wallentin', 'Marcin Szymanski', 'Gustav Roedstroem']);
            expect(week2Fixture.awayTeam).toBe('Fusion 5');
            expect(week2Fixture.awayTeamPlayers).toEqual(['Shan Jiang', 'Charlie Boom', 'David Cole']);
            expect(week2Fixture.isCompleted).toBe(true);

            // Second to last fixture: Irving 4 v's Morpeth 10 from Week 26
            const secondToLastFixture = fixtures[fixtures.length - 2];
            expect(secondToLastFixture.startDate).toEqual(new Date('2026-03-24T19:00'));
            expect(secondToLastFixture.venue).toBe('All Saints, New Cross');
            expect(secondToLastFixture.homeTeam).toBe('Irving 4');
            expect(secondToLastFixture.homeTeamPlayers).toEqual([]); // unplayed
            expect(secondToLastFixture.awayTeam).toBe('Morpeth 10');
            expect(secondToLastFixture.awayTeamPlayers).toEqual([]); // unplayed
            expect(secondToLastFixture.isCompleted).toBe(false);

            // Last fixture: Fusion 6 Jr v's Highbury 2 from Week 26
            const lastFixture = fixtures[fixtures.length - 1];
            expect(lastFixture.startDate).toEqual(new Date('2026-03-27T18:30'));
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
});

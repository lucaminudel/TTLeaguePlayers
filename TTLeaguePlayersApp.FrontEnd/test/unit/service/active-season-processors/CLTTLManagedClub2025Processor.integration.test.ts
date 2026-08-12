import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { CLTTLManagedClub2025Processor } from '../../../../src/service/active-season-processors/CLTTLManagedClub2025Processor';
import type { ActiveSeasonDataSource } from '../../../../src/config/environment';

/**
 * These tests run against the HTML captured from the live site and persisted under
 * clttl-2025/data/, so they prove the code keeps working against the pages as they were
 * when the feature was written. The complementary live check is in the e2e specs, and it
 * deliberately asserts less, because the club page carries no season in its URL and no
 * archived version: a new season silently changes its content.
 */
describe('CLTTLManagedClub2025Processor Integration', () => {
    const mockDataSource: ActiveSeasonDataSource = {
        league: 'CLTTL',
        season: '2025-2026',
        custom_processor: 'CLTTLActiveSeason2025Processor',
        custom_club_processor: 'CLTTLManagedClub2025Processor',
        registrations_start_date: 0,
        ratings_end_date: 0,
        division_tables: [{ 'Division 1': 'http://tables/div1' }],
        division_fixtures: [{ 'Division 1': 'http://fixtures/div1' }],
        division_players: [{ 'Division 1': 'http://players/div1' }],
        club_teams: [
            { 'Morpeth Table Tennis Club': 'https://www.tabletennis365.com/CentralLondon/Club/392/Morpeth' },
            { 'Walworth Table Tennis Club': 'https://www.tabletennis365.com/CentralLondon/Club/6008/TSPxHAtVSl' },
            { 'AA Academy @ SJoA': 'https://www.tabletennis365.com/CentralLondon/Club/6167/ouFtRhLIFg' }
        ],
    };

    const readFixture = (name: string) =>
        fs.readFileSync(path.resolve(__dirname, 'clttl-2025/data', name), 'utf-8');

    let processor: CLTTLManagedClub2025Processor;

    beforeEach(() => {
        processor = new CLTTLManagedClub2025Processor(mockDataSource, 'Morpeth Table Tennis Club');
        vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });

    const stubClubPage = (clubFixture: string) => {
        vi.mocked(fetch).mockResolvedValue({
            ok: true,
            text: () => Promise.resolve(readFixture(clubFixture)),
        } as Response);
    };

    it('should successfully get the club teams from the configured club page', async () => {
        stubClubPage('club_teams_morpeth.html');

        const teams = await processor.getClubTeams();

        // The cheapest end-to-end proof of the division transform: Morpeth's 12 teams carry four
        // different division slugs, and this asserts on the processor's output rather than the
        // parser's, so it also covers the fetcher-parser wiring.
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
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(fetch).toHaveBeenCalledWith('https://www.tabletennis365.com/CentralLondon/Club/392/Morpeth');
    });

    it('should get the teams of a club whose teams are named rather than numbered', async () => {
        stubClubPage('club_teams_walworth.html');

        const walworth = new CLTTLManagedClub2025Processor(mockDataSource, 'Walworth Table Tennis Club');
        const teams = await walworth.getClubTeams();

        expect(teams).toEqual([
            { team_name: 'Walworth Enigma', team_division: 'Division 3' },
            { team_name: 'Walworth Gainsford', team_division: 'Division 2' },
            { team_name: 'Walworth Tigers', team_division: 'Division 4' },
            { team_name: 'Walworth Wonderers', team_division: 'Division 7' }
        ]);
        expect(fetch).toHaveBeenCalledWith('https://www.tabletennis365.com/CentralLondon/Club/6008/TSPxHAtVSl');
    });

    it('should look the club up by its configured name, punctuation included', async () => {
        stubClubPage('club_teams_aa_academy.html');

        const aaAcademy = new CLTTLManagedClub2025Processor(mockDataSource, 'AA Academy @ SJoA');
        const teams = await aaAcademy.getClubTeams();

        // The site is inconsistent about the capitalisation of "SJoA"; it is not normalised.
        expect(teams.map((team) => team.team_name)).toEqual([
            'AA Academy SJoA 1',
            'AA Academy SJoA 2',
            'AA Academy Sjoa 3',
            'AA Academy Sjoa 4'
        ]);
        expect(fetch).toHaveBeenCalledWith('https://www.tabletennis365.com/CentralLondon/Club/6167/ouFtRhLIFg');
    });

    it('should throw error if the club has no page configured', async () => {
        const unknownClubProcessor = new CLTTLManagedClub2025Processor(mockDataSource, 'Not A Real Club');

        await expect(unknownClubProcessor.getClubTeams()).rejects.toThrow(
            'Club "Not A Real Club" not found in data source.'
        );
        expect(fetch).not.toHaveBeenCalled();
    });

    it('should throw error if the league has no clubs configured', async () => {
        const unconfiguredProcessor = new CLTTLManagedClub2025Processor(
            { ...mockDataSource, league: 'BCS', club_teams: [] },
            'Morpeth Table Tennis Club'
        );

        await expect(unconfiguredProcessor.getClubTeams()).rejects.toThrow(
            'Club "Morpeth Table Tennis Club" not found in data source.'
        );
        expect(fetch).not.toHaveBeenCalled();
    });

    it('should bubble up PageFetcherError when page is not reachable', async () => {
        vi.mocked(fetch).mockResolvedValue({
            ok: false,
            status: 404,
        } as Response);

        // Fetcher retries 3 times (1 initial + 2 retries)
        await expect(processor.getClubTeams()).rejects.toThrow('The page or website is not available after 3 attempts');
        expect(fetch).toHaveBeenCalledTimes(3);
    });
});

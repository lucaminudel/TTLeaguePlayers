import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ExternalContractsLiveTesting } from '../../../src/pages/ExternalContractsLiveTesting';
import type { ActiveSeasonDataSource, EnvironmentConfig } from '../../../src/config/environment';

const mockGetConfig = vi.fn();
vi.mock('../../../src/config/environment', () => ({
    getConfig: () => mockGetConfig() as EnvironmentConfig,
}));

function dataSource(overrides: Partial<ActiveSeasonDataSource> = {}): ActiveSeasonDataSource {
    return {
        league: 'CLTTL',
        season: '2026-2027',
        custom_processor: 'CLTTLActiveSeason2026Processor',
        custom_club_processor: 'CLTTLManagedClub2025Processor',
        registrations_start_date: 1788220800,
        ratings_end_date: 1814400000,
        division_tables: [],
        division_fixtures: [{ 'Division 4': 'https://fixtures.example.test/calendar.ics?d=9761' }],
        division_players: [{ 'Division 4': 'https://players.example.test/Eligibility' }],
        club_teams: [],
        ...overrides,
    };
}

function validCalendarResponse(): Response {
    return new Response([
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'DTSTART;TZID=Europe/London:20261009T184500',
        'SUMMARY:Morpeth 11 Jr v Morpeth 10 (Division 4)',
        'END:VEVENT',
        'END:VCALENDAR',
    ].join('\n'));
}

describe('ExternalContractsLiveTesting', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn());
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('selects the configured CLTTL 2026-2027 source and renders ready after checking its contracts', async () => {
        mockGetConfig.mockReturnValue({
            active_seasons_data_source: [
                dataSource({
                    season: '2027-2028',
                    registrations_start_date: 1819756800,
                    division_fixtures: [{ 'Division 4': 'https://fixtures.example.test/calendar.ics?d=next-season' }],
                }),
                dataSource({
                    season: '2025-2026',
                    registrations_start_date: 1755648000,
                    division_fixtures: [{ 'Division 4': 'https://fixtures.example.test/calendar.ics?d=9445' }],
                }),
                dataSource(),
            ],
        } as EnvironmentConfig);
        vi.mocked(fetch)
            .mockResolvedValueOnce(validCalendarResponse())
            .mockResolvedValueOnce(new Response('<select id="teamSelect"><option value="73142">Morpeth 10</option></select>'))
            .mockResolvedValueOnce(new Response(JSON.stringify({ teamPlayers: [{ playerName: 'Luca Minudel' }] })));

        render(<ExternalContractsLiveTesting />);

        await waitFor(() => {
            expect(screen.getByTestId('external-contract-status')).toHaveTextContent('ready');
        });

        expect(screen.getByTestId('external-contract-season')).toHaveTextContent('CLTTL 2026-2027');
        expect(screen.getByTestId('external-contract-fixture-calendar')).toHaveTextContent('Fixtures: 1');
        expect(screen.getByTestId('external-contract-team-selector')).toHaveTextContent('Team options: 1');
        expect(screen.getByTestId('external-contract-team-player-json')).toHaveTextContent('Player names: 1');
        expect(screen.queryByTestId('external-contract-loading')).not.toBeInTheDocument();
        expect(fetch).toHaveBeenNthCalledWith(1, expect.stringContaining(encodeURIComponent('https://fixtures.example.test/calendar.ics?d=9761')));
    });

    it('renders an error when no configured CLTTL source has both Division 4 contracts', async () => {
        mockGetConfig.mockReturnValue({
            active_seasons_data_source: [dataSource({ division_fixtures: [] })],
        } as EnvironmentConfig);

        render(<ExternalContractsLiveTesting />);

        await waitFor(() => {
            expect(screen.getByTestId('external-contract-status')).toHaveTextContent('error');
        });
        expect(screen.getByTestId('external-contract-error')).toHaveTextContent(
            'No CLTTL 2026-2027 data source with Division 4 players and fixtures is configured.'
        );
        expect(fetch).not.toHaveBeenCalled();
    });

    it('requires non-empty Division 4 links on the configured CLTTL 2026-2027 source', async () => {
        mockGetConfig.mockReturnValue({
            active_seasons_data_source: [
                dataSource({ league: 'BCS', season: 'ignored-non-clttl' }),
                dataSource({ season: 'ignored-players-only', division_fixtures: [] }),
                dataSource({ season: 'ignored-fixtures-only', division_players: [] }),
                dataSource({ division_fixtures: [{ 'Division 4': '' }] }),
            ],
        } as EnvironmentConfig);

        render(<ExternalContractsLiveTesting />);

        await waitFor(() => {
            expect(screen.getByTestId('external-contract-status')).toHaveTextContent('error');
        });

        expect(screen.getByTestId('external-contract-error')).toHaveTextContent(
            'No CLTTL 2026-2027 data source with Division 4 players and fixtures is configured.'
        );
        expect(fetch).not.toHaveBeenCalled();
    });

    it('keeps the loading state visible while the calendar request is pending', () => {
        mockGetConfig.mockReturnValue({ active_seasons_data_source: [dataSource()] } as EnvironmentConfig);
        vi.mocked(fetch).mockImplementation(() => new Promise(() => undefined));

        render(<ExternalContractsLiveTesting />);

        expect(screen.getByTestId('external-contract-status')).toHaveTextContent('loading');
        expect(screen.getByTestId('external-contract-loading')).toHaveTextContent('Loading proxy response…');
        expect(screen.queryByTestId('go-x2u-in-proxy-result')).not.toBeInTheDocument();
        expect(screen.queryByTestId('external-contract-error')).not.toBeInTheDocument();
    });

    it('reports an error when the calendar contains no usable fixtures', async () => {
        mockGetConfig.mockReturnValue({ active_seasons_data_source: [dataSource()] } as EnvironmentConfig);
        vi.mocked(fetch).mockResolvedValueOnce(new Response('BEGIN:VCALENDAR\nEND:VCALENDAR'));

        render(<ExternalContractsLiveTesting />);

        await waitFor(() => {
            expect(screen.getByTestId('external-contract-status')).toHaveTextContent('error');
        });

        expect(screen.getByTestId('external-contract-error')).toHaveTextContent('did not contain any fixtures');
        expect(screen.queryByTestId('external-contract-loading')).not.toBeInTheDocument();
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('reports an error when the team selector has no numeric team options', async () => {
        mockGetConfig.mockReturnValue({ active_seasons_data_source: [dataSource()] } as EnvironmentConfig);
        vi.mocked(fetch)
            .mockResolvedValueOnce(validCalendarResponse())
            .mockResolvedValueOnce(new Response('<select id="teamSelect"><option value="">All Teams</option></select>'));

        render(<ExternalContractsLiveTesting />);

        await waitFor(() => {
            expect(screen.getByTestId('external-contract-status')).toHaveTextContent('error');
        });

        expect(screen.getByTestId('external-contract-error')).toHaveTextContent('did not contain any numeric team options');
        expect(fetch).toHaveBeenCalledTimes(2);
    });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Fragment, StrictMode } from 'react';
import { Link, MemoryRouter } from 'react-router-dom';
import { ExternalContractsLiveTesting } from '../../../src/pages/ExternalContractsLiveTesting';
import type { ActiveSeasonDataSource, EnvironmentConfig } from '../../../src/config/environment';

const mockGetConfig = vi.fn();
vi.mock('../../../src/config/environment', () => ({ getConfig: () => mockGetConfig() as EnvironmentConfig }));

function dataSource(overrides: Partial<ActiveSeasonDataSource> = {}): ActiveSeasonDataSource {
    return {
        league: 'CLTTL', season: '2026-2027',
        custom_processor: 'CLTTLActiveSeason2026Processor', custom_club_processor: 'CLTTLManagedClub2026Processor',
        registrations_start_date: 1788220800, ratings_end_date: 1814400000,
        division_fixtures: [{ 'Division 4': 'https://fixtures.example.test/calendar.ics?d=9761' }],
        division_players: [{ 'Division 4': 'https://players.example.test/Eligibility' }],
        club_teams: [{ 'Morpeth Table Tennis Club': 'https://clubs.example.test/Morpeth' }],
        ...overrides,
    };
}

function calendarResponse(): Response {
    return new Response([
        'BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'DTSTART;TZID=Europe/London:20261009T184500',
        'SUMMARY:Morpeth 11 Jr v Morpeth 10 (Division 4)', 'END:VEVENT', 'END:VCALENDAR',
    ].join('\n'));
}

function teamSelector(id = '424242', name = 'Morpeth 10'): string {
    return `<select id="teamSelect"><option value="">All Teams</option><option value="99">Another Team</option><option value="${id}">${name}</option></select>`;
}

function clubTable(division = 'Division 4', team = 'Morpeth 10'): string {
    return `<table class="tt-contact-table"><tbody><tr><td>Current season</td><td>${division}</td><td>${team}</td><td>Captain</td></tr></tbody></table>`;
}

function queueActiveResponses(selector = teamSelector(), roster: unknown = { teamPlayers: [{ id: 1, name: ' Player One ' }], otherPlayers: [{ id: 2, name: 'Reserve Player' }] }): void {
    vi.mocked(fetch).mockResolvedValueOnce(calendarResponse())
        .mockResolvedValueOnce(new Response(selector))
        .mockResolvedValueOnce(new Response(JSON.stringify(roster)));
}

function renderDiagnostic(mode: 'active-season' | 'managed-club' = 'active-season', strict = false) {
    const Wrapper = strict ? StrictMode : Fragment;
    return render(
        <Wrapper><MemoryRouter initialEntries={[mode === 'managed-club' ? '/external-contracts-live?contract=managed-club' : '/external-contracts-live']}>
            <ExternalContractsLiveTesting />
            <Link to="/external-contracts-live?contract=managed-club">Check club</Link>
        </MemoryRouter></Wrapper>
    );
}

function requestedTargets(): (string | null)[] {
    return vi.mocked(fetch).mock.calls.map(([url]) => new URL(typeof url === 'string' ? url : url instanceof URL ? url.href : url.url).searchParams.get('url'));
}

async function expectError(message: string): Promise<void> {
    await waitFor(() => { expect(screen.getByTestId('external-contract-status')).toHaveTextContent('error'); });
    expect(screen.getByTestId('external-contract-error')).toHaveTextContent(message);
    expect(screen.queryByTestId('go-x2u-in-proxy-result')).not.toBeInTheDocument();
}

describe('ExternalContractsLiveTesting', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn());
        vi.clearAllMocks();
        mockGetConfig.mockReturnValue({ active_seasons_data_source: [dataSource()] } as EnvironmentConfig);
    });
    afterEach(() => { vi.unstubAllGlobals(); });

    it('selects the current configured season and resolves the representative roster ID through the proxy', async () => {
        mockGetConfig.mockReturnValue({ active_seasons_data_source: [
            dataSource({ season: '2027-2028', division_fixtures: [{ 'Division 4': 'https://fixtures.example.test/next-season.ics' }] }),
            dataSource({ league: 'BCS', division_fixtures: [{ 'Division 4': 'https://fixtures.example.test/another-league.ics' }] }),
            dataSource({ season: '2025-2026', division_fixtures: [{ 'Division 4': 'https://fixtures.example.test/previous-season.ics' }] }),
            dataSource(),
        ] } as EnvironmentConfig);
        queueActiveResponses();
        renderDiagnostic();
        await waitFor(() => { expect(screen.getByTestId('external-contract-status')).toHaveTextContent('ready'); });
        expect(screen.getByTestId('external-contract-season')).toHaveTextContent('CLTTL 2026-2027');
        expect(screen.getByTestId('external-contract-division')).toHaveTextContent('Division 4');
        expect(screen.getByTestId('external-contract-fixture-calendar')).toHaveTextContent('Fixtures: 1');
        expect(screen.getByTestId('external-contract-team-selector')).toHaveTextContent('Team options: 2');
        expect(screen.getByTestId('external-contract-selected-team')).toHaveTextContent('Morpeth 10');
        expect(screen.getByTestId('external-contract-team-player-json')).toHaveTextContent('Player names: 1');
        expect(screen.getByTestId('external-contract-player-name')).toHaveTextContent('Player One');
        expect(screen.queryByText('Reserve Player')).not.toBeInTheDocument();
        expect(screen.queryByTestId('external-contract-loading')).not.toBeInTheDocument();
        expect(screen.queryByTestId('external-contract-club')).not.toBeInTheDocument();
        expect(requestedTargets()).toEqual([
            'https://fixtures.example.test/calendar.ics?d=9761', 'https://players.example.test/Eligibility',
            'https://players.example.test/Eligibility?handler=Players&leagueId=4760&teamId=424242',
        ]);
    });

    it.each([
        ['no matching season', { season: '2025-2026' }],
        ['no matching league', { league: 'BCS' }],
        ['missing fixtures', { division_fixtures: [] }],
        ['blank fixture URL', { division_fixtures: [{ 'Division 4': '  ' }] }],
        ['missing players', { division_players: [] }],
        ['blank player URL', { division_players: [{ 'Division 4': '' }] }],
    ] satisfies [string, Partial<ActiveSeasonDataSource>][])('rejects active-season configuration with %s before fetching', async (_label, overrides) => {
        mockGetConfig.mockReturnValue({ active_seasons_data_source: [dataSource(overrides)] } as EnvironmentConfig);
        renderDiagnostic();
        await expectError('No CLTTL 2026-2027 data source with Division 4 players and fixtures is configured.');
        expect(requestedTargets()).toEqual([]);
    });

    it('shows loading while the calendar request is pending', () => {
        vi.mocked(fetch).mockImplementation(() => new Promise(() => undefined));
        renderDiagnostic();
        expect(screen.getByTestId('external-contract-status')).toHaveTextContent('loading');
        expect(screen.getByTestId('external-contract-loading')).toBeVisible();
        expect(screen.queryByTestId('go-x2u-in-proxy-result')).not.toBeInTheDocument();
        expect(screen.queryByTestId('external-contract-error')).not.toBeInTheDocument();
    });

    it('rejects a calendar with no usable fixtures before fetching team data', async () => {
        vi.mocked(fetch).mockResolvedValueOnce(new Response('BEGIN:VCALENDAR\nEND:VCALENDAR'));
        renderDiagnostic();
        await expectError('did not contain any fixtures');
        expect(requestedTargets()).toHaveLength(1);
    });

    it('rejects a selector with no numeric options', async () => {
        queueActiveResponses('<select id="teamSelect"><option value="">All Teams</option><option value="bad">Broken ID</option></select>');
        renderDiagnostic();
        await expectError('No usable teams in selector');
        expect(requestedTargets()).toHaveLength(2);
    });

    it.each([['zero ID', teamSelector('0')], ['unsafe ID', teamSelector('9007199254740992')]])('rejects %s before requesting a roster', async (_label, selector) => {
        queueActiveResponses(selector);
        renderDiagnostic();
        await expectError('invalid team names or IDs');
        expect(requestedTargets()).toHaveLength(2);
    });

    it('rejects a blank representative team name after the parser skips it', async () => {
        queueActiveResponses(teamSelector('424242', '  '));
        renderDiagnostic();
        await expectError('did not contain Morpeth 10');
        expect(requestedTargets()).toHaveLength(2);
    });

    it('rejects a missing representative team instead of silently using the first option', async () => {
        queueActiveResponses(teamSelector('424242', 'Another Morpeth Team'));
        renderDiagnostic();
        await expectError('did not contain Morpeth 10');
        expect(requestedTargets()).toHaveLength(2);
    });

    it.each([
        ['null body', null], ['number body', 42], ['boolean body', true], ['string body', 'Player One'], ['array body', ['Player One']], ['fallback players field', { players: ['Player One'] }],
        ['missing roster', {}], ['non-array roster', { teamPlayers: 'Player One' }], ['empty roster', { teamPlayers: [] }],
        ['null player', { teamPlayers: [null] }], ['string player', { teamPlayers: ['Player One'] }],
        ['missing name', { teamPlayers: [{ id: 1 }] }], ['numeric name', { teamPlayers: [{ name: 123 }] }],
        ['blank name', { teamPlayers: [{ name: '   ' }] }],
        ['valid player followed by invalid player', { teamPlayers: [{ name: 'Player One' }, { name: '' }] }],
    ])('rejects %s instead of reporting a usable live roster', async (_label, roster) => {
        queueActiveResponses(teamSelector(), roster);
        renderDiagnostic();
        await expectError('valid nonempty roster for Morpeth 10');
    });

    it('reports malformed JSON as an error', async () => {
        vi.mocked(fetch).mockResolvedValueOnce(calendarResponse()).mockResolvedValueOnce(new Response(teamSelector())).mockResolvedValueOnce(new Response('{'));
        renderDiagnostic();
        await waitFor(() => { expect(screen.getByTestId('external-contract-status')).toHaveTextContent('error'); });
        expect(screen.getByTestId('external-contract-error').textContent.trim()).not.toBe('');
        expect(screen.queryByTestId('go-x2u-in-proxy-result')).not.toBeInTheDocument();
    });

    it('normalizes word-form club divisions from the proxy independently of active-season configuration', async () => {
        mockGetConfig.mockReturnValue({ active_seasons_data_source: [dataSource({ division_fixtures: [], division_players: [] })] } as EnvironmentConfig);
        vi.mocked(fetch).mockResolvedValueOnce(new Response(clubTable(' Division Four ', ' Morpeth 10 ')));
        renderDiagnostic('managed-club');
        await waitFor(() => { expect(screen.getByTestId('external-contract-status')).toHaveTextContent('ready'); });
        expect(screen.getByTestId('external-contract-season')).toHaveTextContent('CLTTL 2026-2027');
        expect(screen.getByTestId('external-contract-club')).toHaveTextContent('Morpeth Table Tennis Club');
        expect(screen.getByTestId('external-contract-club-team-count')).toHaveTextContent('Club teams: 1');
        expect(screen.getByTestId('external-contract-club-team-name')).toHaveTextContent('Morpeth 10');
        expect(screen.getByTestId('external-contract-club-team-division')).toHaveTextContent('Division 4');
        expect(screen.queryByTestId('external-contract-team-player-json')).not.toBeInTheDocument();
        expect(requestedTargets()).toEqual(['https://clubs.example.test/Morpeth']);
    });

    it.each([
        ['missing configured source', { season: '2025-2026' }], ['missing club', { club_teams: [] }],
        ['blank club URL', { club_teams: [{ 'Morpeth Table Tennis Club': '  ' }] }],
    ] satisfies [string, Partial<ActiveSeasonDataSource>][])('rejects %s in club mode without making active-season requests', async (_label, overrides) => {
        mockGetConfig.mockReturnValue({ active_seasons_data_source: [dataSource(overrides)] } as EnvironmentConfig);
        renderDiagnostic('managed-club');
        await expectError('No CLTTL 2026-2027 data source with a Morpeth Table Tennis Club club page is configured.');
        expect(requestedTargets()).toEqual([]);
    });

    it.each([
        ['absent table', '<p>Upstream response</p>', 'Club teams table missing'],
        ['blank team', clubTable('Division 4', '  '), 'No usable club team rows'],
    ])('reports %s as a parsing failure in club mode', async (_label, html, message) => {
        vi.mocked(fetch).mockResolvedValueOnce(new Response(html));
        renderDiagnostic('managed-club');
        await expectError(message);
    });

    it.each([
        ['empty table', '<table class="tt-contact-table"><tbody></tbody></table>'],
        ['blank division', clubTable('  ')],
        ['one invalid division among valid rows', clubTable().replace('</tbody>', '<tr><td>Season</td><td></td><td>Another Team</td></tr></tbody>')],
    ])('rejects %s in club mode', async (_label, html) => {
        vi.mocked(fetch).mockResolvedValueOnce(new Response(html));
        renderDiagnostic('managed-club');
        await expectError('valid club teams with names and divisions');
    });

    it('shows club loading independently while its request is pending', () => {
        vi.mocked(fetch).mockImplementation(() => new Promise(() => undefined));
        renderDiagnostic('managed-club');
        expect(screen.getByTestId('external-contract-status')).toHaveTextContent('loading');
        expect(screen.getByTestId('external-contract-loading')).toBeVisible();
        expect(screen.queryByTestId('external-contract-club-team-count')).not.toBeInTheDocument();
    });

    it('reports a failed club fetch without falling back to active-season requests', async () => {
        vi.mocked(fetch).mockResolvedValue(new Response('Unavailable', { status: 503 }));
        renderDiagnostic('managed-club');
        await waitFor(() => { expect(screen.getByTestId('external-contract-status')).toHaveTextContent('error'); }, { timeout: 7000 });
        expect(screen.getByTestId('external-contract-error')).toHaveTextContent('HTTP error! status: 503');
        expect(requestedTargets()).toEqual(Array<string>(3).fill('https://clubs.example.test/Morpeth'));
    }, 10000);

    it('resets the diagnostic when switching from active-season to independent club mode', async () => {
        queueActiveResponses();
        renderDiagnostic();
        await waitFor(() => { expect(screen.getByTestId('external-contract-status')).toHaveTextContent('ready'); });
        let resolveClub!: (response: Response) => void;
        vi.mocked(fetch).mockImplementationOnce(() => new Promise<Response>(resolve => { resolveClub = resolve; }));
        fireEvent.click(screen.getByRole('link', { name: 'Check club' }));
        expect(screen.getByTestId('external-contract-status')).toHaveTextContent('loading');
        expect(screen.queryByTestId('external-contract-player-name')).not.toBeInTheDocument();
        resolveClub(new Response(clubTable()));
        await waitFor(() => { expect(screen.getByTestId('external-contract-club-team-name')).toHaveTextContent('Morpeth 10'); });
    });


    it.each([
        ['successful', clubTable('Division 1', 'Stale Team')],
        ['invalid', '<p>No club table</p>'],
    ])('ignores the %s response from the discarded StrictMode effect while the current request is pending', async (_label, oldBody) => {
        let resolveOld!: (response: Response) => void;
        let resolveCurrent!: (response: Response) => void;
        vi.mocked(fetch)
            .mockImplementationOnce(() => new Promise<Response>(resolve => { resolveOld = resolve; }))
            .mockImplementationOnce(() => new Promise<Response>(resolve => { resolveCurrent = resolve; }));
        renderDiagnostic('managed-club', true);
        expect(requestedTargets()).toEqual(['https://clubs.example.test/Morpeth', 'https://clubs.example.test/Morpeth']);

        await act(async () => {
            resolveOld(new Response(oldBody));
            await Promise.resolve();
        });
        expect(screen.getByTestId('external-contract-status')).toHaveTextContent('loading');
        expect(screen.queryByTestId('go-x2u-in-proxy-result')).not.toBeInTheDocument();
        expect(screen.queryByTestId('external-contract-error')).not.toBeInTheDocument();

        await act(async () => {
            resolveCurrent(new Response(clubTable('Division 4', 'Current Team')));
            await Promise.resolve();
        });
        await waitFor(() => { expect(screen.getByTestId('external-contract-status')).toHaveTextContent('ready'); });
        expect(screen.getByTestId('external-contract-club-team-name')).toHaveTextContent('Current Team');
        expect(screen.queryByText('Stale Team')).not.toBeInTheDocument();
    });

    it('pairs each returned club team with its own division in the rendered list', async () => {
        const html = clubTable('Premier', 'First Team').replace('</tbody>', '<tr><td>Season</td><td>Division 4</td><td>Second Team</td></tr></tbody>');
        vi.mocked(fetch).mockResolvedValueOnce(new Response(html));
        renderDiagnostic('managed-club');
        await waitFor(() => { expect(screen.getByTestId('external-contract-status')).toHaveTextContent('ready'); });
        expect(screen.getByTestId('external-contract-club-team-count')).toHaveTextContent('Club teams: 2');
        expect(screen.getAllByRole('listitem').map(row => row.textContent)).toEqual(['First Team — Premier', 'Second Team — Division 4']);
    });

});

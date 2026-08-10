import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MyClubTeams } from '../../../src/pages/MyClubTeams';
import { setUnitFixedClockTime } from '../TestClockUtils';
import type { EnvironmentConfig } from '../../../src/config/environment';

const mockUseAuth = vi.fn();
vi.mock('../../../src/hooks/useAuth', () => ({
    useAuth: () => mockUseAuth() as unknown,
}));

const mockGetConfig = vi.fn();
vi.mock('../../../src/config/environment', () => ({
    getConfig: () => mockGetConfig() as EnvironmentConfig,
}));

const processorFactoryMocks = vi.hoisted(() => ({
    createManagedClubProcessor: vi.fn(),
}));
vi.mock('../../../src/service/active-season-processors/ManagedClubProcessorFactory', () => ({
    createManagedClubProcessor: processorFactoryMocks.createManagedClubProcessor,
}));

// The list has its own spec; here it is a marker, so the page's own wiring is what is under test.
const clubTeamsListMocks = vi.hoisted(() => ({ render: vi.fn() }));
vi.mock('../../../src/components/ui/ClubTeamsList', () => ({
    ClubTeamsList: (props: Record<string, unknown>) => {
        clubTeamsListMocks.render(props);
        return <div data-testid="club-teams-list" />;
    },
}));

describe('MyClubTeams', () => {
    // Inside the CLTTL 2025-2026 window declared in the config below.
    const FIXED_CLOCK = '2026-06-01T12:00:00Z';

    const walworth = {
        league: 'CLTTL',
        season: '2025-2026',
        club_name: 'Walworth Table Tennis Club',
        club_location: 'London',
        manager_name: 'Luca Minudel',
    };

    const highbury = {
        league: 'CLTTL',
        season: '2025-2026',
        club_name: 'Highbury Table Tennis Club',
        club_location: 'Islington',
        manager_name: 'Luca Minudel',
    };

    const cltttlDataSource = {
        league: 'CLTTL',
        season: '2025-2026',
        custom_processor: 'CLTTLActiveSeason2025Processor',
        custom_club_processor: 'CLTTLManagedClub2025Processor',
        registrations_start_date: Math.floor(new Date('2025-08-01T00:00:00Z').getTime() / 1000),
        ratings_end_date: Math.floor(new Date('2026-05-01T00:00:00Z').getTime() / 1000),
        division_tables: [],
        division_fixtures: [],
        division_players: [],
        club_teams: [{ 'Walworth Table Tennis Club': 'http://test/walworth' }],
    };

    const stubProcessor = { getClubTeams: vi.fn() };

    let consoleInfoSpy: MockInstance;
    let consoleErrorSpy: MockInstance;

    beforeEach(() => {
        vi.clearAllMocks();
        setUnitFixedClockTime(FIXED_CLOCK);
        consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        processorFactoryMocks.createManagedClubProcessor.mockReturnValue(stubProcessor);
        mockGetConfig.mockReturnValue({ active_seasons_data_source: [cltttlDataSource] });
        setAuth([walworth]);
    });

    afterEach(() => {
        consoleInfoSpy.mockRestore();
        consoleErrorSpy.mockRestore();
        setUnitFixedClockTime(undefined);
    });

    // ProtectedRoute reads isAuthenticated from the same hook, so every stub must carry it.
    const setAuth = (managedClubs: typeof walworth[]) => {
        mockUseAuth.mockReturnValue({
            isAuthenticated: true,
            email: 'manager@example.test',
            username: 'Luca',
            activeSeasons: [],
            managedClubs,
            isPlayerOrCaptain: false,
            isClubManager: managedClubs.length > 0,
            signOut: vi.fn(),
        });
    };

    const renderPage = () => {
        render(
            <MemoryRouter initialEntries={['/my-club-teams']}>
                <MyClubTeams />
            </MemoryRouter>
        );
    };

    // ------------------------------------------------------------ empty states

    it('tells a user with no managed clubs that they are not a club manager', () => {
        setAuth([]);

        renderPage();

        expect(screen.getByTestId('no-managed-clubs')).toBeInTheDocument();
        expect(screen.queryByTestId('no-active-season')).not.toBeInTheDocument();
    });

    // The menu entry is gated on the RAW Cognito clubs, so a manager whose season is over would
    // otherwise be told they are not a manager at all - which is the one thing they are.
    it('distinguishes a manager whose clubs have no active season', () => {
        setAuth([{ ...walworth, season: '2019-2020' }]);

        renderPage();

        expect(screen.getByTestId('no-active-season')).toBeInTheDocument();
        expect(screen.queryByTestId('no-managed-clubs')).not.toBeInTheDocument();
    });

    it('treats a club whose season window has closed as inactive', () => {
        setUnitFixedClockTime('2030-06-01T12:00:00Z');

        renderPage();

        expect(screen.getByTestId('no-active-season')).toBeInTheDocument();
    });

    // ------------------------------------------------------------ selection

    it('auto-selects and shows the teams list when the manager has one active club', () => {
        renderPage();

        expect(screen.getByTestId('club-teams-list')).toBeInTheDocument();
        expect(screen.getByTestId('league-season-header')).toHaveTextContent('CLTTL 2025-2026');
    });

    it('shows no teams list until a club is chosen, when there are several', () => {
        setAuth([walworth, highbury]);

        renderPage();

        expect(screen.queryByTestId('club-teams-list')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Islington / CLTTL' }));

        expect(screen.getByTestId('club-teams-list')).toBeInTheDocument();
        expect(clubTeamsListMocks.render).toHaveBeenCalledWith(
            expect.objectContaining({ clubName: 'Highbury Table Tennis Club', clubLocation: 'Islington' })
        );
    });

    // ------------------------------------------------------------ processor wiring

    // The default is false, and false sends the club-page scrape into a CORS failure that renders
    // the list blank - with nothing on screen to say why.
    it('builds the processor with avoidCORS true, and with the club location', () => {
        renderPage();

        expect(processorFactoryMocks.createManagedClubProcessor).toHaveBeenCalledWith(
            'CLTTLManagedClub2025Processor',
            cltttlDataSource,
            'Walworth Table Tennis Club',
            'London',
            true
        );
    });

    it('does not rebuild the processor when the page re-renders without a change of club', () => {
        setAuth([walworth, highbury]);

        renderPage();
        fireEvent.click(screen.getByRole('button', { name: 'London / CLTTL' }));
        const callsAfterFirstSelection = processorFactoryMocks.createManagedClubProcessor.mock.calls.length;

        // Re-selecting the same club is a state write, so React re-renders.
        fireEvent.click(screen.getByRole('button', { name: 'London / CLTTL' }));

        expect(processorFactoryMocks.createManagedClubProcessor.mock.calls.length)
            .toBe(callsAfterFirstSelection);
    });

    // ------------------------------------------------------------ config problems

    it('logs and hides a club whose league-season is missing from the config', () => {
        setAuth([{ ...walworth, league: 'NOSUCH' }]);

        renderPage();

        expect(screen.getByTestId('no-active-season')).toBeInTheDocument();
        expect(consoleInfoSpy).toHaveBeenCalled();
    });
});

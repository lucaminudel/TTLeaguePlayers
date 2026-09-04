import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MyClubStandings } from '../../../src/pages/MyClubStandings';
import { setUnitFixedClockTime } from '../TestClockUtils';
import type { EnvironmentConfig } from '../../../src/config/environment';
import { STANDINGS_INFO_MODAL_GUID, WEBSITE_INFO_MODAL_GUID } from '../../../src/components/common/infoModalMessages';

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
// Exposes onStandingsLoaded via a button so a test can fire it, mirroring a successful load.
const clubStandingsListMocks = vi.hoisted(() => ({ render: vi.fn() }));
vi.mock('../../../src/components/ui/ClubStandingsList', () => ({
    ClubStandingsList: (props: { onStandingsLoaded?: () => void } & Record<string, unknown>) => {
        clubStandingsListMocks.render(props);
        return (
            <div data-testid="club-standings-list">
                <button data-testid="fire-standings-loaded" onClick={() => { props.onStandingsLoaded?.(); }}>
                    fire onStandingsLoaded
                </button>
            </div>
        );
    },
}));

describe('MyClubStandings', () => {
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
        localStorage.clear();
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
            userId: 'test-user-sub',
            activeSeasons: [],
            managedClubs,
            isPlayerOrCaptain: false,
            isClubManager: managedClubs.length > 0,
            signOut: vi.fn(),
        });
    };

    const renderPage = () => {
        render(
            <MemoryRouter initialEntries={['/my-club-standings']}>
                <MyClubStandings />
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

    it('auto-selects and shows the standings list when the manager has one active club', () => {
        renderPage();

        expect(screen.getByTestId('club-standings-list')).toBeInTheDocument();
        expect(screen.getByTestId('league-season-header')).toHaveTextContent('CLTTL 2025-2026');
    });

    // "Match Tally" is the ONLY thing on screen saying the numbers count MATCHES rather than kudos -
    // five positive kudos in one match score 1. Same wording as the Kudos Standings page.
    // Pos/Neu/Neg are the only thing distinguishing the three columns: the pills are told apart by
    // colour and position alone, which a screen reader cannot convey.
    it('labels the counts as a Match Tally, and names each of the three columns', () => {
        renderPage();

        expect(screen.getByText('Match Tally')).toBeInTheDocument();
        expect(screen.getByText('Ext')).toBeInTheDocument();
        expect(screen.getByText('Std')).toBeInTheDocument();
        expect(screen.getByText('Few')).toBeInTheDocument();
    });

    it('shows no standings list until a club is chosen, when there are several', () => {
        setAuth([walworth, highbury]);

        renderPage();

        expect(screen.queryByTestId('club-standings-list')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Islington / CLTTL' }));

        expect(screen.getByTestId('club-standings-list')).toBeInTheDocument();
        expect(clubStandingsListMocks.render).toHaveBeenCalledWith(
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

    // ------------------------------------------------------------ info modal

    describe('standings info modal', () => {
        it('appears after the standings load callback fires', () => {
            renderPage();

            expect(screen.queryByTestId('standings-website-info-modal')).not.toBeInTheDocument();

            fireEvent.click(screen.getByTestId('fire-standings-loaded'));

            expect(screen.getByTestId('standings-website-info-modal')).toBeInTheDocument();
            fireEvent.click(screen.getByTestId('standings-website-info-modal-ok'));

            expect(screen.getByTestId('standings-info-modal')).toBeInTheDocument();
        });

        it('does not appear when the callback never fires', () => {
            renderPage();

            expect(screen.queryByTestId('standings-website-info-modal')).not.toBeInTheDocument();
            expect(screen.queryByTestId('standings-info-modal')).not.toBeInTheDocument();
        });

        it('shows the website modal when only the disputes preference is already suppressed', () => {
            localStorage.setItem(`hide_modal_${STANDINGS_INFO_MODAL_GUID}_test-user-sub`, 'true');

            renderPage();
            fireEvent.click(screen.getByTestId('fire-standings-loaded'));

            expect(screen.getByTestId('standings-website-info-modal')).toBeInTheDocument();
            expect(screen.queryByTestId('standings-info-modal')).not.toBeInTheDocument();
        });

        // Mirrors a club switch: ClubStandingsList calls onStandingsLoaded again for the newly
        // selected club, but D1's once-per-visit guard means the pair opens only the first time.
        it('the pair appears only once even when the callback fires twice', () => {
            renderPage();

            fireEvent.click(screen.getByTestId('fire-standings-loaded'));
            expect(screen.getByTestId('standings-website-info-modal')).toBeInTheDocument();
            fireEvent.click(screen.getByTestId('standings-website-info-modal-ok'));
            expect(screen.getByTestId('standings-info-modal')).toBeInTheDocument();
            fireEvent.click(screen.getByTestId('standings-info-modal-ok'));
            expect(screen.queryByTestId('standings-website-info-modal')).not.toBeInTheDocument();
            expect(screen.queryByTestId('standings-info-modal')).not.toBeInTheDocument();

            fireEvent.click(screen.getByTestId('fire-standings-loaded'));

            expect(screen.queryByTestId('standings-website-info-modal')).not.toBeInTheDocument();
            expect(screen.queryByTestId('standings-info-modal')).not.toBeInTheDocument();
        });

        describe('suppression combinations', () => {
            it('neither suppressed: shows the website modal, then the disputes modal, in that order', () => {
                renderPage();
                fireEvent.click(screen.getByTestId('fire-standings-loaded'));

                expect(screen.getByTestId('standings-website-info-modal')).toBeInTheDocument();
                expect(screen.queryByTestId('standings-info-modal')).not.toBeInTheDocument();

                fireEvent.click(screen.getByTestId('standings-website-info-modal-ok'));

                expect(screen.getByTestId('standings-info-modal')).toBeInTheDocument();
                expect(screen.queryByTestId('standings-website-info-modal')).not.toBeInTheDocument();
            });

            it('website suppressed: the disputes modal opens directly', () => {
                localStorage.setItem(`hide_modal_${WEBSITE_INFO_MODAL_GUID}_test-user-sub`, 'true');

                renderPage();
                fireEvent.click(screen.getByTestId('fire-standings-loaded'));

                expect(screen.getByTestId('standings-info-modal')).toBeInTheDocument();
                expect(screen.queryByTestId('standings-website-info-modal')).not.toBeInTheDocument();
            });

            it('disputes suppressed: the website modal opens and its OK closes everything', () => {
                localStorage.setItem(`hide_modal_${STANDINGS_INFO_MODAL_GUID}_test-user-sub`, 'true');

                renderPage();
                fireEvent.click(screen.getByTestId('fire-standings-loaded'));

                expect(screen.getByTestId('standings-website-info-modal')).toBeInTheDocument();

                fireEvent.click(screen.getByTestId('standings-website-info-modal-ok'));

                expect(screen.queryByTestId('standings-website-info-modal')).not.toBeInTheDocument();
                expect(screen.queryByTestId('standings-info-modal')).not.toBeInTheDocument();
            });

            it('both suppressed: nothing opens', () => {
                localStorage.setItem(`hide_modal_${WEBSITE_INFO_MODAL_GUID}_test-user-sub`, 'true');
                localStorage.setItem(`hide_modal_${STANDINGS_INFO_MODAL_GUID}_test-user-sub`, 'true');

                renderPage();
                fireEvent.click(screen.getByTestId('fire-standings-loaded'));

                expect(screen.queryByTestId('standings-website-info-modal')).not.toBeInTheDocument();
                expect(screen.queryByTestId('standings-info-modal')).not.toBeInTheDocument();
            });
        });

        // Guards E6: rendering both modals from one JSX position would let React preserve InfoModal's
        // internal `dontShowAgain` state across the two, carrying a tick on the website modal into
        // the disputes modal and silently suppressing a message the user never agreed to hide.
        it('does not carry a ticked "don\'t show again" checkbox from the website modal into the disputes modal', () => {
            renderPage();
            fireEvent.click(screen.getByTestId('fire-standings-loaded'));

            expect(screen.getByTestId('standings-website-info-modal')).toBeInTheDocument();
            fireEvent.click(screen.getByTestId('standings-website-info-modal-dont-show-again'));
            fireEvent.click(screen.getByTestId('standings-website-info-modal-ok'));

            expect(screen.getByTestId('standings-info-modal')).toBeInTheDocument();
            expect(screen.getByTestId('standings-info-modal-dont-show-again')).not.toBeChecked();

            fireEvent.click(screen.getByTestId('standings-info-modal-ok'));

            expect(localStorage.getItem(`hide_modal_${STANDINGS_INFO_MODAL_GUID}_test-user-sub`)).toBeNull();
        });
    });
});

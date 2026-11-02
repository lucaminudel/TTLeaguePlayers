import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Component, type ReactNode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { MainMenu } from '../../../../src/components/navigation/MainMenu';
import { drainFrontendEvents } from '../../../../src/service/frontend-diagnostics/FrontendEventQueue';

vi.mock('../../../../src/service/frontend-diagnostics/FrontendEventQueue', () => ({
    drainFrontendEvents: vi.fn().mockResolvedValue(undefined),
}));

const mockUseAuth = vi.fn();
vi.mock('../../../../src/hooks/useAuth', () => ({
    useAuth: () => mockUseAuth() as unknown,
}));

class TestErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
    state: { error: Error | null } = { error: null };

    static getDerivedStateFromError(error: Error) {
        return { error };
    }

    render() {
        return this.state.error === null
            ? this.props.children
            : <p data-testid="main-menu-unexpected-error">{this.state.error.message}</p>;
    }
}

describe('MainMenu', () => {
    const CAPTAIN_ITEM = 'main-menu-nav-invite-team-members';

    const setAuth = (
        flags: { isAuthenticated: boolean; isPlayerOrCaptain?: boolean; isClubManager?: boolean; isCaptain?: boolean },
        details: { activeSeasons?: unknown[]; managedClubs?: unknown[]; userAttributesLoadFailed?: boolean; signOut?: ReturnType<typeof vi.fn> } = {}
    ) => {
        mockUseAuth.mockReturnValue({
            isAuthenticated: flags.isAuthenticated,
            isPlayerOrCaptain: flags.isPlayerOrCaptain ?? false,
            isClubManager: flags.isClubManager ?? false,
            isCaptain: flags.isCaptain ?? false,
            username: 'Luca',
            activeSeasons: details.activeSeasons ?? [],
            managedClubs: details.managedClubs ?? [],
            userAttributesLoadFailed: details.userAttributesLoadFailed ?? false,
            signOut: details.signOut ?? vi.fn(),
        });
    };

    const renderAndOpenMenu = (withErrorBoundary = false) => {
        const menu = (
            <MemoryRouter>
                <MainMenu />
            </MemoryRouter>
        );
        render(
            withErrorBoundary ? <TestErrorBoundary>{menu}</TestErrorBoundary> : menu
        );
        fireEvent.click(screen.getByTestId('main-menu-toggle'));
    };

    const CurrentLocation = () => {
        const location = useLocation();
        const locationState = location.state as { errorFromPreviousPage?: string } | null;
        return (
            <>
                <span data-testid="current-location">{location.pathname}</span>
                <span data-testid="current-location-error">{locationState?.errorFromPreviousPage}</span>
            </>
        );
    };

    const NavigateBack = () => {
        const navigate = useNavigate();
        return <button onClick={() => { void navigate(-1); }}>Go back</button>;
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('drains pending diagnostics on authenticated opening, but not closing or navigation', () => {
        setAuth({ isAuthenticated: true });
        renderAndOpenMenu();

        expect(drainFrontendEvents).toHaveBeenCalledOnce();
        fireEvent.click(screen.getByTestId('main-menu-toggle'));
        expect(drainFrontendEvents).toHaveBeenCalledOnce();
        fireEvent.click(screen.getByTestId('main-menu-toggle'));
        expect(drainFrontendEvents).toHaveBeenCalledTimes(2);
        fireEvent.click(screen.getByTestId('main-menu-nav-home'));
        expect(drainFrontendEvents).toHaveBeenCalledTimes(2);
    });

    it('does not drain pending diagnostics when an unauthenticated user opens the menu', () => {
        setAuth({ isAuthenticated: false });
        renderAndOpenMenu();

        expect(drainFrontendEvents).not.toHaveBeenCalled();
    });

    it('opens the menu without waiting for the diagnostic drain', () => {
        setAuth({ isAuthenticated: true });
        vi.mocked(drainFrontendEvents).mockImplementationOnce(() => new Promise(() => undefined));
        renderAndOpenMenu();

        expect(screen.getByTestId('main-menu-overlay')).toHaveClass('pointer-events-auto');
    });

    it('shows the captain item to a captain', () => {
        setAuth({ isAuthenticated: true, isPlayerOrCaptain: true, isCaptain: true });

        renderAndOpenMenu();

        const link = screen.getByTestId(CAPTAIN_ITEM);
        expect(link).toHaveTextContent('Invite Team Members');

        expect(link).toHaveAttribute('href', '/invite-team-members');
    });

    it('hides the captain item from a player who is not a captain', () => {
        setAuth({ isAuthenticated: true, isPlayerOrCaptain: true, isCaptain: false });

        renderAndOpenMenu();

        expect(screen.queryByTestId(CAPTAIN_ITEM)).toBeNull();
    });

    it('hides the captain item from a club manager', () => {
        setAuth({ isAuthenticated: true, isClubManager: true });

        renderAndOpenMenu();

        expect(screen.queryByTestId(CAPTAIN_ITEM)).toBeNull();
    });

    it('hides the captain item from a user who is not logged in', () => {
        setAuth({ isAuthenticated: false });

        renderAndOpenMenu();

        expect(screen.queryByTestId(CAPTAIN_ITEM)).toBeNull();
    });

    it.each([
        {
            role: 'an authenticated user with no team or club role',
            flags: { isAuthenticated: true },
            visibleRoleLinks: [],
        },
        {
            role: 'a player',
            flags: { isAuthenticated: true, isPlayerOrCaptain: true },
            visibleRoleLinks: ['main-menu-nav-matches-and-kudos', 'main-menu-nav-kudos-standings'],
        },
        {
            role: 'a captain',
            flags: { isAuthenticated: true, isPlayerOrCaptain: true, isCaptain: true },
            visibleRoleLinks: [
                'main-menu-nav-matches-and-kudos',
                'main-menu-nav-kudos-standings',
                CAPTAIN_ITEM,
            ],
        },
        {
            role: 'a club manager',
            flags: { isAuthenticated: true, isClubManager: true },
            visibleRoleLinks: [
                'main-menu-nav-my-club-teams',
                'main-menu-nav-my-club-standings',
                'main-menu-nav-promote-my-club',
                'main-menu-nav-promote-my-tournaments',
            ],
        },
        {
            role: 'a user with all three roles',
            flags: { isAuthenticated: true, isPlayerOrCaptain: true, isCaptain: true, isClubManager: true },
            visibleRoleLinks: [
                'main-menu-nav-matches-and-kudos',
                'main-menu-nav-kudos-standings',
                CAPTAIN_ITEM,
                'main-menu-nav-my-club-teams',
                'main-menu-nav-my-club-standings',
                'main-menu-nav-promote-my-club',
                'main-menu-nav-promote-my-tournaments',
            ],
        },
    ])('shows the appropriate destinations to $role', ({ flags, visibleRoleLinks }) => {
        setAuth(flags);

        renderAndOpenMenu();
        const visibleRoleLinkSet = new Set<string>(visibleRoleLinks);

        for (const testId of [
            'main-menu-nav-home',
            'main-menu-nav-clubs-and-tournaments',
            'main-menu-nav-about-and-contact-us',
            ...visibleRoleLinks,
        ]) {
            expect(screen.getByTestId(testId)).toBeInTheDocument();
        }

        for (const testId of [
            'main-menu-nav-matches-and-kudos',
            'main-menu-nav-kudos-standings',
            CAPTAIN_ITEM,
            'main-menu-nav-my-club-teams',
            'main-menu-nav-my-club-standings',
            'main-menu-nav-promote-my-club',
            'main-menu-nav-promote-my-tournaments',
        ]) {
            if (!visibleRoleLinkSet.has(testId)) {
                expect(screen.queryByTestId(testId)).not.toBeInTheDocument();
            }
        }
    });

    it('leaves the player items visible, and the club-manager items hidden, for a captain', () => {
        setAuth({ isAuthenticated: true, isPlayerOrCaptain: true, isCaptain: true });

        renderAndOpenMenu();

        expect(screen.getByTestId('main-menu-nav-matches-and-kudos')).toHaveAttribute('href', '/kudos');
        expect(screen.getByTestId('main-menu-nav-kudos-standings')).toHaveAttribute('href', '/kudos-standings');
        expect(screen.getByTestId('main-menu-nav-home')).toHaveAttribute('href', '/');
        expect(screen.queryByTestId('main-menu-nav-my-club-teams')).toBeNull();
        expect(screen.queryByTestId('main-menu-nav-promote-my-club')).toBeNull();
    });

    it('keeps player-only destinations in the default style for a player', () => {
        setAuth({ isAuthenticated: true, isPlayerOrCaptain: true });

        renderAndOpenMenu();

        for (const testId of ['main-menu-nav-matches-and-kudos', 'main-menu-nav-kudos-standings']) {
            expect(screen.getByTestId(testId)).toHaveClass('text-main-text');
            expect(screen.getByTestId(testId)).not.toHaveClass('text-club-manager-accent');
        }
    });

    it('renders the captain item in the default colour, not the club-manager accent', () => {
        setAuth({ isAuthenticated: true, isPlayerOrCaptain: true, isCaptain: true });

        renderAndOpenMenu();

        const link = screen.getByTestId(CAPTAIN_ITEM);
        expect(link.className).toContain('text-main-text');
        expect(link.className).not.toContain('text-club-manager-accent');
    });

    it('shows Login and public navigation to an unauthenticated user, then closes after selecting Login', () => {
        setAuth({ isAuthenticated: false });

        renderAndOpenMenu();

        const overlay = screen.getByTestId('main-menu-overlay');
        expect(overlay.className).toContain('pointer-events-auto');
        expect(screen.getByTestId('main-menu-login-link')).toHaveAttribute('href', '/login');
        expect(screen.getByTestId('main-menu-nav-home')).toHaveAttribute('href', '/');
        expect(screen.getByTestId('main-menu-nav-clubs-and-tournaments')).toBeInTheDocument();
        expect(screen.getByTestId('main-menu-nav-about-and-contact-us')).toBeInTheDocument();
        expect(screen.queryByTestId('main-menu-logout-button')).not.toBeInTheDocument();
        expect(screen.queryByTestId('main-menu-nav-matches-and-kudos')).toBeNull();
        expect(screen.queryByTestId('main-menu-nav-kudos-standings')).toBeNull();
        expect(screen.queryByTestId(CAPTAIN_ITEM)).toBeNull();
        expect(screen.queryByTestId('main-menu-nav-my-club-teams')).toBeNull();

        fireEvent.click(screen.getByTestId('main-menu-login-link'));
        expect(overlay.className).toContain('pointer-events-none');
    });

    it('navigates to a selected destination and closes the menu', () => {
        setAuth({ isAuthenticated: true, isPlayerOrCaptain: true });

        render(
            <MemoryRouter initialEntries={['/']}>
                <MainMenu />
                <CurrentLocation />
            </MemoryRouter>
        );
        fireEvent.click(screen.getByTestId('main-menu-toggle'));
        fireEvent.click(screen.getByTestId('main-menu-nav-matches-and-kudos'));

        expect(screen.getByTestId('current-location')).toHaveTextContent('/kudos');
        expect(screen.getByTestId('main-menu-overlay').className).toContain('pointer-events-none');
    });

    it('returns to Home from a nested destination and closes the menu', () => {
        setAuth({ isAuthenticated: true });

        render(
            <MemoryRouter initialEntries={['/kudos']}>
                <MainMenu />
                <CurrentLocation />
            </MemoryRouter>
        );
        fireEvent.click(screen.getByTestId('main-menu-toggle'));
        fireEvent.click(screen.getByTestId('main-menu-nav-home'));

        expect(screen.getByTestId('current-location').textContent).toBe('/');
        expect(screen.getByTestId('main-menu-overlay').className).toContain('pointer-events-none');
    });

    it('shows club-management links with the manager accent to a club manager, while shared links keep the default style', () => {
        setAuth({ isAuthenticated: true, isClubManager: true });

        renderAndOpenMenu();

        for (const testId of [
            'main-menu-nav-my-club-teams',
            'main-menu-nav-my-club-standings',
            'main-menu-nav-promote-my-club',
            'main-menu-nav-promote-my-tournaments'
        ]) {
            expect(screen.getByTestId(testId)).toHaveClass('text-club-manager-accent');
        }
        expect(screen.getByTestId('main-menu-nav-my-club-teams')).toHaveAttribute('href', '/my-club-teams');
        expect(screen.getByTestId('main-menu-nav-my-club-standings')).toHaveAttribute('href', '/my-club-standings');
        expect(screen.getByTestId('main-menu-nav-promote-my-club')).toHaveAttribute('href', '/promote-my-club');
        expect(screen.getByTestId('main-menu-nav-promote-my-tournaments')).toHaveAttribute('href', '/promote-my-tournaments');
        expect(screen.getByTestId('main-menu-nav-clubs-and-tournaments')).toHaveAttribute('href', '/clubs-and-tournaments');
        expect(screen.getByTestId('main-menu-nav-about-and-contact-us')).toHaveAttribute('href', '/about-and-contact-us');
        expect(screen.getByTestId('main-menu-nav-clubs-and-tournaments')).toHaveClass('text-main-text');
        expect(screen.getByTestId('main-menu-nav-clubs-and-tournaments')).not.toHaveClass('text-club-manager-accent');
        expect(screen.queryByTestId('main-menu-nav-matches-and-kudos')).toBeNull();
    });

    it('renders the current user information from the first season, club, and additional seasons', () => {
        setAuth(
            { isAuthenticated: true, isPlayerOrCaptain: true },
            {
                activeSeasons: [
                    { league: 'CLTTL', season: '2026-2027', team_name: 'Morpeth 9', team_division: 'Division Four', person_name: 'First Player' },
                    { league: 'CLTTL', season: '2026-2027', team_name: 'Morpeth 10', team_division: 'Division Five', person_name: 'Second Player' }
                ],
                managedClubs: [
                    { league: 'CLTTL', season: '2026-2027', club_name: 'Morpeth', club_location: 'Bethnal Green', manager_name: 'Club Manager' }
                ]
            }
        );

        renderAndOpenMenu();

        expect(screen.getByTestId('main-menu-welcome-message').textContent).toBe('Welcome, First Player');
        expect(screen.getByTestId('main-menu-managed-club')).toHaveTextContent('MANAGER: Morpeth, Bethnal Green (CLTTL 2026-2027)');
        expect(screen.getByTestId('main-menu-first-season')).toHaveTextContent('CLTTL 2026-2027 - Morpeth 9, Division Four');
        expect(screen.getByTestId('main-menu-additional-season')).toHaveTextContent('CLTTL 2026-2027 - Morpeth 10, Division Five (Second Player)');
    });

    it('signs out when Log out is selected', async () => {
        const signOut = vi.fn();
        vi.useFakeTimers();
        setAuth({ isAuthenticated: true }, { signOut });

        render(
            <MemoryRouter initialEntries={['/kudos']}>
                <MainMenu />
                <CurrentLocation />
            </MemoryRouter>
        );
        expect(screen.getByTestId('current-location')).toHaveTextContent('/kudos');
        fireEvent.click(screen.getByTestId('main-menu-toggle'));
        fireEvent.click(screen.getByTestId('main-menu-logout-button'));

        expect(signOut).toHaveBeenCalledTimes(1);
        expect(drainFrontendEvents).toHaveBeenCalledOnce();
        expect(screen.getByTestId('main-menu-overlay').className).toContain('pointer-events-none');
        await act(async () => { await vi.runAllTimersAsync(); });
        expect(screen.getByTestId('current-location').textContent).toBe('/');
        vi.useRealTimers();
    });

    it('shows a clear login error if Cognito cache cleanup fails during sign-out', () => {
        const signOut = vi.fn(() => {
            throw new Error('Cognito storage cleanup failed');
        });
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        setAuth({ isAuthenticated: true }, { signOut });

        render(
            <MemoryRouter initialEntries={['/clubs-and-tournaments', '/kudos']} initialIndex={1}>
                <MainMenu />
                <CurrentLocation />
                <NavigateBack />
            </MemoryRouter>
        );
        fireEvent.click(screen.getByTestId('main-menu-toggle'));
        fireEvent.click(screen.getByTestId('main-menu-logout-button'));

        expect(signOut).toHaveBeenCalledOnce();
        expect(consoleError).toHaveBeenCalledOnce();
        expect(screen.getByTestId('current-location')).toHaveTextContent('/login');
        expect(screen.getByTestId('current-location-error')).toHaveTextContent(
            'There was a problem signing out from your session. Please refresh the page and try again. If the problem persists, contact us.'
        );
        fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
        expect(screen.getByTestId('current-location')).toHaveTextContent('/clubs-and-tournaments');
        consoleError.mockRestore();
    });

    it('uses the username when no season or club record supplies a display name', () => {
        setAuth({ isAuthenticated: true }, { activeSeasons: [], managedClubs: [] });

        renderAndOpenMenu(true);

        expect(screen.getByTestId('main-menu-welcome-message')).toHaveTextContent('Welcome, Luca');
        expect(screen.queryByTestId('main-menu-unexpected-error')).toBeNull();
    });

    it('uses the first managed club manager name when no active season supplies a display name', () => {
        setAuth(
            { isAuthenticated: true, isClubManager: true },
            {
                activeSeasons: [],
                managedClubs: [
                    { league: 'CLTTL', season: '2026-2027', club_name: 'Morpeth', club_location: 'London', manager_name: 'Mara' },
                ],
            }
        );

        renderAndOpenMenu();

        expect(screen.getByTestId('main-menu-welcome-message')).toHaveTextContent('Welcome, Mara');
    });

    it('falls back to the managed club manager name when the first season has no person name', () => {
        setAuth(
            { isAuthenticated: true, isClubManager: true },
            {
                activeSeasons: [
                    { league: 'CLTTL', season: '2026-2027', team_name: 'Morpeth 9', team_division: 'Division Four', person_name: null },
                ],
                managedClubs: [
                    { league: 'CLTTL', season: '2026-2027', club_name: 'Morpeth', club_location: 'London', manager_name: 'Mara' },
                ],
            }
        );

        renderAndOpenMenu();

        expect(screen.getByTestId('main-menu-welcome-message')).toHaveTextContent('Welcome, Mara');
    });

    it('shows the account-details warning when attributes could not be loaded', () => {
        setAuth(
            { isAuthenticated: true },
            { userAttributesLoadFailed: true }
        );

        renderAndOpenMenu();

        const warning = screen.getByTestId('main-menu-user-attributes-warning');
        expect(warning).toHaveAttribute('role', 'status');
        expect(warning).toHaveTextContent(
            '⚠️ There is a temporary problem loading your account details. Please refresh the page later. If the problem persists, contact us.'
        );
        expect(warning.compareDocumentPosition(screen.getByTestId('main-menu-user-info')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('does not repeat the first player or manager name in the additional records', () => {
        setAuth(
            { isAuthenticated: true, isPlayerOrCaptain: true },
            {
                activeSeasons: [
                    { league: 'CLTTL', season: '2026-2027', team_name: 'Morpeth 9', team_division: 'Division Four', person_name: 'Luca' },
                    { league: 'CLTTL', season: '2026-2027', team_name: 'Morpeth 10', team_division: 'Division Five', person_name: 'Luca' }
                ],
                managedClubs: [
                    { league: 'CLTTL', season: '2026-2027', club_name: 'Morpeth', club_location: 'Bethnal Green', manager_name: 'Luca' },
                    { league: 'BCS', season: '2026-2027', club_name: 'Brighton', club_location: 'Brighton', manager_name: 'Luca' }
                ]
            }
        );

        renderAndOpenMenu();

        expect(screen.getAllByTestId('main-menu-managed-club')[1]).toHaveTextContent(
            /^MANAGER: Brighton, Brighton \(BCS 2026-2027\)$/
        );
        expect(screen.getByTestId('main-menu-additional-season')).toHaveTextContent(
            /^CLTTL 2026-2027 - Morpeth 10, Division Five$/
        );
    });

    it('identifies a different manager on an additional club', () => {
        setAuth(
            { isAuthenticated: true, isClubManager: true },
            {
                managedClubs: [
                    { league: 'CLTTL', season: '2026-2027', club_name: 'Morpeth', club_location: 'Bethnal Green', manager_name: 'Luca' },
                    { league: 'BCS', season: '2026-2027', club_name: 'Brighton', club_location: 'Brighton', manager_name: 'Sam' }
                ]
            }
        );

        renderAndOpenMenu();

        expect(screen.getAllByTestId('main-menu-managed-club')[1]).toHaveTextContent('MANAGER: Brighton, Brighton (BCS 2026-2027) (Sam)');
    });
});

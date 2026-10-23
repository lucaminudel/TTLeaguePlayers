import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MainMenu } from '../../../../src/components/navigation/MainMenu';

const mockUseAuth = vi.fn();
vi.mock('../../../../src/hooks/useAuth', () => ({
    useAuth: () => mockUseAuth() as unknown,
}));

describe('MainMenu', () => {
    const CAPTAIN_ITEM = 'main-menu-nav-invite-team-members';

    const setAuth = (
        flags: { isAuthenticated: boolean; isPlayerOrCaptain?: boolean; isClubManager?: boolean; isCaptain?: boolean },
        details: { activeSeasons?: unknown[]; managedClubs?: unknown[]; signOut?: ReturnType<typeof vi.fn> } = {}
    ) => {
        mockUseAuth.mockReturnValue({
            isAuthenticated: flags.isAuthenticated,
            isPlayerOrCaptain: flags.isPlayerOrCaptain ?? false,
            isClubManager: flags.isClubManager ?? false,
            isCaptain: flags.isCaptain ?? false,
            username: 'Luca',
            activeSeasons: details.activeSeasons ?? [],
            managedClubs: details.managedClubs ?? [],
            signOut: details.signOut ?? vi.fn(),
        });
    };

    const renderAndOpenMenu = () => {
        render(
            <MemoryRouter>
                <MainMenu />
            </MemoryRouter>
        );
        fireEvent.click(screen.getByTestId('main-menu-toggle'));
    };

    beforeEach(() => {
        vi.clearAllMocks();
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

    it('leaves the player items visible, and the club-manager items hidden, for a captain', () => {
        setAuth({ isAuthenticated: true, isPlayerOrCaptain: true, isCaptain: true });

        renderAndOpenMenu();

        expect(screen.getByTestId('main-menu-nav-matches-and-kudos')).toBeTruthy();
        expect(screen.getByTestId('main-menu-nav-kudos-standings')).toBeTruthy();
        expect(screen.getByTestId('main-menu-nav-home')).toBeTruthy();
        expect(screen.queryByTestId('main-menu-nav-my-club-teams')).toBeNull();
        expect(screen.queryByTestId('main-menu-nav-promote-my-club')).toBeNull();
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
        expect(screen.queryByTestId('main-menu-nav-matches-and-kudos')).toBeNull();

        fireEvent.click(screen.getByTestId('main-menu-login-link'));
        expect(overlay.className).toContain('pointer-events-none');
    });

    it('shows club-management links with the manager accent to a club manager', () => {
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

        expect(screen.getByTestId('main-menu-welcome-message')).toHaveTextContent('Welcome, First Player');
        expect(screen.getByTestId('main-menu-managed-club')).toHaveTextContent('MANAGER: Morpeth, Bethnal Green (CLTTL 2026-2027)');
        expect(screen.getByTestId('main-menu-first-season')).toHaveTextContent('CLTTL 2026-2027 - Morpeth 9, Division Four');
        expect(screen.getByTestId('main-menu-additional-season')).toHaveTextContent('CLTTL 2026-2027 - Morpeth 10, Division Five (Second Player)');
    });

    it('signs out when Log out is selected', () => {
        const signOut = vi.fn();
        setAuth({ isAuthenticated: true }, { signOut });

        renderAndOpenMenu();
        fireEvent.click(screen.getByTestId('main-menu-logout-button'));

        expect(signOut).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId('main-menu-overlay').className).toContain('pointer-events-none');
    });
});

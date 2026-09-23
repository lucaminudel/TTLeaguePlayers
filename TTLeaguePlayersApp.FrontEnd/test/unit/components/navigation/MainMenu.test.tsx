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

    const setAuth = (flags: { isAuthenticated: boolean; isPlayerOrCaptain?: boolean; isClubManager?: boolean; isCaptain?: boolean }) => {
        mockUseAuth.mockReturnValue({
            isAuthenticated: flags.isAuthenticated,
            isPlayerOrCaptain: flags.isPlayerOrCaptain ?? false,
            isClubManager: flags.isClubManager ?? false,
            isCaptain: flags.isCaptain ?? false,
            username: 'Luca',
            activeSeasons: [],
            managedClubs: [],
            signOut: vi.fn(),
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
});

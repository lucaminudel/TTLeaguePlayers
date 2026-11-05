import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { Home } from '../../../src/pages/Home';

const mockUseAuth = vi.hoisted(() => vi.fn());
vi.mock('../../../src/hooks/useAuth', () => ({
    useAuth: () => mockUseAuth() as unknown,
}));

const LocationProbe = () => {
    const { pathname } = useLocation();
    return <output data-testid="current-path">{pathname}</output>;
};

const authState = (managedClubs: { club_name: string }[] = []) => ({
    isAuthenticated: false,
    isPlayerOrCaptain: false,
    isClubManager: managedClubs.length > 0,
    isCaptain: false,
    username: null,
    activeSeasons: [],
    managedClubs,
    userAttributesLoadFailed: false,
    signOut: vi.fn(),
});

const renderHome = (entry: string) => render(
    <MemoryRouter initialEntries={[entry]}>
        <Routes>
            <Route path="/invite/:inviteId" element={<Home />} />
            <Route path="*" element={<Home />} />
        </Routes>
        <LocationProbe />
    </MemoryRouter>
);

describe('Home', () => {
    beforeEach(() => {
        mockUseAuth.mockReturnValue(authState());
    });

    it('shows the home content and sends a visitor to Kudos', () => {
        renderHome('/');

        expect(screen.getByRole('heading', { name: 'Welcome' })).toBeInTheDocument();
        expect(screen.getByRole('img', { name: 'Table Tennis League Players' })).toBeInTheDocument();
        expect(screen.getByText(/Find local clubs & tournaments/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Ready to play?' })).toHaveAttribute('type', 'button');

        fireEvent.click(screen.getByTestId('home-enter-button'));

        expect(screen.getByTestId('current-path')).toHaveTextContent('/kudos');
    });

    it('sends a user who manages a club to club promotion', () => {
        mockUseAuth.mockReturnValue({
            ...authState([{ club_name: 'Walworth TTC' }]),
            isAuthenticated: true,
        });
        renderHome('/');

        fireEvent.click(screen.getByTestId('home-enter-button'));

        expect(screen.getByTestId('current-path')).toHaveTextContent('/promote-my-club');
    });

    it('redeems an invite from the invite-specific home route', () => {
        renderHome('/invite/invite-123');

        expect(screen.getByRole('button', { name: 'Redeem your invite' })).toBeInTheDocument();
        fireEvent.click(screen.getByTestId('home-enter-button'));

        expect(screen.getByTestId('current-path')).toHaveTextContent('/join/invite-123');
    });
});

import { type ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/App';

const mocks = vi.hoisted(() => ({ auth: { isLoading: false } }));

vi.mock('../../src/contexts/AuthContext', () => ({
    AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('../../src/hooks/useAuth', () => ({ useAuth: () => mocks.auth }));
vi.mock('../../src/components/common/ProtectedRoute', () => ({
    ProtectedRoute: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('../../src/pages/Home', () => ({ Home: () => <div data-testid="home-page" /> }));
vi.mock('../../src/pages/Join', () => ({ Join: () => <div data-testid="join-page" /> }));
vi.mock('../../src/pages/Login', () => ({ Login: () => <div data-testid="login-page" /> }));
vi.mock('../../src/pages/Register', () => ({ Register: () => <div data-testid="register-page" /> }));
vi.mock('../../src/pages/ForgotPassword', () => ({ ForgotPassword: () => <div data-testid="forgot-password-page" /> }));
vi.mock('../../src/pages/Kudos', () => ({ Kudos: () => <div data-testid="kudos-page" /> }));
vi.mock('../../src/pages/AwardKudos', () => ({ AwardKudos: () => <div data-testid="award-kudos-page" /> }));
vi.mock('../../src/pages/KudosStandings', () => ({ KudosStandings: () => <div data-testid="kudos-standings-page" /> }));
vi.mock('../../src/pages/ClubsAndTournaments', () => ({ ClubsAndTournaments: () => <div data-testid="clubs-page" /> }));
vi.mock('../../src/pages/AboutAndContactUs', () => ({ AboutAndContactUs: () => <div data-testid="about-page" /> }));
vi.mock('../../src/pages/MyClubStandings', () => ({ MyClubStandings: () => <div data-testid="my-club-standings-page" /> }));
vi.mock('../../src/pages/PromoteMyClub', () => ({ PromoteMyClub: () => <div data-testid="promote-club-page" /> }));
vi.mock('../../src/pages/PromoteMyTournaments', () => ({ PromoteMyTournaments: () => <div data-testid="promote-tournaments-page" /> }));
vi.mock('../../src/pages/MyClubTeams', () => ({ MyClubTeams: () => <div data-testid="my-club-teams-page" /> }));
vi.mock('../../src/pages/InviteTeamMembers', () => ({ InviteTeamMembers: () => <div data-testid="invite-team-members-page" /> }));
vi.mock('../../src/pages/ExternalContractsLiveTesting', () => ({
    ExternalContractsLiveTesting: () => <div data-testid="external-contracts-page" />,
}));

describe('App routes', () => {
    beforeEach(() => {
        mocks.auth.isLoading = false;
    });

    afterEach(() => {
        window.location.hash = '#/';
    });

    it.each([
        ['/', 'home-page'],
        ['/invite-token', 'home-page'],
        ['/join/invite-token', 'join-page'],
        ['/login', 'login-page'],
        ['/register', 'register-page'],
        ['/forgot-password', 'forgot-password-page'],
        ['/kudos', 'kudos-page'],
        ['/award-kudos', 'award-kudos-page'],
        ['/kudos-standings', 'kudos-standings-page'],
        ['/my-club-standings', 'my-club-standings-page'],
        ['/promote-my-club', 'promote-club-page'],
        ['/promote-my-tournaments', 'promote-tournaments-page'],
        ['/my-club-teams', 'my-club-teams-page'],
        ['/invite-team-members', 'invite-team-members-page'],
        ['/clubs-and-tournaments', 'clubs-page'],
        ['/about-and-contact-us', 'about-page'],
    ])('renders %s at its matching route', async (path, pageTestId) => {
        window.location.hash = `#${path}`;

        render(<App />);

        expect(await screen.findByTestId(pageTestId)).toBeInTheDocument();
    });

    it('holds routes behind the initial authentication check', () => {
        mocks.auth.isLoading = true;
        window.location.hash = '#/kudos';

        render(<App />);

        expect(screen.getByText('Initializing...')).toBeInTheDocument();
        expect(screen.queryByTestId('kudos-page')).not.toBeInTheDocument();
    });

    it('exposes the external contract route only outside production', async () => {
        window.location.hash = '#/external-contracts-live';
        render(<App />);

        if (import.meta.env.ENVIRONMENT === 'prod') {
            expect(screen.queryByTestId('external-contracts-page')).not.toBeInTheDocument();
        } else {
            expect(await screen.findByTestId('external-contracts-page')).toBeInTheDocument();
        }
    });
});

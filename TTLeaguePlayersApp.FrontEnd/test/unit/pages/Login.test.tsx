import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Login, type LoginNavigationState } from '../../../src/pages/Login';
import type { ActiveSeason, ManagedClub, SignInProfile } from '../../../src/contexts/AuthContextDefinition';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

const mockUseAuth = vi.fn();
vi.mock('../../../src/hooks/useAuth', () => ({
    useAuth: () => mockUseAuth() as unknown,
}));

const PASSWORD = 'aA1!56789012';

const activeSeason: ActiveSeason = {
    league: 'CLTTL',
    season: '2025-2026',
    team_name: 'Morpeth 10',
    team_division: 'Division 4',
    person_name: 'Luca Minudel',
    role: 'PLAYER',
    latest_kudos: [],
};

const managedClub: ManagedClub = {
    league: 'CLTTL',
    season: '2025-2026',
    club_name: 'Morpeth Table Tennis Club',
    club_location: 'London',
    manager_name: 'Luca Minudel',
};

describe('Login page', () => {
    const signIn = vi.fn<(email: string, password: string) => Promise<SignInProfile>>();
    const clearAuthError = vi.fn();

    const setAuthMock = (authError: string | null = null) => {
        mockUseAuth.mockReturnValue({
            isAuthenticated: false,
            email: null,
            username: null,
            activeSeasons: [],
            managedClubs: [],
            isPlayerOrCaptain: false,
            isClubManager: false,
            signOut: vi.fn(),
            refreshActiveSeasons: vi.fn(),
            signIn,
            authError,
            clearAuthError,
        });
    };

    beforeEach(() => {
        vi.clearAllMocks();
        signIn.mockResolvedValue({ seasons: [], clubs: [] });
        setAuthMock();
    });

    const renderLoginPage = (query = '', state?: LoginNavigationState) => render(
        <MemoryRouter initialEntries={[{ pathname: '/login', search: query, state }]}>
            <Routes>
                <Route path="/login" element={<Login />} />
            </Routes>
        </MemoryRouter>
    );

    const emailInput = () => screen.getByLabelText<HTMLInputElement>('Email');
    const forgotPasswordLink = () => screen.getByTestId('login-forgot-password-link');

    const typeEmail = (email: string) => {
        fireEvent.change(emailInput(), { target: { value: email } });
    };

    const signInWith = (password = PASSWORD) => {
        fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
        fireEvent.click(screen.getByTestId('login-submit-button'));
    };

    describe('the forgot-password link', () => {
        it('carries the typed email as an editable pre-fill', () => {
            renderLoginPage();
            typeEmail('a@b.com');

            expect(forgotPasswordLink()).toHaveAttribute('href', '/forgot-password?prefillEmail=a%40b.com');
        });

        it('carries the locked ?email as a locked email', () => {
            renderLoginPage('?email=a%40b.com');

            expect(forgotPasswordLink()).toHaveAttribute('href', '/forgot-password?email=a%40b.com');
        });

        it('carries no email when none was typed', () => {
            renderLoginPage();

            expect(forgotPasswordLink()).toHaveAttribute('href', '/forgot-password');
        });

        it('carries the returnUrl', () => {
            renderLoginPage('?email=a%40b.com&returnUrl=%2Fkudos');

            expect(forgotPasswordLink()).toHaveAttribute('href', '/forgot-password?email=a%40b.com&returnUrl=%2Fkudos');
        });
    });

    describe('after a password reset (?reset=success)', () => {
        it('shows the success line', () => {
            renderLoginPage('?reset=success');

            expect(screen.getByTestId('login-success-message'))
                .toHaveTextContent('Your password has been reset. Log in with your new password.');
        });

        it('hides the success line while an error is shown', () => {
            setAuthMock('Incorrect username or password.');
            renderLoginPage('?reset=success');

            expect(screen.getByTestId('login-error-message')).toHaveTextContent('Incorrect username or password.');
            expect(screen.queryByTestId('login-success-message')).not.toBeInTheDocument();
        });
    });

    describe('the email field', () => {
        it('is pre-filled and locked when the email comes from ?email', () => {
            renderLoginPage('?email=a%40b.com');

            expect(emailInput().value).toBe('a@b.com');
            expect(emailInput()).toBeDisabled();
        });

        it('is empty and editable without ?email', () => {
            renderLoginPage();

            expect(emailInput().value).toBe('');
            expect(emailInput()).toBeEnabled();
        });
    });

    describe('a successful sign-in goes to', () => {
        it('the home page without a returnUrl', async () => {
            renderLoginPage('?email=a%40b.com');
            signInWith();

            await waitFor(() => { expect(mockNavigate).toHaveBeenCalledWith('/'); });
            expect(signIn).toHaveBeenCalledWith('a@b.com', PASSWORD);
        });

        it('the returnUrl', async () => {
            renderLoginPage('?email=a%40b.com&returnUrl=%2Fmy-club-teams');
            signInWith();

            await waitFor(() => { expect(mockNavigate).toHaveBeenCalledWith('/my-club-teams'); });
        });

        it('the home page when the returnUrl encoding is malformed', async () => {
            renderLoginPage('?email=a%40b.com&returnUrl=%25E0%25A4%25A');
            signInWith();

            await waitFor(() => { expect(mockNavigate).toHaveBeenCalledWith('/'); });
        });

        it('Promote My Club instead of /kudos for a club manager with no active seasons', async () => {
            signIn.mockResolvedValue({ seasons: [], clubs: [managedClub] });
            renderLoginPage('?email=a%40b.com&returnUrl=%2Fkudos');
            signInWith();

            await waitFor(() => { expect(mockNavigate).toHaveBeenCalledWith('/promote-my-club'); });
        });

        it('/kudos for a club manager who also has an active season', async () => {
            signIn.mockResolvedValue({ seasons: [activeSeason], clubs: [managedClub] });
            renderLoginPage('?email=a%40b.com&returnUrl=%2Fkudos');
            signInWith();

            await waitFor(() => { expect(mockNavigate).toHaveBeenCalledWith('/kudos'); });
        });
    });

    describe('an account whose email was never verified goes to the email verification', () => {
        beforeEach(() => {
            signIn.mockRejectedValue({ code: 'UserNotConfirmedException', message: 'User is not confirmed.' });
        });

        it('without a returnUrl', async () => {
            renderLoginPage('?email=a%40b.com');
            signInWith();

            await waitFor(() => { expect(mockNavigate).toHaveBeenCalledWith('/register?email=a%40b.com&verify=true'); });
        });

        it('keeping the returnUrl', async () => {
            renderLoginPage('?email=a%40b.com&returnUrl=%2Fkudos');
            signInWith();

            await waitFor(() => {
                expect(mockNavigate).toHaveBeenCalledWith('/register?email=a%40b.com&verify=true&returnUrl=%2Fkudos');
            });
        });
    });

    it('asks to reload the page when the auth initialisation has failed', async () => {
        signIn.mockRejectedValue(new Error('AuthProvider.initAuth() has failed. authInitialisationError: boom'));
        renderLoginPage('?email=a%40b.com');
        signInWith();

        expect(await screen.findByTestId('login-error-message'))
            .toHaveTextContent('Unexpected authentication initialisation error: reload the page and try again.');
        expect(mockNavigate).not.toHaveBeenCalled();
    });

    describe('errors from other pages', () => {
        it('an auth error left by another page is cleared once, on open', () => {
            renderLoginPage();

            expect(clearAuthError).toHaveBeenCalledTimes(1);
        });

        it('an error handed over in the navigation state is shown until Sign In is pressed', async () => {
            const signInStillInProgress = new Promise<SignInProfile>(() => undefined);
            signIn.mockReturnValue(signInStillInProgress);
            renderLoginPage('?email=a%40b.com', { errorFromPreviousPage: 'User already exists' });

            expect(screen.getByTestId('login-error-message')).toHaveTextContent('User already exists');

            signInWith();

            await waitFor(() => { expect(screen.queryByTestId('login-error-message')).not.toBeInTheDocument(); });
        });
    });
});

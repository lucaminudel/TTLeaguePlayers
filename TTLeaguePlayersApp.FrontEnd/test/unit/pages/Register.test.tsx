import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { Register } from '../../../src/pages/Register';
import { GeneralApiError } from '../../../src/api/api';
import type { Invite } from '../../../src/types/invite';

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

const acceptInviteApi = vi.fn<(nanoId: string, acceptedAt: number) => Promise<Invite>>();
vi.mock('../../../src/api/inviteApi', () => ({
    inviteApi: {
        acceptInvite: (nanoId: string, acceptedAt: number) => acceptInviteApi(nanoId, acceptedAt),
    },
}));

const PASSWORD = 'aA1!56789012';
const AUTH_INIT_FAILURE = new Error('AuthProvider.initAuth() has failed. authInitialisationError: boom');
const USER_INIT_ERROR_MESSAGE = 'Unexpected authentication initialisation error: reload the page and try again.';
const NON_RETRYABLE_API_ERROR = new GeneralApiError('Bad Request', 400);

const invite: Invite = {
    nano_id: 'invite-nano-id',
    invited_by: 'Admin',
    invitee_name: 'Luca Minudel',
    invitee_email_id: 'invitee@b.com',
    invitee_role: 'PLAYER',
    invitee_team: 'Morpeth 10',
    team_division: 'Division 4',
    league: 'CLTTL',
    season: '2025-2026',
    created_at: 1715080000,
    accepted_at: null,
};

const captainInvite: Invite = {
    ...invite,
    invitee_role: 'CAPTAIN',
};

const clubManagerInvite: Invite = {
    nano_id: 'club-manager-invite-id',
    invited_by: 'Admin',
    invitee_name: 'Club Manager',
    invitee_email_id: 'manager@b.com',
    invitee_role: 'CLUB_MANAGER',
    invitee_club: 'Morpeth',
    club_location: 'Northumberland',
    league: 'CLTTL',
    season: '2025-2026',
    created_at: 1715080000,
    accepted_at: null,
};

describe('Register page', () => {
    const signUp = vi.fn<(email: string, password: string) => Promise<void>>();
    const confirmSignUp = vi.fn<(email: string, code: string) => Promise<void>>();
    const resendConfirmationCode = vi.fn<(email: string) => Promise<void>>();

    beforeEach(() => {
        vi.clearAllMocks();
        signUp.mockResolvedValue(undefined);
        confirmSignUp.mockResolvedValue(undefined);
        resendConfirmationCode.mockResolvedValue(undefined);
        acceptInviteApi.mockResolvedValue({ ...invite, accepted_at: 1715090000 });
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
            signUp,
            confirmSignUp,
            resendConfirmationCode,
        });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    const renderRegisterPage = (query = '', invitation?: unknown) => render(
        <MemoryRouter initialEntries={[{ pathname: '/register', search: query, state: invitation ? { invite: invitation } : null }]}>
            <Routes>
                <Route path="/register" element={<Register />} />
            </Routes>
        </MemoryRouter>
    );

    const renderVerifyEmailStep = (query = '') => renderRegisterPage(`?email=a%40b.com&verify=true${query}`);

    const emailInput = () => screen.getByLabelText<HTMLInputElement>('Email');
    const passwordInput = () => screen.getByLabelText<HTMLInputElement>('Password');
    const confirmPasswordInput = () => screen.getByLabelText<HTMLInputElement>('Confirm Password');

    const register = (email?: string) => {
        if (email !== undefined) {
            fireEvent.change(emailInput(), { target: { value: email } });
        }
        fireEvent.change(passwordInput(), { target: { value: PASSWORD } });
        fireEvent.change(confirmPasswordInput(), { target: { value: PASSWORD } });
        fireEvent.click(screen.getByTestId('register-submit-button'));
    };

    const verifyWithCode = (code: string) => {
        fireEvent.change(screen.getByLabelText('Verification Code'), { target: { value: code } });
        fireEvent.click(screen.getByTestId('register-verify-button'));
    };

    describe('with an invite', () => {
        it('pre-fills and locks the invitee email, and puts the cursor in the password', () => {
            renderRegisterPage('', invite);

            expect(emailInput().value).toBe('invitee@b.com');
            expect(emailInput()).toBeDisabled();
            expect(passwordInput()).toHaveFocus();
            expect(screen.getByTestId('register-invite-details'))
                .toHaveTextContent('Luca Minudel, Player');
            expect(screen.getByTestId('register-invite-details'))
                .toHaveTextContent('CLTTL 2025-2026, Morpeth 10 - Division 4');
        });

        it('renders the invite details when the optional role is absent', () => {
            const inviteWithoutRole = { ...invite, invitee_role: undefined };
            renderRegisterPage('', inviteWithoutRole);

            expect(screen.getByTestId('register-invite-details'))
                .toHaveTextContent(/^Luca Minudel,\s*CLTTL 2025-2026, Morpeth 10 - Division 4$/);
        });

        it('shows an unrecognized invite role as provided', () => {
            const inviteWithUnknownRole = { ...invite, invitee_role: 'SPECTATOR' };
            renderRegisterPage('', inviteWithUnknownRole);

            expect(screen.getByTestId('register-invite-details'))
                .toHaveTextContent('Luca Minudel, SPECTATOR');
        });

        it('focuses the password field only when an invite is present', () => {
            renderRegisterPage();

            expect(passwordInput()).not.toHaveFocus();
        });

        it('shows the captain role and team details', () => {
            renderRegisterPage('', captainInvite);

            expect(screen.getByTestId('register-invite-details'))
                .toHaveTextContent('Luca Minudel, Team Captain');
            expect(screen.getByTestId('register-invite-details'))
                .toHaveTextContent('CLTTL 2025-2026, Morpeth 10 - Division 4');
        });

        it('shows the club-manager role and club details', () => {
            renderRegisterPage('', clubManagerInvite);

            expect(screen.getByTestId('register-invite-details'))
                .toHaveTextContent('Club Manager, Club Manager');
            expect(screen.getByTestId('register-invite-details'))
                .toHaveTextContent('CLTTL 2025-2026, Morpeth - Northumberland');
        });

        it('accepts the invite after registering, then asks to verify the email', async () => {
            renderRegisterPage('', invite);
            register();

            expect(await screen.findByRole('heading', { name: 'Verify Email' })).toBeInTheDocument();
            expect(signUp).toHaveBeenCalledWith('invitee@b.com', PASSWORD);
            expect(acceptInviteApi).toHaveBeenCalledWith('invite-nano-id', expect.any(Number));
        });

        it('shows the retry-waiting state and locks invite fields while acceptance is retried', async () => {
            vi.useFakeTimers();
            acceptInviteApi
                .mockRejectedValueOnce({ status: 500, message: 'Server error' })
                .mockResolvedValueOnce({ ...invite, accepted_at: 1715090000 });
            renderRegisterPage('', invite);
            register();

            await act(async () => {
                await vi.advanceTimersByTimeAsync(0);
            });

            expect(screen.getByText('Waiting to confirm the invite ...')).toBeInTheDocument();
            expect(emailInput()).toBeDisabled();
            expect(passwordInput()).toBeDisabled();
            expect(confirmPasswordInput()).toBeDisabled();

            await act(async () => {
                await vi.advanceTimersByTimeAsync(10000);
            });

            expect(screen.getByRole('heading', { name: 'Verify Email' })).toBeInTheDocument();
            expect(acceptInviteApi).toHaveBeenCalledTimes(2);
        });

        it('shows the accepting state only while invite acceptance is pending', async () => {
            let resolveAcceptance!: (acceptedInvite: Invite) => void;
            acceptInviteApi.mockImplementation(() => new Promise<Invite>((resolve) => {
                resolveAcceptance = resolve;
            }));
            renderRegisterPage('', invite);
            expect(screen.queryByText('Waiting to confirm the invite ...')).not.toBeInTheDocument();

            register();

            expect(await screen.findByText('Waiting to confirm the invite ...')).toBeInTheDocument();
            await act(async () => {
                resolveAcceptance({ ...invite, accepted_at: 1715090000 });
                await Promise.resolve();
            });

            expect(screen.queryByText('Waiting to confirm the invite ...')).not.toBeInTheDocument();
            expect(screen.getByRole('heading', { name: 'Verify Email' })).toBeInTheDocument();
        });

        it('keeps the verification continuation enabled if passwords change while acceptance is pending', async () => {
            let rejectAcceptance!: (error: Error) => void;
            acceptInviteApi.mockImplementation(() => new Promise<Invite>((_resolve, reject) => {
                rejectAcceptance = reject;
            }));
            renderRegisterPage('', invite);
            register();

            expect(await screen.findByText('Waiting to confirm the invite ...')).toBeInTheDocument();
            fireEvent.change(confirmPasswordInput(), { target: { value: 'different-password' } });
            expect(screen.getByTestId('register-submit-button')).toBeDisabled();

            await act(async () => {
                rejectAcceptance(NON_RETRYABLE_API_ERROR);
                await Promise.resolve();
            });

            const continueButton = await screen.findByRole('button', { name: 'Continue to Email Verification' });
            expect(continueButton).toBeEnabled();
            fireEvent.click(continueButton);
            expect(await screen.findByRole('heading', { name: 'Verify Email' })).toBeInTheDocument();
        });

        it('keeps the loading submit action visible while accepting an existing user invite', async () => {
            signUp.mockRejectedValue({ code: 'UsernameExistsException', message: 'User already exists' });
            let resolveAcceptance!: (acceptedInvite: Invite) => void;
            acceptInviteApi.mockImplementation(() => new Promise<Invite>((resolve) => {
                resolveAcceptance = resolve;
            }));
            renderRegisterPage('', invite);
            register();

            await act(async () => {
                await Promise.resolve();
            });

            const submitButton = await screen.findByTestId('register-submit-button');
            expect(submitButton).toBeDisabled();
            expect(submitButton).toHaveTextContent('Creating account...');
            expect(acceptInviteApi).toHaveBeenCalledWith('invite-nano-id', expect.any(Number));

            await act(async () => {
                resolveAcceptance({ ...invite, accepted_at: 1715090000 });
                await Promise.resolve();
            });

            await waitFor(() => {
                expect(mockNavigate).toHaveBeenCalledWith('/login', {
                    state: { errorFromPreviousPage: 'User already exists' },
                });
            });
        });

        describe('for an email that already has an account, accepts the invite and goes to Login with', () => {
            it("Cognito's message", async () => {
                signUp.mockRejectedValue({ code: 'UsernameExistsException', message: 'User already exists' });
                renderRegisterPage('', invite);
                register();

                await waitFor(() => {
                    expect(mockNavigate).toHaveBeenCalledWith('/login', { state: { errorFromPreviousPage: 'User already exists' } });
                });
                expect(acceptInviteApi).toHaveBeenCalledWith('invite-nano-id', expect.any(Number));
            });

            it('a generic message when Cognito gives none', async () => {
                signUp.mockRejectedValue({ code: 'UsernameExistsException' });
                renderRegisterPage('', invite);
                register();

                await waitFor(() => {
                    expect(mockNavigate).toHaveBeenCalledWith('/login', { state: { errorFromPreviousPage: 'Registration failed' } });
                });
            });
        });

        describe('when accepting the invite fails', () => {
            beforeEach(() => {
                acceptInviteApi.mockRejectedValue(NON_RETRYABLE_API_ERROR);
            });

            it('for a new account, locks the form and offers to continue to the email verification, and then to Login', async () => {
                renderRegisterPage('', invite);
                register();

                const continueButton = await screen.findByRole('button', { name: 'Continue to Email Verification' });
                expect(screen.getByTestId('register-error-message'))
                    .toHaveTextContent('Operation failed. Please contact support to fix the problem.');
                expect(acceptInviteApi).toHaveBeenCalledTimes(1);
                expect(emailInput()).toBeDisabled();
                expect(passwordInput()).toBeDisabled();
                expect(confirmPasswordInput()).toBeDisabled();

                fireEvent.click(continueButton);

                expect(await screen.findByRole('heading', { name: 'Verify Email' })).toBeInTheDocument();
                expect(screen.getByTestId('register-verify-success-message')).toHaveTextContent('invitee@b.com');
                expect(screen.queryByTestId('register-verify-error-message')).not.toBeInTheDocument();

                verifyWithCode('123456');

                await waitFor(() => { expect(mockNavigate).toHaveBeenCalledWith('/login'); });
                expect(confirmSignUp).toHaveBeenCalledWith('invitee@b.com', '123456');
            });

            it('for an existing account, stays on the page with the error and no way forward', async () => {
                signUp.mockRejectedValue({ code: 'UsernameExistsException', message: 'User already exists' });
                renderRegisterPage('', invite);
                register();

                expect(await screen.findByTestId('register-error-message'))
                    .toHaveTextContent('Operation failed. Please contact support to fix the problem.');
                expect(screen.queryByTestId('register-submit-button')).not.toBeInTheDocument();
                expect(acceptInviteApi).toHaveBeenCalledTimes(1);
                expect(mockNavigate).not.toHaveBeenCalled();
            });
        });
    });

    it('without an invite, registers and asks to verify the email', async () => {
        renderRegisterPage();
        register('a@b.com');

        expect(await screen.findByTestId('register-verify-success-message'))
            .toHaveTextContent("We've sent a verification code to a@b.com. Please enter it below.");
        expect(acceptInviteApi).not.toHaveBeenCalled();
    });

    it('starts with empty registration fields when no email or invite is provided', () => {
        renderRegisterPage();

        expect(emailInput()).toHaveValue('');
        expect(emailInput()).toBeEnabled();
        expect(passwordInput()).toHaveValue('');
        expect(passwordInput()).toBeEnabled();
        expect(confirmPasswordInput()).toHaveValue('');
        expect(confirmPasswordInput()).toBeEnabled();
        expect(screen.getByRole('heading', { name: 'Register' })).toBeInTheDocument();
        expect(screen.getByTestId('register-submit-button')).toHaveTextContent('Register');
        expect(screen.queryByLabelText('Verification Code')).not.toBeInTheDocument();
        expect(screen.queryByTestId('register-email-field-error')).not.toBeInTheDocument();
        expect(screen.queryByTestId('register-confirm-password-field-error')).not.toBeInTheDocument();
    });

    it('does not show field errors for a valid email and matching passwords', () => {
        renderRegisterPage();
        fireEvent.change(emailInput(), { target: { value: 'a@b.com' } });
        fireEvent.change(passwordInput(), { target: { value: PASSWORD } });
        fireEvent.change(confirmPasswordInput(), { target: { value: PASSWORD } });

        expect(screen.queryByTestId('register-email-field-error')).not.toBeInTheDocument();
        expect(screen.queryByTestId('register-confirm-password-field-error')).not.toBeInTheDocument();
        expect(screen.getByTestId('register-submit-button')).toBeEnabled();
    });

    it('updates the email and verification step when the route query changes', async () => {
        render(
            <MemoryRouter initialEntries={['/register']}>
                <Routes>
                    <Route
                        path="/register"
                        element={(
                            <>
                                <Register />
                                <Link to="/register?email=updated%40example.com&verify=true">Start verification</Link>
                            </>
                        )}
                    />
                </Routes>
            </MemoryRouter>
        );

        expect(screen.getByRole('heading', { name: 'Register' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('link', { name: 'Start verification' }));

        expect(await screen.findByRole('heading', { name: 'Verify Email' })).toBeInTheDocument();
        expect(screen.getByTestId('register-verify-success-message'))
            .toHaveTextContent('updated@example.com');
    });

    it('prefills and focuses the password when invite router state changes', async () => {
        render(
            <MemoryRouter initialEntries={['/register']}>
                <Routes>
                    <Route
                        path="/register"
                        element={(
                            <>
                                <Register />
                                <Link to="/register" state={{ invite }}>Open invite</Link>
                            </>
                        )}
                    />
                </Routes>
            </MemoryRouter>
        );

        expect(emailInput()).toHaveValue('');
        fireEvent.click(screen.getByRole('link', { name: 'Open invite' }));

        await waitFor(() => {
            expect(emailInput()).toHaveValue('invitee@b.com');
            expect(passwordInput()).toHaveFocus();
        });
    });

    it('does not enter email verification when the email query lacks verify=true', () => {
        renderRegisterPage('?email=a%40b.com');

        expect(emailInput()).toHaveValue('');
        expect(screen.getByRole('heading', { name: 'Register' })).toBeInTheDocument();
        expect(screen.queryByLabelText('Verification Code')).not.toBeInTheDocument();
    });

    it('shows a pending state while account creation is in progress', async () => {
        let resolveSignUp!: () => void;
        signUp.mockImplementation(() => new Promise<void>((resolve) => { resolveSignUp = resolve; }));
        renderRegisterPage();
        fireEvent.change(emailInput(), { target: { value: 'a@b.com' } });
        fireEvent.change(passwordInput(), { target: { value: PASSWORD } });
        fireEvent.change(confirmPasswordInput(), { target: { value: PASSWORD } });
        fireEvent.click(screen.getByTestId('register-submit-button'));

        await waitFor(() => {
            expect(screen.getByTestId('register-submit-button')).toBeDisabled();
            expect(screen.getByTestId('register-submit-button')).toHaveTextContent('Creating account...');
        });

        resolveSignUp();
        expect(await screen.findByRole('heading', { name: 'Verify Email' })).toBeInTheDocument();
    });

    it('does not submit an invalid email address', async () => {
        renderRegisterPage();
        fireEvent.change(emailInput(), { target: { value: 'not-an-email' } });
        fireEvent.change(passwordInput(), { target: { value: PASSWORD } });
        fireEvent.change(confirmPasswordInput(), { target: { value: PASSWORD } });
        const form = emailInput().closest('form');
        if (!form) throw new Error('Expected the registration form');
        fireEvent.submit(form);

        expect(await screen.findByTestId('register-error-message'))
            .toHaveTextContent('Please enter a valid email address.');
        expect(screen.getByTestId('register-email-field-error'))
            .toHaveTextContent('Please enter a valid email address');
        expect(signUp).not.toHaveBeenCalled();
        expect(acceptInviteApi).not.toHaveBeenCalled();
        expect(screen.queryByTestId('register-verify-success-message')).not.toBeInTheDocument();
    });

    it('blocks submission and reports when the passwords do not match', () => {
        renderRegisterPage();
        fireEvent.change(emailInput(), { target: { value: 'a@b.com' } });
        fireEvent.change(passwordInput(), { target: { value: PASSWORD } });
        fireEvent.change(confirmPasswordInput(), { target: { value: `${PASSWORD}x` } });

        expect(screen.getByTestId('register-confirm-password-field-error'))
            .toHaveTextContent('Passwords do not match');
        expect(screen.getByTestId('register-submit-button')).toBeDisabled();
        expect(signUp).not.toHaveBeenCalled();
    });

    it('rejects mismatched passwords if the registration form is submitted directly', async () => {
        renderRegisterPage();
        fireEvent.change(emailInput(), { target: { value: 'a@b.com' } });
        fireEvent.change(passwordInput(), { target: { value: PASSWORD } });
        fireEvent.change(confirmPasswordInput(), { target: { value: `${PASSWORD}x` } });
        const form = emailInput().closest('form');
        if (!form) throw new Error('Expected the registration form');

        fireEvent.submit(form);

        expect(await screen.findByTestId('register-error-message')).toHaveTextContent('Passwords do not match.');
        expect(signUp).not.toHaveBeenCalled();
        expect(acceptInviteApi).not.toHaveBeenCalled();
    });

    it('shows an existing-account error instead of accepting an invite when there is no invite', async () => {
        signUp.mockRejectedValue({
            code: 'UsernameExistsException',
            message: 'An account with the given email already exists.',
        });
        renderRegisterPage();
        register('a@b.com');

        expect(await screen.findByTestId('register-error-message'))
            .toHaveTextContent('An account with this email already exists. Try logging in instead.');
        expect(acceptInviteApi).not.toHaveBeenCalled();
        expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('shows other sign-up errors for an invite without trying to accept it', async () => {
        signUp.mockRejectedValue({
            code: 'InvalidPasswordException',
            message: 'Password did not conform with policy: Password must have symbol characters',
        });
        renderRegisterPage('', invite);
        register();

        expect(await screen.findByTestId('register-error-message'))
            .toHaveTextContent('Password must be at least 12 characters with uppercase, lowercase, number, and symbol.');
        expect(acceptInviteApi).not.toHaveBeenCalled();
        expect(mockNavigate).not.toHaveBeenCalled();
        expect(screen.getByRole('heading', { name: 'Register' })).toBeInTheDocument();
    });

    it('shows a registration error from Cognito in friendly words', async () => {
        signUp.mockRejectedValue({ code: 'InvalidPasswordException', message: 'Password did not conform with policy: Password must have symbol characters' });
        renderRegisterPage();
        register('a@b.com');

        expect(await screen.findByTestId('register-error-message'))
            .toHaveTextContent('Password must be at least 12 characters with uppercase, lowercase, number, and symbol.');
    });

    it('?email&verify=true opens the email verification for that address', () => {
        renderVerifyEmailStep();

        expect(screen.getByRole('heading', { name: 'Verify Email' })).toBeInTheDocument();
        expect(screen.getByTestId('register-verify-button')).toHaveTextContent('Verify');
        expect(screen.getByTestId('register-verify-success-message'))
            .toHaveTextContent("We've sent a verification code to a@b.com. Please enter it below.");
        expect(screen.getByLabelText('Verification Code')).toHaveValue('');
    });

    describe('a verified email goes to Login', () => {
        it('without a returnUrl', async () => {
            renderVerifyEmailStep();
            verifyWithCode('123456');

            await waitFor(() => { expect(mockNavigate).toHaveBeenCalledWith('/login'); });
            expect(confirmSignUp).toHaveBeenCalledWith('a@b.com', '123456');
        });

        it('keeping the returnUrl', async () => {
            renderVerifyEmailStep('&returnUrl=%2Fkudos');
            verifyWithCode('123456');

            await waitFor(() => { expect(mockNavigate).toHaveBeenCalledWith('/login?returnUrl=%2Fkudos'); });
        });
    });

    it('shows a friendly message when Cognito rejects the verification code', async () => {
        confirmSignUp.mockRejectedValue({
            code: 'CodeMismatchException',
            message: 'Invalid verification code provided, please try again.',
        });
        renderVerifyEmailStep();
        verifyWithCode('000000');

        expect(await screen.findByTestId('register-verify-error-message'))
            .toHaveTextContent('The verification code is incorrect. Please try again.');
        expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('removes the spaces a copy-paste leaves around the verification code', async () => {
        renderVerifyEmailStep();
        verifyWithCode(' 123456 ');

        await waitFor(() => { expect(confirmSignUp).toHaveBeenCalledWith('a@b.com', '123456'); });
    });

    it('shows a pending state while the verification code is being confirmed', async () => {
        let resolveConfirmation!: () => void;
        confirmSignUp.mockImplementation(() => new Promise<void>((resolve) => { resolveConfirmation = resolve; }));
        renderVerifyEmailStep();
        fireEvent.change(screen.getByLabelText('Verification Code'), { target: { value: '123456' } });
        fireEvent.click(screen.getByTestId('register-verify-button'));

        await waitFor(() => {
            expect(screen.getByTestId('register-verify-button')).toBeDisabled();
            expect(screen.getByTestId('register-verify-button')).toHaveTextContent('Verifying...');
        });

        resolveConfirmation();
        await waitFor(() => { expect(mockNavigate).toHaveBeenCalledWith('/login'); });
        await waitFor(() => { expect(screen.getByTestId('register-verify-button')).toBeEnabled(); });
    });

    it('resends the verification code and says so', async () => {
        renderVerifyEmailStep();

        fireEvent.click(screen.getByTestId('register-resend-code-button'));

        expect(await screen.findByTestId('register-verify-error-message')).toHaveTextContent('New verification code sent to your email.');
        expect(resendConfirmationCode).toHaveBeenCalledWith('a@b.com');
    });

    it('shows a pending state while the verification code is being resent', async () => {
        let resolveResend!: () => void;
        resendConfirmationCode.mockImplementation(() => new Promise<void>((resolve) => { resolveResend = resolve; }));
        renderVerifyEmailStep();

        fireEvent.click(screen.getByTestId('register-resend-code-button'));

        await waitFor(() => {
            expect(screen.getByTestId('register-resend-code-button')).toBeDisabled();
        });

        resolveResend();
        expect(await screen.findByTestId('register-verify-error-message'))
            .toHaveTextContent('New verification code sent to your email.');
        expect(screen.getByTestId('register-resend-code-button')).toBeEnabled();
    });

    it('shows a resend-code error from Cognito in friendly words', async () => {
        resendConfirmationCode.mockRejectedValue({ code: 'LimitExceededException', message: 'Attempt limit exceeded, please try after some time.' });
        renderVerifyEmailStep();

        fireEvent.click(screen.getByTestId('register-resend-code-button'));

        expect(await screen.findByTestId('register-verify-error-message'))
            .toHaveTextContent('Too many attempts. Please wait an hour before trying again. Additional attempts will extend the wait time.');
    });

    describe('asks to reload the page when the auth initialisation has failed, on', () => {
        it('register', async () => {
            signUp.mockRejectedValue(AUTH_INIT_FAILURE);
            renderRegisterPage();
            register('a@b.com');

            expect(await screen.findByTestId('register-error-message')).toHaveTextContent(USER_INIT_ERROR_MESSAGE);
        });

        it('verify', async () => {
            confirmSignUp.mockRejectedValue(AUTH_INIT_FAILURE);
            renderVerifyEmailStep();
            verifyWithCode('123456');

            expect(await screen.findByTestId('register-verify-error-message')).toHaveTextContent(USER_INIT_ERROR_MESSAGE);
            expect(mockNavigate).not.toHaveBeenCalled();
        });

        it('resend code', async () => {
            resendConfirmationCode.mockRejectedValue(AUTH_INIT_FAILURE);
            renderVerifyEmailStep();

            fireEvent.click(screen.getByTestId('register-resend-code-button'));

            expect(await screen.findByTestId('register-verify-error-message')).toHaveTextContent(USER_INIT_ERROR_MESSAGE);
        });
    });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Register } from '../../../src/pages/Register';
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
const NON_RETRYABLE_API_ERROR = { status: 400, message: 'Bad Request' };

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

    const renderRegisterPage = (query = '', invitation?: Invite) => render(
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
        });

        it('accepts the invite after registering, then asks to verify the email', async () => {
            renderRegisterPage('', invite);
            register();

            expect(await screen.findByRole('heading', { name: 'Verify Email' })).toBeInTheDocument();
            expect(signUp).toHaveBeenCalledWith('invitee@b.com', PASSWORD);
            expect(acceptInviteApi).toHaveBeenCalledWith('invite-nano-id', expect.any(Number));
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
        expect(screen.getByTestId('register-verify-success-message')).toHaveTextContent('a@b.com');
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

    it('removes the spaces a copy-paste leaves around the verification code', async () => {
        renderVerifyEmailStep();
        verifyWithCode(' 123456 ');

        await waitFor(() => { expect(confirmSignUp).toHaveBeenCalledWith('a@b.com', '123456'); });
    });

    it('resends the verification code and says so', async () => {
        renderVerifyEmailStep();

        fireEvent.click(screen.getByTestId('register-resend-code-button'));

        expect(await screen.findByTestId('register-verify-error-message')).toHaveTextContent('New verification code sent to your email.');
        expect(resendConfirmationCode).toHaveBeenCalledWith('a@b.com');
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

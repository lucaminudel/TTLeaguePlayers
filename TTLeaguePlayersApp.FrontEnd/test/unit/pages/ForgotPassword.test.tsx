import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ForgotPassword } from '../../../src/pages/ForgotPassword';

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

const VALID_PASSWORD = 'aA1!56789012';

describe('ForgotPassword page', () => {
    const forgotPassword = vi.fn<(email: string) => Promise<void>>();
    const confirmForgotPassword = vi.fn<(email: string, code: string, newPassword: string) => Promise<void>>();

    beforeEach(() => {
        vi.clearAllMocks();
        forgotPassword.mockResolvedValue(undefined);
        confirmForgotPassword.mockResolvedValue(undefined);
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
            forgotPassword,
            confirmForgotPassword,
        });
    });

    const renderForgotPasswordPage = (query = '') => render(
        <MemoryRouter initialEntries={[`/forgot-password${query}`]}>
            <Routes>
                <Route path="/forgot-password" element={<ForgotPassword />} />
            </Routes>
        </MemoryRouter>
    );

    const emailInput = () => screen.getByLabelText<HTMLInputElement>('Email');

    const requestCode = async () => {
        fireEvent.click(screen.getByTestId('forgot-password-send-code-button'));
        await screen.findByRole('heading', { name: 'Reset Password' });
    };

    const fillResetForm = (code: string, newPassword: string, confirmNewPassword: string) => {
        fireEvent.change(screen.getByLabelText('Verification Code'), { target: { value: code } });
        fireEvent.change(screen.getByLabelText('New Password'), { target: { value: newPassword } });
        fireEvent.change(screen.getByLabelText('Confirm New Password'), { target: { value: confirmNewPassword } });
    };

    describe('the email field', () => {
        it('is pre-filled and locked when the email comes from ?email (invite flow)', () => {
            renderForgotPasswordPage('?email=a%40b.com');
            expect(emailInput().value).toBe('a@b.com');
            expect(emailInput()).toBeDisabled();
        });

        it('is pre-filled and editable when the email comes from ?prefillEmail (typed on Login)', () => {
            renderForgotPasswordPage('?prefillEmail=a%40b.com');
            expect(emailInput().value).toBe('a@b.com');
            expect(emailInput()).toBeEnabled();
        });

        it('is empty and editable without any email param', () => {
            renderForgotPasswordPage();
            expect(emailInput().value).toBe('');
            expect(emailInput()).toBeEnabled();
            expect(screen.getByTestId('forgot-password-send-code-button')).toHaveTextContent('Send Code');
        });
    });

    it('does not request a code for an invalid email address', async () => {
        renderForgotPasswordPage('?prefillEmail=a%40b');

        fireEvent.click(screen.getByTestId('forgot-password-send-code-button'));

        expect(await screen.findByTestId('forgot-password-error-message')).toHaveTextContent('Please enter a valid email address.');
        expect(forgotPassword).not.toHaveBeenCalled();
    });

    it('requests a code and moves to the reset step, without saying whether the account exists', async () => {
        renderForgotPasswordPage('?email=a%40b.com');

        await requestCode();

        expect(forgotPassword).toHaveBeenCalledWith('a@b.com');
        expect(screen.getByTestId('forgot-password-code-sent-message')).toHaveTextContent('If an account exists for a@b.com');
        expect(screen.getByLabelText('Verification Code')).toHaveValue('');
        expect(screen.getByLabelText('New Password')).toHaveValue('');
        expect(screen.getByLabelText('Confirm New Password')).toHaveValue('');
    });

    it('shows the pending state while requesting a reset code', async () => {
        let resolveRequest!: () => void;
        forgotPassword.mockImplementation(() => new Promise<void>((resolve) => { resolveRequest = resolve; }));
        renderForgotPasswordPage('?email=a%40b.com');

        fireEvent.click(screen.getByTestId('forgot-password-send-code-button'));

        await waitFor(() => {
            expect(screen.getByTestId('forgot-password-send-code-button')).toBeDisabled();
            expect(screen.getByTestId('forgot-password-send-code-button')).toHaveTextContent('Sending...');
        });

        await act(async () => {
            resolveRequest();
            await Promise.resolve();
        });
        expect(await screen.findByRole('heading', { name: 'Reset Password' })).toBeInTheDocument();
    });

    it('requests a code for an email entered on the page', async () => {
        renderForgotPasswordPage();
        fireEvent.change(emailInput(), { target: { value: 'typed@example.com' } });

        await requestCode();

        expect(forgotPassword).toHaveBeenCalledWith('typed@example.com');
        expect(screen.getByTestId('forgot-password-code-sent-message'))
            .toHaveTextContent('If an account exists for typed@example.com');
    });

    describe('a successful reset goes to Login with the email locked and a success flag', () => {
        it('keeping the returnUrl', async () => {
            renderForgotPasswordPage('?email=a%40b.com&returnUrl=%2Fkudos');
            await requestCode();

            fillResetForm('123456', VALID_PASSWORD, VALID_PASSWORD);
            fireEvent.click(screen.getByTestId('forgot-password-reset-button'));

            await waitFor(() => {
                expect(mockNavigate).toHaveBeenCalledWith('/login?email=a%40b.com&reset=success&returnUrl=%2Fkudos');
            });
            expect(confirmForgotPassword).toHaveBeenCalledWith('a@b.com', '123456', VALID_PASSWORD);
        });

        it('with no returnUrl when there was none', async () => {
            renderForgotPasswordPage('?email=a%40b.com');
            await requestCode();

            fillResetForm('123456', VALID_PASSWORD, VALID_PASSWORD);
            fireEvent.click(screen.getByTestId('forgot-password-reset-button'));

            await waitFor(() => {
                expect(mockNavigate).toHaveBeenCalledWith('/login?email=a%40b.com&reset=success');
            });
        });
    });

    it('shows and clears the pending password-reset state', async () => {
        let resolveReset!: () => void;
        confirmForgotPassword.mockImplementation(() => new Promise<void>((resolve) => { resolveReset = resolve; }));
        renderForgotPasswordPage('?email=a%40b.com');
        await requestCode();

        fillResetForm('123456', VALID_PASSWORD, VALID_PASSWORD);
        fireEvent.click(screen.getByTestId('forgot-password-reset-button'));

        await waitFor(() => {
            expect(screen.getByTestId('forgot-password-reset-button')).toBeDisabled();
            expect(screen.getByTestId('forgot-password-reset-button')).toHaveTextContent('Resetting...');
        });

        await act(async () => {
            resolveReset();
            await Promise.resolve();
        });

        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith('/login?email=a%40b.com&reset=success');
            expect(screen.getByTestId('forgot-password-reset-button')).toBeEnabled();
            expect(screen.getByTestId('forgot-password-reset-button')).toHaveTextContent('Reset Password');
        });
    });

    it('removes the spaces a copy-paste leaves around the verification code', async () => {
        renderForgotPasswordPage('?email=a%40b.com');
        await requestCode();

        fillResetForm(' 123456 ', VALID_PASSWORD, VALID_PASSWORD);
        fireEvent.click(screen.getByTestId('forgot-password-reset-button'));

        await waitFor(() => {
            expect(confirmForgotPassword).toHaveBeenCalledWith('a@b.com', '123456', VALID_PASSWORD);
        });
    });

    it('blocks the reset while the two new passwords differ', async () => {
        renderForgotPasswordPage('?email=a%40b.com');
        await requestCode();

        fillResetForm('123456', VALID_PASSWORD, `${VALID_PASSWORD}x`);

        expect(screen.getByTestId('forgot-password-confirm-password-field-error')).toHaveTextContent('Passwords do not match');
        expect(screen.getByTestId('forgot-password-reset-button')).toBeDisabled();
        expect(confirmForgotPassword).not.toHaveBeenCalled();
    });

    it('rejects mismatched passwords if the reset form is submitted directly', async () => {
        renderForgotPasswordPage('?email=a%40b.com');
        await requestCode();
        fillResetForm('123456', VALID_PASSWORD, `${VALID_PASSWORD}x`);
        const form = screen.getByTestId('forgot-password-reset-button').closest('form');
        if (!form) throw new Error('Expected the password-reset form');

        fireEvent.submit(form);

        expect(await screen.findByTestId('forgot-password-error-message')).toHaveTextContent('Passwords do not match.');
        expect(confirmForgotPassword).not.toHaveBeenCalled();
        expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('shows a friendly message for a wrong verification code', async () => {
        confirmForgotPassword.mockRejectedValue({ __type: 'CodeMismatchException', message: 'Invalid verification code provided, please try again.' });
        renderForgotPasswordPage('?email=a%40b.com');
        await requestCode();

        fillResetForm('000000', VALID_PASSWORD, VALID_PASSWORD);
        fireEvent.click(screen.getByTestId('forgot-password-reset-button'));

        expect(await screen.findByTestId('forgot-password-error-message')).toHaveTextContent('The verification code is incorrect. Please try again.');
        expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('asks to reload the page when the auth initialisation has failed', async () => {
        forgotPassword.mockRejectedValue(new Error('AuthProvider.initAuth() has failed. authInitialisationError: boom'));
        renderForgotPasswordPage('?email=a%40b.com');

        fireEvent.click(screen.getByTestId('forgot-password-send-code-button'));

        expect(await screen.findByTestId('forgot-password-error-message'))
            .toHaveTextContent('Unexpected authentication initialisation error: reload the page and try again.');
    });

    it('resends the code and confirms it with a neutral info line', async () => {
        renderForgotPasswordPage('?email=a%40b.com');
        await requestCode();

        fireEvent.click(screen.getByTestId('forgot-password-resend-code-button'));

        expect(await screen.findByTestId('forgot-password-info-message')).toHaveTextContent('If an account exists for a@b.com, a new code has been sent.');
        expect(forgotPassword).toHaveBeenCalledTimes(2);
        expect(screen.queryByTestId('forgot-password-error-message')).not.toBeInTheDocument();
    });

    it('shows the pending state while resending the code', async () => {
        let resolveResend!: () => void;
        forgotPassword.mockResolvedValueOnce(undefined).mockImplementationOnce(
            () => new Promise<void>((resolve) => { resolveResend = resolve; })
        );
        renderForgotPasswordPage('?email=a%40b.com');
        await requestCode();

        fireEvent.click(screen.getByTestId('forgot-password-resend-code-button'));

        await waitFor(() => {
            expect(screen.getByTestId('forgot-password-resend-code-button')).toBeDisabled();
            expect(screen.getByTestId('forgot-password-reset-button')).toBeDisabled();
        });

        await act(async () => {
            resolveResend();
            await Promise.resolve();
        });
        expect(await screen.findByTestId('forgot-password-info-message'))
            .toHaveTextContent('If an account exists for a@b.com, a new code has been sent.');
        expect(screen.getByTestId('forgot-password-resend-code-button')).toBeEnabled();
        expect(screen.getByTestId('forgot-password-reset-button')).toBeEnabled();
    });

    it('shows a friendly error if resending the code fails', async () => {
        forgotPassword
            .mockResolvedValueOnce(undefined)
            .mockRejectedValueOnce({
                code: 'LimitExceededException',
                message: 'Attempt limit exceeded, please try after some time.',
            });
        renderForgotPasswordPage('?email=a%40b.com');
        await requestCode();

        fireEvent.click(screen.getByTestId('forgot-password-resend-code-button'));

        expect(await screen.findByTestId('forgot-password-error-message'))
            .toHaveTextContent('Too many attempts. Please wait an hour before trying again. Additional attempts will extend the wait time.');
        expect(screen.queryByTestId('forgot-password-info-message')).not.toBeInTheDocument();
        expect(forgotPassword).toHaveBeenCalledTimes(2);
    });

    it('links to the email verification (keeping the returnUrl) and to the contact-us page', async () => {
        renderForgotPasswordPage('?email=a%40b.com&returnUrl=%2Fkudos');
        await requestCode();

        expect(screen.getByTestId('forgot-password-verify-email-link'))
            .toHaveAttribute('href', '/register?email=a%40b.com&verify=true&returnUrl=%2Fkudos');
        expect(screen.getByTestId('forgot-password-contact-us-link')).toHaveAttribute('href', '/about-and-contact-us');
        expect(screen.getByTestId('forgot-password-unverified-hint'))
            .toHaveTextContent(/If you never completed your registration verification, verify your email first\./);
        expect(screen.getByTestId('forgot-password-contact-us-hint'))
            .toHaveTextContent('Still having problems? Contact us.');
    });
});

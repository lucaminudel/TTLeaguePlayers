import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

    it('links to the email verification (keeping the returnUrl) and to the contact-us page', async () => {
        renderForgotPasswordPage('?email=a%40b.com&returnUrl=%2Fkudos');
        await requestCode();

        expect(screen.getByTestId('forgot-password-verify-email-link'))
            .toHaveAttribute('href', '/register?email=a%40b.com&verify=true&returnUrl=%2Fkudos');
        expect(screen.getByTestId('forgot-password-contact-us-link')).toHaveAttribute('href', '/about-and-contact-us');
    });
});

import { test, expect, type Page } from '@playwright/test';
import { User } from './page-objects/User';
import { uniqueTestEmail } from './helpers/testEmails';

/**
 * Forgotten-password acceptance tests.
 *
 * The mocked journeys intercept both reset operations, so they need no guard.
 * The live tests use a never-registered address: Cognito (PreventUserExistenceErrors ENABLED)
 * answers with a simulated code delivery, so nothing is emailed and no user is created.
 */

const EXECUTE_LIVE_COGNITO_TESTS = process.env.EXECUTE_LIVE_COGNITO_TESTS === 'true';

const validPassword = 'aA1!56789012';

interface CognitoErrorBody {
    __type: string;
    message: string;
}

type ResetCallMock = 'success' | 'real' | CognitoErrorBody;

interface PasswordResetMocks {
    forgotPassword?: ResetCallMock;
    confirmForgotPassword?: ResetCallMock;
}

const successBodyByTarget: Record<string, object> = {
    ForgotPassword: { CodeDeliveryDetails: { Destination: 'a***@b***', DeliveryMedium: 'EMAIL', AttributeName: 'email' } },
    ConfirmForgotPassword: {},
};

async function mockPasswordResetCalls(page: Page, mocks: PasswordResetMocks): Promise<{ forgotPasswordRequestCount: () => number }> {
    let forgotPasswordRequests = 0;
    const mockByTarget: Record<string, ResetCallMock> = {
        ForgotPassword: mocks.forgotPassword ?? 'success',
        ConfirmForgotPassword: mocks.confirmForgotPassword ?? 'success',
    };

    await page.route('https://cognito-idp.*.amazonaws.com/', async (route) => {
        const target = route.request().headers()['x-amz-target'] as string | undefined;
        const operation = target?.split('.').pop() ?? '';
        const mock = mockByTarget[operation] as ResetCallMock | undefined;

        if (operation === 'ForgotPassword') {
            forgotPasswordRequests++;
        }

        if (mock === undefined || mock === 'real') {
            await route.continue();
            return;
        }

        await route.fulfill({
            status: mock === 'success' ? 200 : 400,
            contentType: 'application/x-amz-json-1.1',
            body: JSON.stringify(mock === 'success' ? successBodyByTarget[operation] : mock),
        });
    });

    return { forgotPasswordRequestCount: () => forgotPasswordRequests };
}

const expectLoginAfterReset = async (page: Page, email: string) => {
    const emailInput = page.locator('#email');
    await expect(emailInput).toHaveValue(email);
    await expect(emailInput).toBeDisabled();
    await expect(page.getByTestId('login-success-message')).toHaveText('Your password has been reset. Log in with your new password.');
};

test.describe('Forgot Password Flow', () => {

    test('invite journey - email stays locked from Login through the reset and back, keeping the returnUrl', async ({ page }) => {
        await mockPasswordResetCalls(page, {});
        const email = uniqueTestEmail();

        const loginPage = await new User(page).navigateToLogin(`?returnUrl=%2Fjoin%2Ftest-invite&email=${encodeURIComponent(email)}`);
        const forgotPasswordPage = await loginPage.clickForgotPasswordLink();

        const emailInput = page.locator('#email');
        await expect(emailInput).toHaveValue(email);
        await expect(emailInput).toBeDisabled();

        await forgotPasswordPage.requestCode();
        await forgotPasswordPage.setNewPassword('123456', validPassword);

        await expect(page).toHaveURL(/returnUrl=%2Fjoin%2Ftest-invite/);
        await expectLoginAfterReset(page, email);
    });

    test('typed email journey - the email typed on Login is pre-filled and can be corrected', async ({ page }) => {
        await mockPasswordResetCalls(page, {});
        const mistypedEmail = uniqueTestEmail();
        const correctedEmail = uniqueTestEmail();

        const loginPage = await new User(page).navigateToLogin();
        await page.fill('#email', mistypedEmail);
        const forgotPasswordPage = await loginPage.clickForgotPasswordLink();

        const emailInput = page.locator('#email');
        await expect(emailInput).toHaveValue(mistypedEmail);
        await expect(emailInput).toBeEnabled();

        await forgotPasswordPage.requestCode(correctedEmail);
        await forgotPasswordPage.setNewPassword('123456', validPassword);

        await expectLoginAfterReset(page, correctedEmail);
    });

    test('simulated wrong verification code shows a friendly message, and the correct code then reaches Login with the success line and no error', async ({ page }) => {
        await mockPasswordResetCalls(page, {
            confirmForgotPassword: { __type: 'CodeMismatchException', message: 'Invalid verification code provided, please try again.' },
        });
        const email = uniqueTestEmail();

        const forgotPasswordPage = await new User(page).navigateToForgotPassword();
        await forgotPasswordPage.requestCode(email);
        await forgotPasswordPage.tentativelySetNewPassword('000000', validPassword);

        await expect(page.getByTestId('forgot-password-error-message')).toHaveText('The verification code is incorrect. Please try again.');
        await expect(page.locator('h2')).toHaveText('Reset Password');

        await mockPasswordResetCalls(page, {});
        await forgotPasswordPage.setNewPassword('123456', validPassword);

        await expectLoginAfterReset(page, email);
        await expect(page.getByTestId('login-error-message')).not.toBeVisible();
    });

    test('simulated new password rejected by the policy shows the policy message', async ({ page }) => {
        await mockPasswordResetCalls(page, {
            confirmForgotPassword: { __type: 'InvalidPasswordException', message: 'Password does not conform to policy: Password not long enough' },
        });

        const forgotPasswordPage = await new User(page).navigateToForgotPassword();
        await forgotPasswordPage.requestCode(uniqueTestEmail());
        await forgotPasswordPage.tentativelySetNewPassword('123456', 'short');

        await expect(page.getByTestId('forgot-password-error-message'))
            .toHaveText('Password must be at least 12 characters with uppercase, lowercase, number, and symbol.');
    });

    test('resend code requests a new code and confirms it with a neutral info line', async ({ page }) => {
        const { forgotPasswordRequestCount } = await mockPasswordResetCalls(page, {});
        const email = uniqueTestEmail();

        const forgotPasswordPage = await new User(page).navigateToForgotPassword();
        await forgotPasswordPage.requestCode(email);
        await forgotPasswordPage.resendCode();

        await expect(page.getByTestId('forgot-password-info-message')).toHaveText(`If an account exists for ${email}, a new code has been sent.`);
        expect(forgotPasswordRequestCount()).toBe(2);
    });

    test('never-verified user can follow the hint to the email verification screen', async ({ page }) => {
        await mockPasswordResetCalls(page, {});
        const email = uniqueTestEmail();

        const forgotPasswordPage = await new User(page).navigateToForgotPassword();
        await forgotPasswordPage.requestCode(email);
        await forgotPasswordPage.followVerifyEmailLink();

        await expect(page.getByTestId('register-verify-success-message')).toContainText(email);
    });

    test('contact-us link opens the About & Contact Us page', async ({ page }) => {
        await mockPasswordResetCalls(page, {});

        const forgotPasswordPage = await new User(page).navigateToForgotPassword();
        await forgotPasswordPage.requestCode(uniqueTestEmail());
        await forgotPasswordPage.followContactUsLink();
    });

    test('mismatched new passwords block the reset', async ({ page }) => {
        await mockPasswordResetCalls(page, {});

        const forgotPasswordPage = await new User(page).navigateToForgotPassword();
        await forgotPasswordPage.requestCode(uniqueTestEmail());
        await forgotPasswordPage.setNewPasswordNoClick('123456', validPassword, `${validPassword}x`);

        await expect(page.getByTestId('forgot-password-confirm-password-field-error')).toHaveText('Passwords do not match');
        await expect(page.getByTestId('forgot-password-reset-button')).toBeDisabled();
    });

    test('live - real code request for a never-registered address, simulated confirmation', async ({ page }) => {
        test.skip(!EXECUTE_LIVE_COGNITO_TESTS, 'Skipping Cognito integration test');
        await mockPasswordResetCalls(page, { forgotPassword: 'real' });
        const email = uniqueTestEmail();

        const forgotPasswordPage = await new User(page).navigateToForgotPassword();
        await forgotPasswordPage.requestCode(email);
        await forgotPasswordPage.setNewPassword('123456', validPassword);

        await expectLoginAfterReset(page, email);
    });

    test('live - real wrong code for a never-registered address is rejected as incorrect', async ({ page }) => {
        test.skip(!EXECUTE_LIVE_COGNITO_TESTS, 'Skipping Cognito integration test');

        const forgotPasswordPage = await new User(page).navigateToForgotPassword();
        await forgotPasswordPage.requestCode(uniqueTestEmail());
        await forgotPasswordPage.tentativelySetNewPassword('123456', validPassword);

        await expect(page.getByTestId('forgot-password-error-message')).toHaveText('The verification code is incorrect. Please try again.');
    });
});

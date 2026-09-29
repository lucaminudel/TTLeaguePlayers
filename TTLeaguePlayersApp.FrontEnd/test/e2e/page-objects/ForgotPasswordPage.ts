import { type Page, expect } from '@playwright/test';
import { LoginPage } from './LoginPage';
import { RegisterPage } from './RegisterPage';
import { AboutAndContactUsPage } from './AboutAndContactUsPage';

export class ForgotPasswordPage {
    private page: Page;

    constructor(page: Page) {
        this.page = page;
    }

    async tentativelyRequestCode(email?: string): Promise<void> {
        if (email !== undefined) {
            await this.page.fill('#email', email);
        }
        await this.page.getByTestId('forgot-password-send-code-button').click();
    }

    async requestCode(email?: string): Promise<void> {
        const requestedEmail = email ?? await this.page.locator('#email').inputValue();
        await this.tentativelyRequestCode(email);

        await expect(this.page.locator('h2')).toHaveText('Reset Password');
        await expect(this.page.getByTestId('forgot-password-code-sent-message')).toContainText(requestedEmail);
    }

    async setNewPasswordNoClick(code: string, newPassword: string, confirmNewPassword?: string): Promise<void> {
        await this.page.fill('#verificationCode', code);
        await this.page.fill('#newPassword', newPassword);
        await this.page.fill('#confirmNewPassword', confirmNewPassword ?? newPassword);
    }

    async tentativelySetNewPassword(code: string, newPassword: string, confirmNewPassword?: string): Promise<void> {
        await this.setNewPasswordNoClick(code, newPassword, confirmNewPassword);
        await this.page.getByTestId('forgot-password-reset-button').click();
    }

    async setNewPassword(code: string, newPassword: string, confirmNewPassword?: string): Promise<LoginPage> {
        await this.tentativelySetNewPassword(code, newPassword, confirmNewPassword);

        await expect(this.page).toHaveURL(/\/login\?email=.*&reset=success/);
        await expect(this.page.locator('h2')).toHaveText('Log In');
        return new LoginPage(this.page);
    }

    async resendCode(): Promise<void> {
        await this.page.getByTestId('forgot-password-resend-code-button').click();
    }

    async followVerifyEmailLink(): Promise<RegisterPage> {
        await this.page.getByTestId('forgot-password-verify-email-link').click();

        await expect(this.page.locator('h2')).toHaveText('Verify Email');
        return new RegisterPage(this.page);
    }

    async followContactUsLink(): Promise<AboutAndContactUsPage> {
        await this.page.getByTestId('forgot-password-contact-us-link').click();

        const aboutAndContactUsPage = new AboutAndContactUsPage(this.page);
        await aboutAndContactUsPage.expectLoaded();
        return aboutAndContactUsPage;
    }
}

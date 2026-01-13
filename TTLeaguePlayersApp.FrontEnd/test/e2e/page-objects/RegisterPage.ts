import { type Page, expect } from '@playwright/test';

export class RegisterPage {
    private page: Page;

    constructor(page: Page) {
        this.page = page;
    }

    async registerNewUser(email: string, password: string, confirmPassword?: string): Promise<void> {
        await this.tentativelyRegisterNewUserNoClick(email, password, confirmPassword);

        await this.page.getByTestId('register-submit-button').click();

        // Expect navigation to Verify Email view
        await expect(this.page.locator('h2')).toHaveText('Verify Email');

        // Validate that the verification view is showing the sent-to email
        await expect(this.page.getByTestId('register-verify-success-message')).toContainText(email);

        // Check for Resend Code button and Verify button existence
        await expect(this.page.getByRole('button', { name: '< Resend Code >' })).toBeVisible();
        await expect(this.page.getByRole('button', { name: 'Verify', exact: true })).toBeVisible();
    }

    async registerNewUserWithInvite(email: string, password: string, confirmPassword?: string): Promise<void> {
        const emailInput = this.page.locator('#email');
        await expect(emailInput).toHaveValue(email);
        await expect(emailInput).toBeDisabled();

        await this.page.fill('#password', password);
        await this.page.fill('#confirmPassword', confirmPassword ?? password);

        await this.page.getByTestId('register-submit-button').click();

        // Expect navigation to Verify Email view
        await expect(this.page.locator('h2')).toHaveText('Verify Email');

        // Validate that the verification view is showing the sent-to email
        await expect(this.page.getByTestId('register-verify-success-message')).toContainText(email);

        // Check for Resend Code button and Verify button existence
        await expect(this.page.getByRole('button', { name: '< Resend Code >' })).toBeVisible();
        await expect(this.page.getByRole('button', { name: 'Verify', exact: true })).toBeVisible();
    }

    async tentativelyRegisterNewUserNoClick(email: string, password: string, confirmPassword?: string): Promise<void> {
        await this.page.fill('#email', email);
        await this.page.fill('#password', password);
        await this.page.fill('#confirmPassword', confirmPassword ?? password);
    }

    async tentativelyRegisterNewUser(email: string, password: string, confirmPassword?: string): Promise<void> {
        await this.tentativelyRegisterNewUserNoClick(email, password, confirmPassword);

        await this.page.getByTestId('register-submit-button').click();
    }

    async tentativelyRegisterNewUserWithInvite(email: string, password: string, confirmPassword?: string): Promise<void> {
        const emailInput = this.page.locator('#email');
        await expect(emailInput).toHaveValue(email);
        await expect(emailInput).toBeDisabled();

        await this.page.fill('#password', password);
        await this.page.fill('#confirmPassword', confirmPassword ?? password);

        await this.page.getByTestId('register-submit-button').click();
    }

    async tentativelyVerifyUserEmail(veefificationCode: string): Promise<void> {
        await this.page.fill('#verificationCode', veefificationCode);
        await this.page.getByTestId('register-verify-button').click();
    }

    async verifyUserEmail(vefificationCode: string): Promise<void> {
        await this.tentativelyVerifyUserEmail(vefificationCode);

        // Assert success: redirection to Login page
        await expect(this.page).toHaveURL('/#/login');
        await expect(this.page.locator('h2')).toHaveText('Log In');
    }
}

import { type Page } from '@playwright/test';
import { HomePage } from './HomePage';
import { JoinPage } from './JoinPage';
import { expect } from '@playwright/test';

export class LoginPage {
    private page: Page;

    constructor(page: Page) {
        this.page = page;
    }

    async tryToLogin(email: string, password: string): Promise<void> {
        await this.page.fill('#email', email);
        await this.page.fill('#password', password);
        await this.page.getByTestId('login-submit-button').click();

        // Wait for navigation to complete
        await this.page.waitForLoadState('networkidle');
    }

    async loginAndWaitForHome(email: string, validPassword: string): Promise<HomePage>  {
        await this.tryToLogin(email, validPassword);
        await expect(this.page).toHaveURL('/#/');

        return new HomePage(this.page);
    };

    async loginnAndWaitForJoin(email: string, validPassword: string, inviteId: string): Promise<JoinPage>  {
        await expect(this.page).toHaveURL(new RegExp(`/login\\?returnUrl=.*&email=${encodeURIComponent(email)}`));
        
        const emailInput = this.page.locator('#email');
        await expect(emailInput).toHaveValue(email);
        await expect(emailInput).toBeDisabled();

        await this.page.locator('#password').fill(validPassword);
        await this.page.getByTestId('login-submit-button').click();

        await expect(this.page).toHaveURL(new RegExp(`/join/${inviteId}`));
        return new JoinPage(this.page);

    }
}

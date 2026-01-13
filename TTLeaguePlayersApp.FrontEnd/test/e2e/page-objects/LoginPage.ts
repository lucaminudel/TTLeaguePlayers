import { type Page } from '@playwright/test';

export class LoginPage {
    private page: Page;

    constructor(page: Page) {
        this.page = page;
    }

    async login(email: string, password: string): Promise<void> {
        await this.page.fill('#email', email);
        await this.page.fill('#password', password);
        await this.page.getByTestId('login-submit-button').click();

        // Wait for navigation to complete (either homepage or returnUrl)
        await this.page.waitForLoadState('networkidle');
    }
}

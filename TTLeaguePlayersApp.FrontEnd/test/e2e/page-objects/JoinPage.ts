import { type Page, expect } from '@playwright/test';
import { RegisterPage } from './RegisterPage';

export class JoinPage {
    private page: Page;

    constructor(page: Page) {
        this.page = page;
    }

    async redeemInvite(): Promise<RegisterPage> {
        await this.page.getByTestId('join-register-button').click();

        await expect(this.page.locator('h2')).toHaveText('Register');

        return new RegisterPage(this.page);
    }
}

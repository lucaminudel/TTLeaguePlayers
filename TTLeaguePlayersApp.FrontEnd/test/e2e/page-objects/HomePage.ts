import { type Page, expect } from '@playwright/test';
import { JoinPage } from './JoinPage';
import { KudosAndAwardPages } from './KudosAndAwardPages';

export class HomePage {
    private page: Page;
    private inviteId?: string;

    constructor(page: Page, inviteId?: string) {
        this.page = page;
        if (inviteId)
            this.inviteId = inviteId;
    }

    async redeem(): Promise<JoinPage> {
        if (!this.inviteId) {
            throw new Error('No invite ID provided for HomePage, cannot redeem().');
        }
        // Click the button to navigate to Join page
        const enterButton = this.page.getByTestId('home-enter-button');
        await expect(enterButton).toContainText('Redeem your invite');
        await enterButton.click();

        // Verify navigation to Join page with correct invite ID
        await expect(this.page).toHaveURL(`/#/join/${this.inviteId}`);
        await expect(this.page.locator('h2')).toHaveText('Join - Personal Invite');

        // Verify the Register button is active (not disabled) on Join Page
        const registerButton = this.page.getByTestId('join-register-button');
        await expect(registerButton).toBeVisible();
        await expect(registerButton).toBeEnabled();

        return new JoinPage(this.page);
    }

    async readyToPlay(): Promise<KudosAndAwardPages> {
        if (this.inviteId) {
            throw new Error('ID provided, can only proceed to redeem().');
        }

        const enterButton = this.page.getByTestId('home-enter-button');
        await expect(enterButton).toContainText('Ready to play?');
        await enterButton.click();

        // Verify navigation to Kudos page
        await expect(this.page).toHaveURL(/\/#\/kudos$/);
        await expect(this.page.locator('h2')).toHaveText('Fair play Kudos');

        return new KudosAndAwardPages(this.page);
    }

    async tentativeReadyToPlay(): Promise<void> {
        if (this.inviteId) {
            throw new Error('ID provided, can only proceed to redeem().');
        }

        const enterButton = this.page.getByTestId('home-enter-button');
        await expect(enterButton).toContainText('Ready to play?');
        await enterButton.click();
    }
}

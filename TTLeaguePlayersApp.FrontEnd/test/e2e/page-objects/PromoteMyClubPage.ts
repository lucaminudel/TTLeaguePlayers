import { type Page, expect } from '@playwright/test';

interface ClubInfoFields {
    homepage?: string;
    instagram?: string;
    youtube?: string;
    facebook?: string;
}

export class PromoteMyClubPage {
    private page: Page;

    constructor(page: Page) {
        this.page = page;
    }

    async selectClub(location: string, clubName: string, hasInfo = false): Promise<void> {
        const locationButton = this.page.getByRole('button', { name: new RegExp(`^${location}$`) });
        await locationButton.click();

        await expect(locationButton).toHaveClass(/bg-action-accent/);
        await expect(this.page.getByRole('heading', { name: new RegExp(`My Club: ${clubName}`, 'i') })).toBeVisible();

        if (!hasInfo) {
            const testLinks = this.page.getByRole('link', { name: 'Test' });
            await expect(testLinks).toHaveCount(0);

            const testSpans = this.page.locator('span', { hasText: 'Test' });
            await expect(testSpans).toHaveCount(4);

            await expect(this.page.getByRole('button', { name: 'ADD' })).toBeDisabled();
            await expect(this.page.getByRole('button', { name: 'REMOVE' })).toBeDisabled();
        }
    }

    async addClubInfo(fields: ClubInfoFields): Promise<void> {
        await this.fillFields(fields);
        await this.page.getByRole('button', { name: 'ADD' }).click();
        await expect(this.page).toHaveURL('/#/clubs-and-tournaments');
    }

    async updateClubInfo(fields: ClubInfoFields): Promise<void> {
        await this.fillFields(fields);
        await this.page.getByRole('button', { name: 'UPDATE' }).click();
        await expect(this.page).toHaveURL('/#/clubs-and-tournaments');
    }

    async removeClubInfo(): Promise<void> {
        await this.page.getByRole('button', { name: 'REMOVE' }).click();
        await this.page.getByRole('button', { name: 'Confirm' }).click();
        await expect(this.page).toHaveURL('/#/clubs-and-tournaments');
    }

    async tentativeRemoveClubInfo(): Promise<void> {
        await this.page.getByRole('button', { name: 'REMOVE' }).click();
        await this.page.getByRole('button', { name: 'Cancel' }).click();
    }

    private async fillFields(fields: ClubInfoFields): Promise<void> {
        if (fields.homepage !== undefined) await this.page.getByLabel('Homepage Link').fill(fields.homepage);
        if (fields.instagram !== undefined) await this.page.getByLabel('Instagram Handle').fill(fields.instagram);
        if (fields.youtube !== undefined) await this.page.getByLabel('YouTube').fill(fields.youtube);
        if (fields.facebook !== undefined) await this.page.getByLabel('Facebook Link').fill(fields.facebook);
    }
}

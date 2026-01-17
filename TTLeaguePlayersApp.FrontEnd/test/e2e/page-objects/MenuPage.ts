import { type Page, expect } from '@playwright/test';

export class MenuPage {
    private page: Page;

    constructor(page: Page) {
        this.page = page;
    }

    async open(): Promise<void> {
        const menuButton = this.page.getByTestId('main-menu-toggle');
        await menuButton.click();

        // Verify menu is actually open by checking overlay visibility and geometry
        const overlay = this.page.getByTestId('main-menu-overlay');

        // Check strict geometry: overlay must cover the entire viewport
        const viewportSize = this.page.viewportSize();
        expect(viewportSize).not.toBeNull();
        const overlayBox = await overlay.boundingBox();
        expect(overlayBox).not.toBeNull();

        if (viewportSize && overlayBox) {
            expect(overlayBox.x).toBe(0);
            expect(overlayBox.y).toBe(0);
            expect(overlayBox.width).toBe(viewportSize.width);
            expect(overlayBox.height).toBe(viewportSize.height);
        }

        // Verify overlay is visible and interactive with menu items centered
        await expect(overlay).toHaveCSS('opacity', '1');
        await expect(overlay).toHaveCSS('pointer-events', 'auto');
        const link = this.page.getByTestId('main-menu-nav-kudos-standings');
        await expect(link).toBeVisible();
    }

    async close(): Promise<void> {
        const menuButton = this.page.getByTestId('main-menu-toggle');
        await menuButton.click();

        const overlay = this.page.getByTestId('main-menu-overlay');
        await expect(overlay).toHaveCSS('opacity', '0');
        await expect(overlay).toHaveCSS('pointer-events', 'none');
    }

    async logout() {
        const logoutMenuButton = this.page.getByTestId('main-menu-logout-button');
        await expect(logoutMenuButton).toBeVisible();

        await logoutMenuButton.click();

        // Wait for redirect to homepage
        await expect(this.page).toHaveURL('/#/');
        await expect(this.page.locator('h1')).toHaveText('TT League Players');

    }
}

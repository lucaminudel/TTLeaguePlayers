import { type Page, expect } from '@playwright/test';
import { HomePage } from './HomePage';
import { TournamentsAndClubsPage } from './TournamentsAndClubsPage';
import { ForumsPage } from './ForumsPage';
import { AboutPage } from './AboutPage';

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
        const link = this.page.getByTestId('main-menu-nav-about');
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

    async navigateToHome(): Promise<HomePage> {
        const link = this.page.getByTestId('main-menu-nav-home');
        await link.click();

        await expect(this.page.locator('h2')).toHaveText('Welcome');
        return new HomePage(this.page);
    }

    async navigateToTournamentsAndClubs(): Promise<TournamentsAndClubsPage> {
        const link = this.page.getByTestId('main-menu-nav-tournaments-&-clubs');
        await link.click();

        const tournamentsAndClubsPage = new TournamentsAndClubsPage(this.page);
        await tournamentsAndClubsPage.expectLoaded();
        return tournamentsAndClubsPage;
    }

    async navigateToForums(): Promise<ForumsPage> {
        const link = this.page.getByTestId('main-menu-nav-forums');
        await link.click();

        const forumsPage = new ForumsPage(this.page);
        await forumsPage.expectLoaded();
        return forumsPage;
    }

    async navigateToAbout(): Promise<AboutPage> {
        const link = this.page.getByTestId('main-menu-nav-about');
        await link.click();

        const aboutPage = new AboutPage(this.page);
        await aboutPage.expectLoaded();
        return aboutPage;
    }
}

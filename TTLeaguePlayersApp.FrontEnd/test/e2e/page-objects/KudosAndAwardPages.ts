import { type Page, type Locator, expect } from '@playwright/test';
import { KudosStandingsPage } from './KudosStandingsPage';

/**
 * How a rate flow should treat the info modal shown after the Rate button is clicked.
 * - 'ok'            dismiss it, leaving it to show again next time
 * - 'tick-and-ok'   tick "Don't show this message again", then dismiss it
 * - 'expect-absent' assert it does not appear, because it was suppressed earlier
 */
type RateInfoModalMode = 'ok' | 'tick-and-ok' | 'expect-absent';

export class KudosAndAwardPages {
    private page: Page;
    private openCard?: Locator;

    constructor(page: Page) {
        this.page = page;
        this.openCard = undefined;
    }

    activeSeasonCards(): Locator {
        return this.page.getByTestId('active-season-card');
    }

    async openActiveSeasonCard(index: number): Promise<void> {
        this.openCard = this.activeSeasonCards().nth(index);

        // Expand card if not already expanded as only card 
        const count = await this.activeSeasonCards().count();
        if (count > 0) {
            await this.openCard.getByTestId('active-season-header').click();
        }

        await expect(this.openCard.getByTestId('active-season-details')).toBeVisible();
    }

    async findAndOpenActiveSeasonCard(league: string, season: string, team: string): Promise<Locator> {

        const cards = this.activeSeasonCards();
        const count = await cards.count();
        let clttlCardIndex = -1;

        for (let i = 0; i < count; i++) {
            const leagueAndSeasonText = await cards.nth(i).getByTestId('active-season-league').textContent();
            const teamText = await cards.nth(i).getByTestId('active-season-team').textContent();

            if (leagueAndSeasonText?.includes(league) && leagueAndSeasonText.includes(season) && teamText?.includes(team)) {
                clttlCardIndex = i;
                break;
            }
        }
        expect(clttlCardIndex).toBeGreaterThanOrEqual(0);

        this.openCard = cards.nth(clttlCardIndex);

        // Expand card if not already expanded as only card 
        if (count > 1) {
            await this.openCard.getByTestId('active-season-header').click();
        }

        // Wait for details
        await expect(this.openCard.getByTestId('active-season-details')).toBeVisible();

        return this.openCard;
    }

    rateInfoModal(): Locator {
        return this.page.getByTestId('rate-info-modal');
    }

    async clickRateFromOpenCard(receivingTeamName: string): Promise<void> {

        if (!this.openCard) {
            throw new Error('No active season card is open. Please call openActiveSeasonCard or findAndOpenActiveSeasonCard first.');
        }

        // Find "Previous Match" against receivingTeamName
        const prevMatch = this.openCard.getByTestId('active-season-prev-match');
        await expect(prevMatch).toContainText('Vs ' + receivingTeamName, { timeout: 10000 });

        // Click "Rate" button
        await this.openCard.getByTestId('rate-button').click();
    }

    async dismissRateInfoModal(tickDontShowAgain: boolean): Promise<void> {

        await expect(this.rateInfoModal()).toBeVisible({ timeout: 10000 });

        if (tickDontShowAgain) {
            await this.page.getByTestId('rate-info-modal-dont-show-again').check();
        }

        await this.page.getByTestId('rate-info-modal-ok').click();
        await expect(this.rateInfoModal()).toBeHidden();
    }

    async ratePositiveKudosFromOpenCard(receivingTeamName: string, infoModal: RateInfoModalMode = 'ok'): Promise<KudosStandingsPage> {

        return this.RateKudosFromOpenCard('Extra Kudos', receivingTeamName, infoModal);
    }

    async RateNeutralKudosFromOpenCard(receivingTeamName: string, infoModal: RateInfoModalMode = 'ok'): Promise<KudosStandingsPage> {

        return this.RateKudosFromOpenCard('Standard Kudos', receivingTeamName, infoModal);
    }

    async RateNegativeKudosFromOpenCard(receivingTeamName: string, infoModal: RateInfoModalMode = 'ok'): Promise<KudosStandingsPage> {

        return this.RateKudosFromOpenCard('Fewer Kudos', receivingTeamName, infoModal);
    }

    private async RateKudosFromOpenCard(rating: string, receivingTeamName: string, infoModal: RateInfoModalMode = 'ok'): Promise<KudosStandingsPage> {

        await this.clickRateFromOpenCard(receivingTeamName);

        if (infoModal === 'expect-absent') {
            // Suppressed earlier in this test by 'tick-and-ok', so the click goes straight through.
            // The navigation is what proves it: toBeHidden() on its own is satisfied at t=0, before
            // React could have rendered the modal, so it would pass even if the modal did appear.
            await expect(this.page).toHaveURL(/\/award-kudos/, { timeout: 10000 });
            await expect(this.rateInfoModal()).toBeHidden();
        } else {
            await this.dismissRateInfoModal(infoModal === 'tick-and-ok');
        }

        // Award Positive Kudos
        await this.page.getByRole('button', { name: rating }).click();
        await this.page.getByRole('button', { name: 'Confirm' }).click();

        // Verify we are on kudos-standings page (implicit by next steps or explicit check)
        await expect(this.page).toHaveURL(/\/kudos-standings/, { timeout: 10000 });

        // Check "Awarded" tab is active. 
        await expect(this.page.getByTestId('active tab')).toContainText('Kudos Given By You');

        return new KudosStandingsPage(this.page);
    }
}

import { type Page, type Locator, expect } from '@playwright/test';
import { KudosStandingPage } from './KudosStandingPage';

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

        await this.openCard.getByTestId('active-season-header').click();

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

        // Expand card if not already expanded (assumed logic from previous tests, or just click header)
        this.openCard = cards.nth(clttlCardIndex);
        await this.openCard.getByTestId('active-season-header').click();

        // Wait for details
        await expect(this.openCard.getByTestId('active-season-details')).toBeVisible();

        return this.openCard;
    }

    async ratePositiveKudosFromOpenCard(receivingTeamName: string): Promise<KudosStandingPage> {

        return this.RateKudosFromOpenCard('Positive Kudos', receivingTeamName);
    }

    async RateNeutralKudosFromOpenCard(receivingTeamName: string): Promise<KudosStandingPage> {

        return this.RateKudosFromOpenCard('Neutral Kudos', receivingTeamName);
    }

    async RateNegativeKudosFromOpenCard(receivingTeamName: string): Promise<KudosStandingPage> {

        return this.RateKudosFromOpenCard('Negative Kudos', receivingTeamName);
    }

    private async RateKudosFromOpenCard(rating: string, receivingTeamName: string): Promise<KudosStandingPage> {

        if (!this.openCard) {
            throw new Error('No active season card is open. Please call openActiveSeasonCard or findAndOpenActiveSeasonCard first.');
        }

        // Find "Previous Match" against receivingTeamName
        const prevMatch = this.openCard.getByTestId('active-season-prev-match');
        await expect(prevMatch).toContainText('Vs ' + receivingTeamName, { timeout: 10000 });

        // Click "Rate" button
        await this.openCard.getByTestId('rate-button').click();

        // Award Positive Kudos
        await this.page.getByRole('button', { name: rating }).click();
        await this.page.getByRole('button', { name: 'Confirm' }).click();

        // Verify we are on kudos-standing page (implicit by next steps or explicit check)
        await expect(this.page).toHaveURL(/\/kudos-standing/, { timeout: 10000 });

        return new KudosStandingPage(this.page);
    }
}

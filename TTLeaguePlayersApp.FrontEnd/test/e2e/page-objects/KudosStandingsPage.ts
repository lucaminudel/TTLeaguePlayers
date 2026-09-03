import { type Page, type Locator, expect } from '@playwright/test';

/**
 * How a season selection should treat the shared standings info modal.
 * - 'ok'            dismiss it, leaving it to show again next visit
 * - 'tick-and-ok'   tick "Don't show this message again", then dismiss it
 * - 'expect-absent' assert it does not appear, because it was suppressed earlier
 */
type InfoModalMode = 'ok' | 'tick-and-ok' | 'expect-absent';

export class KudosStandingsPage {
    private page: Page;

    constructor(page: Page) {
        this.page = page;
    }

    infoModal(): Locator {
        return this.page.getByTestId('standings-info-modal');
    }

    async dismissInfoModal(tickDontShowAgain: boolean): Promise<void> {
        await expect(this.infoModal()).toBeVisible({ timeout: 10000 });

        if (tickDontShowAgain) {
            await this.page.getByTestId('standings-info-modal-dont-show-again').check();
        }

        await this.page.getByTestId('standings-info-modal-ok').click();
        await expect(this.infoModal()).toBeHidden();
    }

    async selectActiveSeason(league: string, season: string, teamName: string, infoModal: InfoModalMode = 'ok'): Promise<void> {
        // Check if season is already selected (displayed in header)
        const header = this.page.getByTestId('active-season-header');
        if ((await header.count()) > 0) {
            const headerText = await header.textContent();
            const seasonAlreadySelected = headerText &&
                headerText.includes(teamName) &&
                headerText.includes(league) &&
                headerText.includes(season);

            if (seasonAlreadySelected) {
                return;
            }
        }

        // Find and click the button matching the league, season, and team
        const seasonButton = this.page.locator('button').filter({
            hasText: teamName
        }).filter({
            hasText: `${league} - ${season}`
        });

        await expect(seasonButton).toBeVisible();
        await seasonButton.click();

        // Wait for the season to be selected (header should show the team name)
        await expect(this.page.getByTestId('active-season-header')).toContainText(teamName);

        if (infoModal === 'expect-absent') {
            // The header assertion above is the positive signal: toBeHidden() alone is satisfied
            // at t=0, before React could have rendered the modal, so it would pass even if the
            // modal did appear.
            await expect(this.infoModal()).toBeHidden();
        } else {
            await this.dismissInfoModal(infoModal === 'tick-and-ok');
        }
    }

    async myKudosItemsCount() {
        await expect(this.page.getByTestId('active tab')).toContainText('Kudos Given By You');

        await expect(this.page.getByTestId('my-kudos-items')).toBeVisible();
        return this.page.getByTestId('my-kudos-item').count();
    }

    async myKudosItemsContains(standingsPosition: number, team: string, kudos: string) {
        await expect(this.page.getByTestId('active tab')).toContainText('Kudos Given By You');

        const myKudosItem = this.page.getByTestId('my-kudos-item').nth(standingsPosition - 1)
        await expect(myKudosItem.filter({ hasText: team }).filter({ hasText: kudos })).toBeVisible();
    }

    async openTeamTab(): Promise<void> {
        const teamTab = this.page.getByRole('button', { name: "Team's" });
        await teamTab.click();

        await expect(this.page.getByTestId('active tab')).toContainText('Kudos Received By Your Team');
    }

    async teamKudosItems() {
        await expect(this.page.getByTestId('active tab')).toContainText('Kudos Received By Your Team');

        return this.page.getByTestId('team-kudos-item');
    }

    async teamKudosItemsCount() {
        await expect(this.page.getByTestId('active tab')).toContainText('Kudos Received By Your Team');

        await expect(this.page.getByTestId('team-kudos-items')).toBeVisible();
        return this.page.getByTestId('team-kudos-item').count();
    }

    async teamKudosItemsContains(standingsPosition: number, team: string, kudos: string) {
        await expect(this.page.getByTestId('active tab')).toContainText('Kudos Received By Your Team');

        const teamKudosItem = this.page.getByTestId('team-kudos-item').nth(standingsPosition - 1)
        await expect(teamKudosItem.filter({ hasText: team }).filter({ hasText: kudos })).toBeVisible();
    }

    async openTableTab(): Promise<void> {
        const tableTab = this.page.getByRole('button', { name: 'Table' });
        await tableTab.click();

        await expect(this.page.getByTestId('active tab')).toContainText('Kudos Table');
    }

    async positiveKudosTableCount(): Promise<number> {
        await expect(this.page.getByTestId('active tab')).toContainText('Kudos Table');
        await expect(this.page.getByTestId('positive-kudos-standings')).toBeVisible();
        const positiveStandings = this.page.locator('[data-testid^="positive-standing-"]');
        return positiveStandings.count();
    }

    async negativeKudosTableCount(): Promise<number> {
        await expect(this.page.getByTestId('active tab')).toContainText('Kudos Table');
        await expect(this.page.getByTestId('negative-kudos-standings')).toBeVisible();
        const negativeStandings = this.page.locator('[data-testid^="negative-standing-"]');
        return negativeStandings.count();
    }

    async positiveKudosTableContains(team: string, count: string) {
        await expect(this.page.getByTestId('active tab')).toContainText('Kudos Table');

        const positiveStanding = this.page.getByTestId(`positive-standing-${team}`);
        await expect(positiveStanding).toBeVisible();
        await expect(positiveStanding).toContainText(count);
    }

    async negativeKudosTableContains(team: string, count: string) {
        await expect(this.page.getByTestId('active tab')).toContainText('Kudos Table');

        const negativeStanding = this.page.getByTestId(`negative-standing-${team}`);
        await expect(negativeStanding).toBeVisible();
        await expect(negativeStanding).toContainText(count);
    }

    async neutralKudosTableCount(): Promise<number> {
        await expect(this.page.getByTestId('active tab')).toContainText('Kudos Table');
        await expect(this.page.getByTestId('neutral-kudos-standings')).toBeVisible();
        const neutralStandings = this.page.locator('[data-testid^="neutral-standing-"]');
        return neutralStandings.count();
    }

    async neutralKudosTableContains(team: string, count: string) {
        await expect(this.page.getByTestId('active tab')).toContainText('Kudos Table');

        const neutralStanding = this.page.getByTestId(`neutral-standing-${team}`);
        await expect(neutralStanding).toBeVisible();
        await expect(neutralStanding).toContainText(count);
    }

}

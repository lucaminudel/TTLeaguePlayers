import { type Locator, type Page, expect } from '@playwright/test';

export class InviteTeamMembersPage {
    private page: Page;

    constructor(page: Page) {
        this.page = page;
    }

    /**
     * The 15 s is NOT padding against flakiness - it is sized to outlast the league-site fetcher's
     * own retry budget. CLTTLActiveSeason2025PagesFetcher.fetchWithRetry makes 3 attempts with a
     * 2000 ms sleep between them, and this page makes TWO such calls in sequence (the division page
     * for the team id, then the team's own page), so an unreachable site keeps the spinner up for
     * ~8 s by design. Kept identical to MyClubTeamsPage, which hit exactly this.
     */
    private static readonly LOADED_TIMEOUT_MS = 15_000;

    async expectLoaded(): Promise<void> {
        await expect(this.page.locator('h2')).toHaveText('Invite Team Members');
    }

    async openTeamCard(league: string, season: string, team: string): Promise<Locator> {
        const cards = this.page.getByTestId('team-players-card');
        const count = await cards.count();

        for (let index = 0; index < count; index++) {
            const card = cards.nth(index);
            const leagueAndSeason = await card.getByTestId('team-players-league').textContent();
            const teamAndDivision = await card.getByTestId('team-players-team').textContent();

            if (leagueAndSeason?.includes(league) && leagueAndSeason.includes(season) && teamAndDivision?.includes(team)) {

                if (await card.getByTestId('team-players-details').count() === 0) {
                    await card.getByTestId('team-players-header').click();
                }

                await expect(card.getByTestId('team-players-loading'))
                    .toHaveCount(0, { timeout: InviteTeamMembersPage.LOADED_TIMEOUT_MS });

                return card;
            }
        }

        throw new Error(`No team card found for ${league} ${season} ${team}`);
    }

    async openInviteDialogFor(playerName: string): Promise<void> {
        await this.page.getByTestId(`team-player-row-${playerName}`)
            .getByTestId('team-player-invite-button')
            .click();

        await expect(this.page.getByTestId('invite-player-dialog')).toBeVisible();
    }

    async tentativelySendInviteTo(email: string): Promise<void> {
        await this.page.getByTestId('invite-player-email').fill(email);
        await this.page.getByTestId('invite-player-send').click();
    }
}

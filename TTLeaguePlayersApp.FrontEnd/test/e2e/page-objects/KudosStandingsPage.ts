import { type Page, expect } from '@playwright/test';

export class KudosStandingsPage {
    private page: Page;

    constructor(page: Page) {
        this.page = page;
    }

    async selectActiveSeason(league: string, season: string, teamName: string): Promise<void> {
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
    }

    async myKudosItemsCount() {
        await expect(this.page.getByTestId('active tab')).toContainText('Kudos Given By You');

        await expect(this.page.getByTestId('my-kudos-items')).toBeVisible();
        return this.page.getByTestId('my-kudos-item').count();
    }

    async myKudosItemsContains(standingsPosition: number, team: string, kudos: string) {
        await expect(this.page.getByTestId('active tab')).toContainText('Kudos Given By You');

        const myKudosItem = this.page.getByTestId('my-kudos-item').nth(standingsPosition-1)
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

        const teamKudosItem = this.page.getByTestId('team-kudos-item').nth(standingsPosition-1)
        await expect(teamKudosItem.filter({ hasText: team }).filter({ hasText: kudos })).toBeVisible();
    }

    async openTableTab(): Promise<void> {
        const tableTab = this.page.getByRole('button', { name: 'Table' });
        await tableTab.click();

        await expect(this.page.getByTestId('active tab')).toContainText('Division Team Standings');
    }

    async positiveKudosTableCount(): Promise<number> {
        await expect(this.page.getByTestId('active tab')).toContainText('Division Team Standings');
        await expect(this.page.getByTestId('positive-kudos-standings')).toBeVisible();
        const positiveStandings = this.page.locator('[data-testid^="positive-standing-"]');
        return positiveStandings.count();
    }

    async negativeKudosTableCount(): Promise<number> {
        await expect(this.page.getByTestId('active tab')).toContainText('Division Team Standings');
        await expect(this.page.getByTestId('negative-kudos-standings')).toBeVisible();
        const negativeStandings = this.page.locator('[data-testid^="negative-standing-"]');
        return negativeStandings.count();
    }

    async positiveKudosTableContains(team: string, count: string) {
        await expect(this.page.getByTestId('active tab')).toContainText('Division Team Standings');

        const positiveStanding = this.page.getByTestId(`positive-standing-${team}`);
        await expect(positiveStanding).toBeVisible();
        await expect(positiveStanding).toContainText(count);
    }

    async negativeKudosTableContains(team: string, count: string) {
        await expect(this.page.getByTestId('active tab')).toContainText('Division Team Standings');

        const negativeStanding = this.page.getByTestId(`negative-standing-${team}`);
        await expect(negativeStanding).toBeVisible();
        await expect(negativeStanding).toContainText(count);
    }
    
}

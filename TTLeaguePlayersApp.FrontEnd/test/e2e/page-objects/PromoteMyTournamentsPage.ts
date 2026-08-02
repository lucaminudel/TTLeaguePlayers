import { type Page, expect } from '@playwright/test';

interface TournamentFields {
    tournament_name?: string;
    tournament_info?: string;
    instagram?: string;
    facebook?: string;
    start_date?: string;
    end_date?: string;
}

export class PromoteMyTournamentsPage {
    private page: Page;

    constructor(page: Page) {
        this.page = page;
    }

    async tentativelySelectClub(location: string): Promise<void> {
        const locationButton = this.page.getByRole('button', { name: new RegExp(`^${location}$`) });
        await locationButton.click();
    }

    async selectClub(location: string, clubName: string, hasTournaments = false): Promise<void> {
        await this.tentativelySelectClub(location);

        const locationButton = this.page.getByRole('button', { name: new RegExp(`^${location}$`) });
        await expect(locationButton).toHaveClass(/bg-action-accent/);
        await expect(this.page.getByText(`Now you can promote tournaments for ${clubName} in ${location}.`)).toBeVisible();

        await expect(this.page.getByText('Loading tournaments…')).not.toBeVisible({ timeout: 10000 });

        if (!hasTournaments) {
            await expect(this.page.getByText('No tournaments found. Add your first tournament below.')).toBeVisible();
        }

        await expect(this.page.getByRole('button', { name: 'ADD TOURNAMENT' })).toBeEnabled();
    }

    async openAddTournamentForm(): Promise<void> {
        await this.page.getByRole('button', { name: 'ADD TOURNAMENT' }).click();
        await expect(this.page.getByRole('heading', { name: 'Add Tournament' })).toBeVisible();
    }

    async fillTournamentFieldsNoClick(fields: TournamentFields): Promise<void> {
        await this.fillFields(fields);
    }

    async tentativelyAddTournament(fields: TournamentFields): Promise<void> {
        await this.fillFields(fields);
        await this.page.getByRole('button', { name: 'ADD', exact: true }).click();
    }

    async addTournament(fields: TournamentFields): Promise<void> {
        await this.tentativelyAddTournament(fields);
        await expect(this.page.getByRole('heading', { name: 'Add Tournament' })).not.toBeVisible();
    }

    async openEditTournamentForm(tournamentName: string): Promise<void> {
        const row = this.page.getByRole('row', { name: new RegExp(tournamentName) });
        await row.getByTitle('Edit').click();
        await expect(this.page.getByRole('heading', { name: 'Edit Tournament' })).toBeVisible();
    }

    async tentativelyUpdateTournament(fields: TournamentFields): Promise<void> {
        await this.fillFields(fields);
        await this.page.getByRole('button', { name: 'UPDATE', exact: true }).click();
    }

    async updateTournament(fields: TournamentFields): Promise<void> {
        await this.tentativelyUpdateTournament(fields);
        await expect(this.page.getByRole('heading', { name: 'Edit Tournament' })).not.toBeVisible();
    }

    async openDeleteTournamentForm(tournamentName: string): Promise<void> {
        const row = this.page.getByRole('row', { name: new RegExp(tournamentName) });
        await row.getByTitle('Delete').click();

        const title = this.page.getByTestId('delete-confirm-title');
        await expect(title).toContainText('Confirm Removal');
        await expect(title).toContainText(tournamentName);
    }

    async tentativelyConfirmDeleteTournament(): Promise<void> {
        await this.page.getByRole('button', { name: 'Confirm Remove' }).click();
    }

    async confirmDeleteTournament(): Promise<void> {
        await this.tentativelyConfirmDeleteTournament();
        await expect(this.page.getByTestId('delete-confirm-title')).not.toBeVisible();
    }

    private async fillFields(fields: TournamentFields): Promise<void> {
        if (fields.tournament_name !== undefined) await this.page.getByLabel('Tournament Name').fill(fields.tournament_name);
        if (fields.tournament_info !== undefined) await this.page.getByLabel('Tournament Info URL').fill(fields.tournament_info);
        if (fields.instagram !== undefined) await this.page.getByLabel('Instagram Post').fill(fields.instagram);
        if (fields.facebook !== undefined) await this.page.getByLabel('Facebook Post').fill(fields.facebook);
        if (fields.start_date !== undefined) await this.page.getByLabel('Start Date').fill(fields.start_date);
        if (fields.end_date !== undefined) await this.page.getByLabel('End Date').fill(fields.end_date);
    }
}

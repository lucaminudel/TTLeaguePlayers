import { test, expect, type Page } from '@playwright/test';
import { User, PromoteMyTournamentsPage } from './page-objects/User';

const EXECUTE_LIVE_COGNITO_TESTS = process.env.EXECUTE_LIVE_COGNITO_TESTS === 'true';

// Fixed clock time: 15 January 2026 11:01:48 UTC (epoch: 1768474908)
const FIXED_CLOCK_TIME = '2026-01-15T11:01:48.000Z';

// The tournament date-range validation and display use the real wall-clock (not the fixed
// test clock above), so dates must be computed relative to today to stay valid over time.
function futureDateString(daysFromNow: number): string {
    const date = new Date();
    date.setDate(date.getDate() + daysFromNow);
    return date.toISOString().split('T')[0];
}

// Captures the next tournament-upsert PUT request so it can be deleted in afterAll cleanup.
function captureCreatedTournamentRequest(page: Page, createdTournaments: { url: string; auth: string }[]): void {
    page.once('request', (request) => {
        if (request.url().includes('/tournaments/') && request.method() === 'PUT') {
            createdTournaments.push({
                url: request.url(),
                auth: request.headers().authorization,
            });
        }
    });
}

test.describe('Promote My Tournaments Page', () => {
    test.skip(!EXECUTE_LIVE_COGNITO_TESTS, 'Skipping Cognito integration test');

    const createdTournaments: { url: string; auth: string }[] = [];

    test.afterAll(async ({ request }) => {
        if (createdTournaments.length === 0) return;

        console.log(`\n🧹 [Cleanup] Deleting ${String(createdTournaments.length)} created tournament(s)...`);
        for (const tournament of createdTournaments) {
            try {
                const response = await request.delete(tournament.url, {
                    headers: { 'Authorization': tournament.auth },
                });
                if (response.ok()) {
                    console.log(`✅ [Cleanup] Successfully deleted tournament at ${tournament.url}.`);
                } else {
                    console.error(`❌ [Cleanup] Delete failed with status ${String(response.status())}: ${await response.text()}`);
                }
            } catch (error) {
                console.error('❌ [Cleanup] Delete threw an error:', error instanceof Error ? error.message : error);
            }
        }
    });

    test('Complete happy-path scenario', async ({ page }) => {
        const user = new User(page);
        let promoteMyTournamentsPage: PromoteMyTournamentsPage;

        const firstTournament = {
            tournament_name: 'Summer Open',
            tournament_info: 'https://example.com/summer-open',
            instagram: 'https://www.instagram.com/p/CxYz123abcd/',
            facebook: 'https://www.facebook.com/groups/123456789/',
            start_date: futureDateString(30),
            end_date: futureDateString(32),
        };

        const secondTournament = {
            tournament_name: 'Autumn Classic',
            tournament_info: 'https://example.com/autumn-classic',
            instagram: 'https://www.instagram.com/p/AutumnClassic123/',
            facebook: 'https://www.facebook.com/groups/222222222/',
            start_date: futureDateString(60),
            end_date: futureDateString(62),
        };

        const thirdTournament = {
            tournament_name: 'Winter Cup',
            tournament_info: 'https://example.com/winter-cup',
            instagram: 'https://www.instagram.com/p/WinterCup456/',
            facebook: 'https://www.facebook.com/groups/333333333/',
            start_date: futureDateString(90),
            end_date: futureDateString(92),
        };

        await test.step('Given the Club Manager is logged in', async () => {
            // Set fixed clock time to 15 January 2026, valid for all 3 leagues season
            await user.setFixedClockTime(FIXED_CLOCK_TIME);

            // Navigate to login
            const loginPage = await user.navigateToLogin();

            // Login with club manager user and land on the homepage
            await loginPage.loginAndWaitForHome('test_already_registered5@user.test', 'aA1!56789012');
        });

        await test.step('When the Club Manager navigates to Promote My Tournaments via the menu', async () => {
            await user.menu.open();
            promoteMyTournamentsPage = await user.menu.navigateToPromoteMyTournaments();
        });

        await test.step('And selects the London Morpeth club', async () => {
            await promoteMyTournamentsPage.selectClub('London', 'Morpeth');

            // Verify no tournaments are shown yet for this club
            await expect(page.getByRole('table')).not.toBeVisible();
        });

        await test.step('Successfully add a tournament', async () => {
            const validTournament = firstTournament;

            await test.step('Open the Add Tournament form and confirm the ADD button label is visible', async () => {
                await promoteMyTournamentsPage.openAddTournamentForm();

                await expect(page.getByRole('button', { name: 'ADD', exact: true })).toBeVisible();
                await expect(page.getByRole('button', { name: 'UPDATE', exact: true })).not.toBeVisible();
            });

            await test.step('Exercise all the validation errors and see the Test links disabled', async () => {
                await promoteMyTournamentsPage.tentativelyAddTournament({
                    tournament_name: '',
                    tournament_info: 'not a link',
                    instagram: 'not a link',
                    facebook: 'invalid fb link!',
                    start_date: '',
                    end_date: '',
                });

                await expect(page.getByText('Tournament name is required.')).toBeVisible();
                await expect(page.getByText('Please enter a valid tournament info URL.')).toBeVisible();
                await expect(page.getByText(/Please enter a valid Instagram post URL/)).toBeVisible();
                await expect(page.getByText('Please enter a valid Facebook link.')).toBeVisible();
                await expect(page.getByText('Start date is required.')).toBeVisible();
                await expect(page.getByText('End date is required.')).toBeVisible();

                // Verify all Test link buttons are disabled (no valid link to test yet)
                const testLinks = page.getByRole('link', { name: 'Test' });
                await expect(testLinks).toHaveCount(0);

                const testSpans = page.locator('span', { hasText: 'Test' });
                await expect(testSpans).toHaveCount(3);
            });

            await test.step('Fix the validation errors and see the Test links become enabled', async () => {
                await promoteMyTournamentsPage.fillTournamentFieldsNoClick(validTournament);

                // Verify all 3 Test link buttons are now enabled and open the correct links
                const testLinks = page.getByRole('link', { name: 'Test' });
                await expect(testLinks).toHaveCount(3);

                const expectedUrls = [
                    validTournament.tournament_info,
                    validTournament.instagram,
                    validTournament.facebook,
                ];
                for (let i = 0; i < expectedUrls.length; i++) {
                    await expect(testLinks.nth(i)).toHaveAttribute('href', expectedUrls[i]);
                    await expect(testLinks.nth(i)).toHaveAttribute('target', '_blank');
                }

                // Verify the previous validation errors are gone
                await expect(page.getByText('Tournament name is required.')).not.toBeVisible();
                await expect(page.getByText('Please enter a valid tournament info URL.')).not.toBeVisible();
                await expect(page.getByText(/Please enter a valid Instagram post URL/)).not.toBeVisible();
                await expect(page.getByText('Please enter a valid Facebook link.')).not.toBeVisible();
                await expect(page.getByText('Start date is required.')).not.toBeVisible();
                await expect(page.getByText('End date is required.')).not.toBeVisible();
            });

            await test.step('Click ADD and verify only the new tournament is visible on the main page', async () => {
                captureCreatedTournamentRequest(page, createdTournaments);

                await promoteMyTournamentsPage.addTournament(validTournament);

                await expect(page.getByRole('table')).toBeVisible();
                const tournamentLinks = page.getByTestId('tournament-link');
                await expect(tournamentLinks).toHaveCount(1);
                await expect(tournamentLinks.first()).toContainText(validTournament.tournament_name);
            });
        });

        await test.step('Successfully add two more tournaments', async () => {
            const expectedTournamentNames = [firstTournament.tournament_name];

            for (const tournament of [secondTournament, thirdTournament]) {
                await test.step(`Add "${tournament.tournament_name}"`, async () => {
                    await test.step('Confirm adding the tournament by clicking ADD', async () => {
                        await promoteMyTournamentsPage.openAddTournamentForm();

                        captureCreatedTournamentRequest(page, createdTournaments);
                        await promoteMyTournamentsPage.addTournament(tournament);
                    });

                    await test.step('Verify the new tournament and all previously added tournaments are visible', async () => {
                        expectedTournamentNames.push(tournament.tournament_name);

                        const tournamentLinks = page.getByTestId('tournament-link');
                        await expect(tournamentLinks).toHaveCount(expectedTournamentNames.length);

                        for (const expectedName of expectedTournamentNames) {
                            await expect(tournamentLinks.filter({ hasText: expectedName })).toHaveCount(1);
                        }
                    });
                });
            }
        });

        await test.step('Successfully edit one tournament', async () => {
            const updatedInfo = {
                tournament_info: 'https://example.com/autumn-classic-updated',
                instagram: 'https://www.instagram.com/p/AutumnClassicUpdated999/',
                facebook: 'https://www.facebook.com/groups/999999999/',
                start_date: futureDateString(65),
                end_date: futureDateString(67),
            };

            let originalLinkText: string | null;

            await test.step('Select the Autumn Classic tournament for edit and confirm the UPDATE button label is visible', async () => {
                await promoteMyTournamentsPage.openEditTournamentForm(secondTournament.tournament_name);

                await expect(page.getByRole('button', { name: 'UPDATE', exact: true })).toBeVisible();
                await expect(page.getByRole('button', { name: 'ADD', exact: true })).not.toBeVisible();
            });

            await test.step('See that the edit form is pre-filled with the correct tournament', async () => {
                await expect(page.getByLabel('Tournament Name')).toHaveValue(secondTournament.tournament_name);
                await expect(page.getByLabel('Tournament Name')).toBeDisabled();
                await expect(page.getByLabel('Tournament Info URL')).toHaveValue(secondTournament.tournament_info);
                await expect(page.getByLabel('Instagram Post')).toHaveValue(secondTournament.instagram);
                await expect(page.getByLabel('Facebook Post')).toHaveValue(secondTournament.facebook);
                await expect(page.getByLabel('Start Date')).toHaveValue(secondTournament.start_date);
                await expect(page.getByLabel('End Date')).toHaveValue(secondTournament.end_date);

                originalLinkText = await page.getByTestId('tournament-link').filter({ hasText: secondTournament.tournament_name }).textContent();
            });

            await test.step('Update the info (not the name) and confirm the change by clicking UPDATE', async () => {
                await promoteMyTournamentsPage.updateTournament(updatedInfo);
            });

            await test.step('Verify the updated tournament info is visualised in the grid', async () => {
                const tournamentLinks = page.getByTestId('tournament-link');
                await expect(tournamentLinks).toHaveCount(3);

                // Name is unchanged (it cannot be edited), but the date range in the link text has changed
                const updatedLink = tournamentLinks.filter({ hasText: secondTournament.tournament_name });
                await expect(updatedLink).toHaveCount(1);
                await expect(updatedLink).not.toHaveText(originalLinkText ?? '');
                await expect(updatedLink).toHaveAttribute('href', updatedInfo.tournament_info);

                const row = page.getByRole('row', { name: new RegExp(secondTournament.tournament_name) });
                await expect(row.getByTestId('tournament-instagram-link')).toHaveAttribute('href', updatedInfo.instagram);
                await expect(row.getByTestId('tournament-facebook-link')).toHaveAttribute('href', updatedInfo.facebook);

                // The other tournaments are untouched
                await expect(tournamentLinks.filter({ hasText: firstTournament.tournament_name })).toHaveCount(1);
                await expect(tournamentLinks.filter({ hasText: thirdTournament.tournament_name })).toHaveCount(1);
            });
        });

        await test.step('Successfully delete one tournament', async () => {
            await test.step('Select the Winter Cup tournament for delete and confirm the REMOVE label is visible', async () => {
                await promoteMyTournamentsPage.openDeleteTournamentForm(thirdTournament.tournament_name);

                await expect(page.getByText('REMOVE', { exact: true })).toBeVisible();
                await expect(page.getByRole('button', { name: 'Confirm Remove' })).toBeVisible();
            });

            await test.step('Confirm the delete', async () => {
                await promoteMyTournamentsPage.confirmDeleteTournament();

                // Remove from the cleanup list since it has already been deleted
                const deletedIndex = createdTournaments.findIndex((t) => t.url.includes(encodeURIComponent(thirdTournament.tournament_name)));
                if (deletedIndex !== -1) {
                    createdTournaments.splice(deletedIndex, 1);
                }
            });

            await test.step('Verify the tournament is gone and the remaining tournaments are still visible', async () => {
                const tournamentLinks = page.getByTestId('tournament-link');
                await expect(tournamentLinks).toHaveCount(2);

                await expect(tournamentLinks.filter({ hasText: thirdTournament.tournament_name })).toHaveCount(0);
                await expect(tournamentLinks.filter({ hasText: firstTournament.tournament_name })).toHaveCount(1);
                await expect(tournamentLinks.filter({ hasText: secondTournament.tournament_name })).toHaveCount(1);
            });
        });
    });

    test('API errors on GET/ADD/UPDATE and REMOVE are displayed on the page', async ({ page }) => {
        const user = new User(page);
        let promoteMyTournamentsPage: PromoteMyTournamentsPage;

        const existingTournament = {
            tournament_name: 'Existing Tournament',
            tournament_info: 'https://example.com/existing',
            instagram: null,
            facebook: null,
            start_date: Math.floor(new Date(futureDateString(10)).getTime() / 1000),
            end_date: Math.floor(new Date(futureDateString(12)).getTime() / 1000),
        };

        const routeTournamentsList = async (status: number, body: unknown) => {
            await page.unrouteAll();
            await page.route('**/clubs/**', async (route) => {
                const request = route.request();
                if (request.method() === 'GET' && request.url().endsWith('/tournaments')) {
                    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
                } else {
                    await route.continue();
                }
            });
        };

        const routeTournamentUpsertOrDelete = async (method: 'PUT' | 'DELETE') => {
            await page.route('**/clubs/**', async (route) => {
                const request = route.request();
                if (request.method() === method && request.url().includes('/tournaments/')) {
                    await route.fulfill({ status: 500, body: 'Internal Server Error' });
                } else {
                    await route.continue();
                }
            });
        };

        await test.step('Given the Club Manager is logged in and navigates to Promote My Tournaments, with GET failing', async () => {
            await user.setFixedClockTime(FIXED_CLOCK_TIME);
            const loginPage = await user.navigateToLogin();
            await loginPage.loginAndWaitForHome('test_already_registered5@user.test', 'aA1!56789012');

            await routeTournamentsList(500, { message: 'Tournaments service is temporarily unavailable.' });

            await user.menu.open();
            promoteMyTournamentsPage = await user.menu.navigateToPromoteMyTournaments();
        });

        await test.step('When GET fails, the error message is displayed on the page', async () => {
            await promoteMyTournamentsPage.tentativelySelectClub('London');

            await expect(page.getByTestId('main-error')).toContainText('Tournaments service is temporarily unavailable.');
        });

        await test.step('Given the Club Manager is on the page with London selected and no existing tournaments', async () => {
            await routeTournamentsList(404, 'Not Found');

            await user.navigateToHome();
            await user.menu.open();
            promoteMyTournamentsPage = await user.menu.navigateToPromoteMyTournaments();
            await promoteMyTournamentsPage.selectClub('London', 'Morpeth');
        });

        await test.step('When ADD fails, the error message is displayed and the form stays open', async () => {
            await routeTournamentUpsertOrDelete('PUT');

            await promoteMyTournamentsPage.openAddTournamentForm();
            await promoteMyTournamentsPage.tentativelyAddTournament({
                tournament_name: 'Broken Tournament',
                tournament_info: 'https://example.com/broken',
                start_date: futureDateString(30),
                end_date: futureDateString(32),
            });

            await expect(page.getByText('The server is having trouble right now. Please try again in a few minutes.')).toBeVisible();
            await expect(page.getByRole('heading', { name: 'Add Tournament' })).toBeVisible();
        });

        await test.step('Given the Club Manager is on the page with London selected and an existing tournament', async () => {
            await routeTournamentsList(200, [existingTournament]);

            await user.navigateToHome();
            await user.menu.open();
            promoteMyTournamentsPage = await user.menu.navigateToPromoteMyTournaments();
            await promoteMyTournamentsPage.selectClub('London', 'Morpeth', true);
        });

        await test.step('When UPDATE fails, the error message is displayed and the form stays open', async () => {
            await routeTournamentUpsertOrDelete('PUT');

            await promoteMyTournamentsPage.openEditTournamentForm(existingTournament.tournament_name);
            await promoteMyTournamentsPage.tentativelyUpdateTournament({ tournament_info: 'https://example.com/existing-updated' });

            await expect(page.getByText('The server is having trouble right now. Please try again in a few minutes.')).toBeVisible();
            await expect(page.getByRole('heading', { name: 'Edit Tournament' })).toBeVisible();
        });

        await test.step('Given the Club Manager is on the page with London selected and an existing tournament', async () => {
            await routeTournamentsList(200, [existingTournament]);

            await user.navigateToHome();
            await user.menu.open();
            promoteMyTournamentsPage = await user.menu.navigateToPromoteMyTournaments();
            await promoteMyTournamentsPage.selectClub('London', 'Morpeth', true);
        });

        await test.step('When REMOVE fails, the error message is displayed and the confirmation modal stays open', async () => {
            await routeTournamentUpsertOrDelete('DELETE');

            await promoteMyTournamentsPage.openDeleteTournamentForm(existingTournament.tournament_name);
            await promoteMyTournamentsPage.tentativelyConfirmDeleteTournament();

            await expect(page.getByText('The server is having trouble right now. Please try again in a few minutes.')).toBeVisible();
            await expect(page.getByTestId('delete-confirm-title')).toBeVisible();
        });
    });
});

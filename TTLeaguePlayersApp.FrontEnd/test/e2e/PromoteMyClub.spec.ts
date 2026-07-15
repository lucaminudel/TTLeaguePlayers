import { test, expect } from '@playwright/test';
import { User, PromoteMyClubPage } from './page-objects/User';

const EXECUTE_LIVE_COGNITO_TESTS = process.env.EXECUTE_LIVE_COGNITO_TESTS === 'true';

// Fixed clock time: 15 January 2026 11:01:48 UTC (epoch: 1768474908)
const FIXED_CLOCK_TIME = '2026-01-15T11:01:48.000Z';

test.describe('Promote My Club Page', () => {
    test.skip(!EXECUTE_LIVE_COGNITO_TESTS, 'Skipping Cognito integration test');

    let addedClub: { url: string; auth: string } | null = null;

    test.afterAll(async ({ request }) => {
        if (!addedClub) return;

        console.log('\n🧹 [Cleanup] Deleting added London club info...');
        try {
            const response = await request.delete(addedClub.url, {
                headers: { 'Authorization': addedClub.auth },
            });
            if (response.ok()) {
                console.log('✅ [Cleanup] Successfully deleted London club info.');
            } else {
                console.error(`❌ [Cleanup] Delete failed with status ${String(response.status())}: ${await response.text()}`);
            }
        } catch (error) {
            console.error('❌ [Cleanup] Delete threw an error:', error instanceof Error ? error.message : error);
        }
    });

    test('Complete happy-path scenario', async ({ page }) => {
        const user = new User(page);
        let promoteMyCLubPage: PromoteMyClubPage;

        await test.step('Given the Clubs Manager is logged in', async () => {

            // Set fixed clock time to 15 January 2026, valid for all 3 leagues season
            await user.setFixedClockTime(FIXED_CLOCK_TIME);

            // Navigate to login
            const loginPage = await user.navigateToLogin();

            // Login with club manager user and click "Ready to play?" button
            const homePage = await loginPage.loginAndWaitForHome('test_already_registered5@user.test', 'aA1!56789012');
            promoteMyCLubPage = await homePage.readyToPlayAsClubManager();
        });

        await test.step('And the available clubs are in London and Manchester', async () => {
            // Verify that club buttons are visible and none is selected
            const locations = ["London", "Manchester"];
            for (const location of locations) {
                const clubButton = page.getByRole('button', { name: new RegExp(`^${location}$`) });
    
                await expect(clubButton).toBeVisible();
    
                // Verify button is not selected (no accent background)
                await expect(clubButton).not.toHaveClass(/bg-action-accent/);                
            }
        });

        await test.step('Select the London Morpeth club', async () => {
            await promoteMyCLubPage.selectClub('London', 'Morpeth');

            // Verify ADD and REMOVE are disabled
            const addButton = page.getByRole('button', { name: 'ADD' });
            await expect(addButton).toBeDisabled();

            const removeButton = page.getByRole('button', { name: 'REMOVE' });
            await expect(removeButton).toBeDisabled();
        });

        await test.step('Input invalid fileds values and see the validaton errors', async () => {
            // Add non valid fields values for optional fields
            await page.getByLabel('YouTube').fill('not a link');
            await page.getByLabel('Instagram Handle').fill('invalid handle!');
            await page.getByLabel('Facebook Link').fill('invalid fb link!');
            await page.getByLabel('Homepage').fill('');

            // Trigger validation by clicking ADD
            const addButton = page.getByRole('button', { name: 'ADD' });
            await addButton.click();

            // verify that the related field error message is displayed
            await expect(page.getByText('Please enter a valid YouTube URL or handle.')).toBeVisible();
            await expect(page.getByText('Please enter a valid Instagram handle or URL.')).toBeVisible();
            await expect(page.getByText('Please enter a valid Facebook link.')).toBeVisible();

            // verify that all the test link buttons are disabled
            const testLinks = page.getByRole('link', { name: 'Test' });
            await expect(testLinks).toHaveCount(0);
            
            const testSpans = page.locator('span', { hasText: 'Test' });
            await expect(testSpans).toHaveCount(4);
        });

        await test.step('Miss the mandatory homepage input field and see the validation error', async () => {
            // Fill optional fields only, leave mandatory homepage empty
            await page.getByLabel('YouTube').fill('https://www.youtube.com/watch?v=MiiPA2qE59o&list=PLiVZvnM0xvs89AtfIl8w7nNZ1W68FJSiR');
            await page.getByLabel('Instagram Handle').fill('@morpethschooltt');
            await page.getByLabel('Facebook Link').fill('https://www.facebook.com/profile.php?id=100006370457371');
            await page.getByLabel('Homepage').fill('');


            // Verify all test link buttons are now enabled and open correct links
            const testLinks = page.getByRole('link', { name: 'Test' });
            await expect(testLinks).toHaveCount(3);

            const expectedUrls = [
                'https://www.instagram.com/morpethschooltt',
                'https://www.youtube.com/watch?v=MiiPA2qE59o&list=PLiVZvnM0xvs89AtfIl8w7nNZ1W68FJSiR',
                'https://www.facebook.com/profile.php?id=100006370457371',
            ];
            for (let i = 0; i < expectedUrls.length; i++) {
                await expect(testLinks.nth(i)).toHaveAttribute('href', expectedUrls[i]);
                await expect(testLinks.nth(i)).toHaveAttribute('target', '_blank');
            }

            // Verify ADD is enabled and REMOVE is disabled
            const addButton = page.getByRole('button', { name: 'ADD' });
            await expect(addButton).toBeEnabled();

            // Click ADD and verify mandatory homepage error
            await addButton.click();
            await expect(page.getByText('Homepage is required.')).toBeVisible();
        });

        await test.step('Fill all the Club info field successfully and click Add the London CLub', async () => {
            // Capture the PUT request to record url and auth token for afterAll cleanup
            page.once('request', (request) => {
                if (request.url().includes('/clubs/') && request.method() === 'PUT') {
                    addedClub = {
                        url: request.url(),
                        auth: request.headers().authorization,
                    };
                }
            });

            // Fill all optional fields and the mandatory homepage
            const testLinks = page.getByRole('link', { name: 'Test' });
            await page.getByLabel('YouTube').fill('https://www.youtube.com/watch?v=MiiPA2qE59o&list=PLiVZvnM0xvs89AtfIl8w7nNZ1W68FJSiR');
            await page.getByLabel('Instagram Handle').fill('@morpethschooltt');
            await page.getByLabel('Facebook Link').fill('https://www.facebook.com/groups/839330283232999/');
            await page.getByLabel('Homepage Link').fill('http://morpethttc.co.uk/');

            // Verify all 4 test link buttons are enabled and point to the correct URLs
            await expect(testLinks).toHaveCount(4);

            const expectedUrls = [
                'http://morpethttc.co.uk/',
                'https://www.instagram.com/morpethschooltt',
                'https://www.youtube.com/watch?v=MiiPA2qE59o&list=PLiVZvnM0xvs89AtfIl8w7nNZ1W68FJSiR',
                'https://www.facebook.com/groups/839330283232999/',
            ];
            for (let i = 0; i < expectedUrls.length; i++) {
                await expect(testLinks.nth(i)).toHaveAttribute('href', expectedUrls[i]);
                await expect(testLinks.nth(i)).toHaveAttribute('target', '_blank');
            }

            // Verify ADD is enabled and REMOVE is disabled
            await expect(page.getByRole('button', { name: 'ADD' })).toBeEnabled();
            await expect(page.getByRole('button', { name: 'REMOVE' })).toBeDisabled();

            // Click ADD and verify redirect to clubs-and-tournaments
            await promoteMyCLubPage.addClubInfo({
                youtube: 'https://www.youtube.com/watch?v=MiiPA2qE59o&list=PLiVZvnM0xvs89AtfIl8w7nNZ1W68FJSiR',
                instagram: '@morpethschooltt',
                facebook: 'https://www.facebook.com/groups/839330283232999/',
                homepage: 'http://morpethttc.co.uk/',
            });

            // Navigate back to Promote My Club page
            promoteMyCLubPage = await user.navigateToPromoteMyClub();

            // Select London club and verify saved info is shown
            await promoteMyCLubPage.selectClub('London', 'Morpeth', true);

            await expect(page.getByLabel('Homepage Link')).toHaveValue('http://morpethttc.co.uk/');
            await expect(page.getByLabel('Instagram Handle')).toHaveValue('@morpethschooltt');
            await expect(page.getByLabel('YouTube')).toHaveValue('https://www.youtube.com/watch?v=MiiPA2qE59o&list=PLiVZvnM0xvs89AtfIl8w7nNZ1W68FJSiR');
            await expect(page.getByLabel('Facebook Link')).toHaveValue('https://www.facebook.com/groups/839330283232999/');

            // Verify UPDATE is disabled and REMOVE is enabled
            await expect(page.getByRole('button', { name: 'UPDATE' })).toBeDisabled();
            await expect(page.getByRole('button', { name: 'REMOVE' })).toBeEnabled();
        });

        await test.step('Click the Manchester Club and check that it is still missing the Club info', async () => {
            await promoteMyCLubPage.selectClub('Manchester', 'Morpeth M');
        });

        await test.step('Click the London Club, successfully update one field, and then delete the Club Info', async () => {
            // Click London and verify UPDATE disabled, REMOVE enabled
            await promoteMyCLubPage.selectClub('London', 'Morpeth', true);
            await expect(page.getByRole('button', { name: 'UPDATE' })).toBeDisabled();
            await expect(page.getByRole('button', { name: 'REMOVE' })).toBeEnabled();

            // Fill Facebook field, verify UPDATE and REMOVE are both enabled, then click UPDATE
            await page.getByLabel('Facebook Link').fill('https://www.facebook.com/profile.php?id=100006370457371');
            await expect(page.getByRole('button', { name: 'UPDATE' })).toBeEnabled();
            await expect(page.getByRole('button', { name: 'REMOVE' })).toBeEnabled();
            await promoteMyCLubPage.updateClubInfo({});

            // Navigate back and verify updated Facebook value
            promoteMyCLubPage = await user.navigateToPromoteMyClub();
            await promoteMyCLubPage.selectClub('London', 'Morpeth', true);
            await expect(page.getByLabel('Facebook Link')).toHaveValue('https://www.facebook.com/profile.php?id=100006370457371');

            // Verify UPDATE disabled, REMOVE enabled
            await expect(page.getByRole('button', { name: 'UPDATE' })).toBeDisabled();
            await expect(page.getByRole('button', { name: 'REMOVE' })).toBeEnabled();

            // Click REMOVE, then CANCEL — verify state is unchanged
            await promoteMyCLubPage.tentativeRemoveClubInfo();
            await expect(page.getByRole('button', { name: 'UPDATE' })).toBeDisabled();
            await expect(page.getByRole('button', { name: 'REMOVE' })).toBeEnabled();

            // Click REMOVE, then CONFIRM
            await promoteMyCLubPage.removeClubInfo();

            // Navigate back and verify London club info is now empty
            promoteMyCLubPage = await user.navigateToPromoteMyClub();
            await promoteMyCLubPage.selectClub('London', 'Morpeth');

            // Verify ADD and REMOVE are disabled
            await expect(page.getByRole('button', { name: 'ADD' })).toBeDisabled();
            await expect(page.getByRole('button', { name: 'REMOVE' })).toBeDisabled();

            addedClub = null; // Reset addedClub to null since it has been deleted
        });
        
    });

    test('API errors on ADD/UPDATE and REMOVE are displayed on the page', async ({ page }) => {
        const user = new User(page);

        await test.step('Given the Club Manager is logged in and on the Promote My Club page with London selected and no existing club info', async () => {
            await user.setFixedClockTime(FIXED_CLOCK_TIME);
            const loginPage = await user.navigateToLogin();
            await loginPage.loginAndWaitForHome('test_already_registered5@user.test', 'aA1!56789012');

            await page.route('**/clubs/**', async (route) => {
                if (route.request().method() === 'GET') {
                    await route.fulfill({ status: 404, body: 'Not Found' });
                } else {
                    await route.continue();
                }
            });

            const promoteMyCLubPage = await user.navigateToPromoteMyClub();
            await promoteMyCLubPage.selectClub('London', 'Morpeth');
        });

        await test.step('When ADD fails, the error message is displayed on the page', async () => {
            await page.route('**/clubs/**', async (route) => {
                if (route.request().method() === 'PUT') {
                    await route.fulfill({ status: 500, body: 'Internal Server Error' });
                } else {
                    await route.continue();
                }
            });

            await page.getByLabel('Homepage Link').fill('http://morpethttc.co.uk/');
            await page.getByRole('button', { name: 'ADD' }).click();

            await expect(page.getByText('The server is having trouble right now. Please try again in a few minutes.')).toBeVisible();
            await expect(page).not.toHaveURL('/#/clubs-and-tournaments');
        });

        await test.step('Given the Club Manager is on the Promote My Club page with London selected and existing club info', async () => {
            await page.unrouteAll();
            await page.route('**/clubs/**', async (route) => {
                if (route.request().method() === 'GET') {
                    await route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        body: JSON.stringify({
                            location: 'London',
                            club_name: 'Morpeth',
                            homepage: 'http://morpethttc.co.uk/',
                            instagram: null,
                            facebook: null,
                            youtube: null,
                            tournaments: [],
                        }),
                    });
                } else {
                    await route.continue();
                }
            });

            await user.navigateToHome();
            const promoteMyCLubPage = await user.navigateToPromoteMyClub();
            await promoteMyCLubPage.selectClub('London', 'Morpeth', true);
        });

        await test.step('When UPDATE fails, the error message is displayed on the page', async () => {
            await page.route('**/clubs/**', async (route) => {
                if (route.request().method() === 'PUT') {
                    await route.fulfill({ status: 500, body: 'Internal Server Error' });
                } else {
                    await route.continue();
                }
            });

            await page.getByLabel('Homepage Link').fill('http://morpethttc-updated.co.uk/');
            await page.getByRole('button', { name: 'UPDATE' }).click();

            await expect(page.getByText('The server is having trouble right now. Please try again in a few minutes.')).toBeVisible();
            await expect(page).not.toHaveURL('/#/clubs-and-tournaments');
        });

        await test.step('When REMOVE fails, the modal closes and the error message is displayed on the main page', async () => {
            await page.unrouteAll();
            await page.route('**/clubs/**', async (route) => {
                if (route.request().method() === 'GET') {
                    await route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        body: JSON.stringify({
                            location: 'London',
                            club_name: 'Morpeth',
                            homepage: 'http://morpethttc.co.uk/',
                            instagram: null,
                            facebook: null,
                            youtube: null,
                            tournaments: [],
                        }),
                    });
                } else if (route.request().method() === 'DELETE') {
                    await route.fulfill({ status: 500, body: 'Internal Server Error' });
                } else {
                    await route.continue();
                }
            });

            await user.navigateToHome();
            const promoteMyCLubPage = await user.navigateToPromoteMyClub();
            await promoteMyCLubPage.selectClub('London', 'Morpeth', true);

            await expect(page.getByText('The server is having trouble right now. Please try again in a few minutes.')).not.toBeVisible();

            await page.getByRole('button', { name: 'REMOVE' }).click();
            await page.getByRole('button', { name: 'Confirm' }).click();

            await expect(page.getByText('The server is having trouble right now. Please try again in a few minutes.')).toBeVisible();
            await expect(page.getByRole('heading', { name: /Confirm Removal/i })).not.toBeVisible();
            await expect(page).not.toHaveURL('/#/clubs-and-tournaments');
        });
    });

});

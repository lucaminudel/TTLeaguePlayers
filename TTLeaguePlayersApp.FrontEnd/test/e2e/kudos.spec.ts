import { test, expect } from '@playwright/test';

test.describe('Kudos', () => {
    test.describe('authenticated users only page, login - logout flows', () => {
        test('when a non logged-in user tries to navigate to kudos, it redirects to login and after successful login it redirects back to kudos', async ({ page }) => {
            // Navigate to kudos page
            await page.goto('/#/kudos');

            // Verify redirect to login page
            await expect(page).toHaveURL('/#/login?returnUrl=%2Fkudos');
            await expect(page.locator('h2')).toHaveText('Log In');

            // Fill in login credentials
            await page.fill('#email', 'test_already_registered@user.test');
            await page.fill('#password', 'aA1!56789012');

            // Click Sign In button
            await page.getByTestId('login-submit-button').click();

            // Verify redirect back to kudos page after successful login
            await expect(page).toHaveURL('/#/kudos');
            await expect(page.locator('h2')).toHaveText('Fair play Kudos');
        });

        test('when a non logged-in user tries to login with unverified email, it is redirected through verification with returnUrl preserved', async ({ page }) => {
            // Mock InitiateAuth to return UserNotConfirmedException
            await page.route('https://cognito-idp.*.amazonaws.com/', async (route) => {
                const request = route.request();
                const headers = request.headers();
                const target = headers['x-amz-target'] as string | undefined;

                if (target?.endsWith('.InitiateAuth')) {
                    await route.fulfill({
                        status: 400,
                        contentType: 'application/x-amz-json-1.1',
                        body: JSON.stringify({
                            __type: 'UserNotConfirmedException',
                            message: 'User is not confirmed.'
                        })
                    });
                    return;
                }

                // Mock ConfirmSignUp (email verification)
                if (target?.endsWith('.ConfirmSignUp')) {
                    await route.fulfill({
                        status: 200,
                        contentType: 'application/x-amz-json-1.1',
                        body: JSON.stringify({})
                    });
                    return;
                }

                await route.continue();
            });

            // Navigate to kudos page
            await page.goto('/#/kudos');

            // Verify redirect to login page with returnUrl
            await expect(page).toHaveURL('/#/login?returnUrl=%2Fkudos');

            // Fill in login credentials for unverified user
            await page.fill('#email', 'unverified_user@user.test');
            await page.fill('#password', 'aA1!56789012');

            // Click Sign In button - should fail with UserNotConfirmedException
            await page.getByTestId('login-submit-button').click();

            // Verify redirect to register page with verify=true and returnUrl preserved
            await expect(page).toHaveURL('/#/register?email=unverified_user%40user.test&verify=true&returnUrl=%2Fkudos');
            await expect(page.locator('h2')).toHaveText('Verify Email');

            // Enter verification code
            await page.fill('#verificationCode', '123456');

            // Click Verify button
            await page.getByTestId('register-verify-button').click();

            // Verify redirect back to login with returnUrl preserved
            await expect(page).toHaveURL('/#/login?returnUrl=%2Fkudos');
        });

        test('when user logs out from an authenticated-users only page like kudos, user is redirected to home', async ({ page }) => {
            // Login first
            await page.goto('/#/login');
            await page.fill('#email', 'test_already_registered@user.test');
            await page.fill('#password', 'aA1!56789012');
            await page.getByTestId('login-submit-button').click();

            // Wait for login to complete - should redirect to home
            await expect(page).toHaveURL('/#/');

            // Navigate to kudos page
            await page.goto('/#/kudos');
            await expect(page.locator('h2')).toHaveText('Fair play Kudos');

            // Open menu and click logout
            // the the menu opens up clicking the menu hamburger
            const menuButton = page.getByTestId('main-menu-toggle');
            await menuButton.click();

            const logoutMenuButton = page.getByTestId('main-menu-logout-button');
            await expect(logoutMenuButton).toBeVisible();
            await logoutMenuButton.click();

            // Verify redirected to home
            await expect(page).toHaveURL('/#/');
            await expect(page.locator('h1')).toHaveText('TT League Players');

            // Verify logged out (menu shows Login item)
            await menuButton.click();
            await expect(page.getByTestId('main-menu-login-link')).toBeVisible();
            await expect(logoutMenuButton).not.toBeVisible();
        });
    });
});

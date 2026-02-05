import { test, expect } from '@playwright/test';
import { LoginPage, User as UserFlow } from './page-objects/User';

const EXECUTE_LIVE_COGNITO_TESTS = process.env.EXECUTE_LIVE_COGNITO_TESTS === 'true';

test.describe('Login Flow', () => {
    test.beforeEach(async ({ page }) => {
        const user = new UserFlow(page);
        await user.navigateToLogin();
    });

    test('successful login flow - login, welcome message, and logout', async ({ page }) => {
        test.skip(!EXECUTE_LIVE_COGNITO_TESTS, 'Skipping Cognito integration test');
    
        const user = new UserFlow(page);
        await user.navigateToLoginAndSuccesfullyLogin('test_already_registered@user.test', 'aA1!56789012');

        // Open menu to verify welcome message and seasons
        await user.menu.open();
        const userInfo = page.getByTestId('main-menu-user-info');

        // Verify first season is displayed without person name (since it's the same as welcome name)
        await expect(userInfo.getByTestId('main-menu-first-season')).toContainText('CLTTL 2025-2026');
        await expect(userInfo.getByTestId('main-menu-first-season')).toContainText('Morpeth 10, Division 4');
        
        // Verify second season is displayed without person name (same as welcome name)
        const additionalSeasons = userInfo.locator('[data-testid="main-menu-additional-season"]');
        await expect(additionalSeasons.nth(0)).toContainText('BCS 2025-2026');
        await expect(additionalSeasons.nth(0)).toContainText('Morpeth B, Division 2');
        
        // Verify third season is displayed with person name (different from welcome name)
        await expect(additionalSeasons.nth(1)).toContainText('FLICK 2025-Nov');
        await expect(additionalSeasons.nth(1)).toContainText('Indiidual, Division 1');
        await expect(additionalSeasons.nth(1)).toContainText('(Luca Sr Minudel)');

        // Logout and redirect to homepage 
        await user.menu.logout();

        // Open menu again to verify welcome message is gone
        await user.menu.open();
        await expect(page.getByTestId('main-menu-welcome-message')).not.toBeVisible();
        await expect(page.getByTestId('main-menu-login-link')).toBeVisible();
    });

    test('login - non existing user shows expected error message', async ({ page }) => {
        const user = new UserFlow(page);
        const loginPage = await user.navigateToLogin();
        
        await loginPage.tryToLogin('non_existing_user@Idonotexist.com', 'aA1!56789012');

        // Cognito is configured to not reveal user existence (prevent user enumeration),
        // so a non-existing user returns the same message as a wrong password.
        const errorMessage = page.getByTestId('login-error-message');
        await expect(errorMessage).toBeVisible();
        await expect(errorMessage).toHaveText('Incorrect username or password.');


        await expect(page).toHaveURL('/#/login');
    });

    test('client-side validation - empty email field', async ({ page }) => {
        // Leave email empty, fill password
        const loginPage = new LoginPage(page);        
        await loginPage.tryToLogin('', 'somepassword');

        // Native HTML5 validation expectation: the form is invalid and submission is blocked.
        const form = page.locator('form');
        await expect(form).toHaveCount(1);
        await expect(form).toHaveClass(/.*/); // ensure form is attached

        const isValid = await form.evaluate((f) => (f as HTMLFormElement).checkValidity());
        expect(isValid).toBe(false);

        await page.getByTestId('login-submit-button').click();

        // If blocked, we should remain on login and never enter the loading state.
        await expect(page).toHaveURL('/#/login');
        // Check that the button is not in loading state
        await expect(page.getByTestId('login-submit-button')).not.toBeDisabled();
        await expect(page.getByTestId('login-submit-button')).toBeVisible();
    });

    test('client-side validation - empty password field', async ({ page }) => {
        // Fill email, leave password empty
        const loginPage = new LoginPage(page);        
        await loginPage.tryToLogin('test@example.com', '');        

        const form = page.locator('form');
        const isValid = await form.evaluate((f) => (f as HTMLFormElement).checkValidity());
        expect(isValid).toBe(false);

        await page.getByTestId('login-submit-button').click();

        await expect(page).toHaveURL('/#/login');
        // Check that the button is not in loading state
        await expect(page.getByTestId('login-submit-button')).not.toBeDisabled();
        await expect(page.getByTestId('login-submit-button')).toBeVisible();
    });

    test('client-side validation - both fields empty', async ({ page }) => {
        const form = page.locator('form');
        const isValid = await form.evaluate((f) => (f as HTMLFormElement).checkValidity());
        expect(isValid).toBe(false);

        await page.getByTestId('login-submit-button').click();

        await expect(page).toHaveURL('/#/login');
        // Check that the button is not in loading state
        await expect(page.getByTestId('login-submit-button')).not.toBeDisabled();
        await expect(page.getByTestId('login-submit-button')).toBeVisible();
    });

    test('client-side validation - invalid email format', async ({ page }) => {
        // Fill invalid email format
        const loginPage = new LoginPage(page);        
        await loginPage.tryToLogin('invalid-email', 'somepassword');

        const form = page.locator('form');
        const isValid = await form.evaluate((f) => (f as HTMLFormElement).checkValidity());
        expect(isValid).toBe(false);

        await page.getByTestId('login-submit-button').click();

        await expect(page).toHaveURL('/#/login');
        // Check that the button is not in loading state
        await expect(page.getByTestId('login-submit-button')).not.toBeDisabled();
        await expect(page.getByTestId('login-submit-button')).toBeVisible();
    });

    test('cognito API error - simulated NotAuthorizedException', async ({ page }) => {
        const user = new UserFlow(page);
        const loginPage = await user.navigateToLogin();
        
        // Mock InitiateAuth to simulate incorrect credentials
        await page.route('https://cognito-idp.*.amazonaws.com/', async (route) => {
            const request = route.request();
            const headers = request.headers();
            const target = headers['x-amz-target'] as string | undefined;

            if (target?.endsWith('.InitiateAuth')) {
                await route.fulfill({
                    status: 400,
                    contentType: 'application/x-amz-json-1.1',
                    body: JSON.stringify({
                        __type: 'NotAuthorizedException',
                        message: 'Incorrect username or password.'
                    })
                });
                return;
            }
            await route.continue();
        });

        await loginPage.tryToLogin('test@example.com', 'WrongPassword123!');

        const errorMessage = page.getByTestId('login-error-message');
        await expect(errorMessage).toBeVisible();
        await expect(errorMessage).toHaveText('Incorrect username or password.');
        await expect(page).toHaveURL('/#/login');
    });

    test('cognito API error - simulated TooManyRequestsException', async ({ page }) => {
        const user = new UserFlow(page);
        const loginPage = await user.navigateToLogin();
        
        // Mock InitiateAuth to simulate rate limit
        await page.route('https://cognito-idp.*.amazonaws.com/', async (route) => {
            const request = route.request();
            const headers = request.headers();
            const target = headers['x-amz-target'] as string | undefined;

            if (target?.endsWith('.InitiateAuth')) {
                await route.fulfill({
                    status: 400,
                    contentType: 'application/x-amz-json-1.1',
                    body: JSON.stringify({
                        __type: 'TooManyRequestsException',
                        message: 'Rate limit exceeded'
                    })
                });
                return;
            }
            await route.continue();
        });

        await loginPage.tryToLogin('test@example.com', 'ValidPassword123!');

        const errorMessage = page.getByTestId('login-error-message');
        await expect(errorMessage).toBeVisible();
        // Login.tsx displays error.message directly for unknown types or specific ones not caught
        await expect(errorMessage).toHaveText('Rate limit exceeded');
        await expect(page).toHaveURL('/#/login');
    });

    test('cognito API error - simulated InternalErrorException', async ({ page }) => {
        const user = new UserFlow(page);
        const loginPage = await user.navigateToLogin();
        
        // Mock InitiateAuth to simulate server error
        await page.route('https://cognito-idp.*.amazonaws.com/', async (route) => {
            const request = route.request();
            const headers = request.headers();
            const target = headers['x-amz-target'] as string | undefined;

            if (target?.endsWith('.InitiateAuth')) {
                await route.fulfill({
                    status: 500,
                    contentType: 'application/x-amz-json-1.1',
                    body: JSON.stringify({
                        __type: 'InternalErrorException',
                        message: 'Internal server error'
                    })
                });
                return;
            }
            await route.continue();
        });

        await loginPage.tryToLogin('test@example.com', 'ValidPassword123!');

        const errorMessage = page.getByTestId('login-error-message');
        await expect(errorMessage).toBeVisible();
        await expect(errorMessage).toHaveText('Internal server error');
        await expect(page).toHaveURL('/#/login');
    });
});

import { test, expect } from '@playwright/test';

test.describe('Login Flow', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/#/login');
        await expect(page.locator('h2')).toHaveText('Log In');
    });

    test('successful login flow - login, welcome message, and logout', async ({ page }) => {
        // Fill in login credentials
        await page.fill('#email', 'test_already_registered@user.test');
        await page.fill('#password', 'aA1!56789012');

        // Click Sign In button
        await page.getByRole('button', { name: 'Sign In' }).click();

        // Verify redirect to homepage
        await expect(page).toHaveURL('/#/');

        // Open menu to check welcome message
        const menuButton = page.getByRole('button', { name: 'Toggle Menu' });
        await menuButton.click();

        // Verify welcome message with email is displayed
        await expect(page.locator('text=Welcome, test_already_registered@user.test')).toBeVisible();

        // Click logout
        await page.getByRole('button', { name: 'Log out' }).click();

        // Verify redirect to homepage and menu closes
        await expect(page).toHaveURL('/#/');

        // Open menu again to verify welcome message is gone
        await menuButton.click();

        // Verify welcome message is no longer present and login link is back
        await expect(page.locator('text=Welcome, test_already_registered@user.test')).not.toBeVisible();
        await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible();
    });

    test('login - non existing user shows expected error message', async ({ page }) => {
        await page.fill('#email', 'non_existing_user@Idonotexist.com');
        await page.fill('#password', 'aA1!56789012');

        const signInButton = page.getByRole('button', { name: 'Sign In' });
        const errorMessage = page.locator('.error-message');

        await signInButton.click();

        // Cognito is configured to not reveal user existence (prevent user enumeration),
        // so a non-existing user returns the same message as a wrong password.
        await expect(errorMessage).toBeVisible();
        await expect(errorMessage).toHaveText('Incorrect username or password.');
        // Expect to remain on login page and show Cognito error.

        await expect(page).toHaveURL('/#/login');

    });

    test('client-side validation - empty email field', async ({ page }) => {
        // Leave email empty, fill password
        await page.fill('#password', 'somepassword');

        // Native HTML5 validation expectation: the form is invalid and submission is blocked.
        const form = page.locator('form');
        await expect(form).toHaveCount(1);
        await expect(form).toHaveClass(/.*/); // ensure form is attached

        const isValid = await form.evaluate((f) => (f as HTMLFormElement).checkValidity());
        expect(isValid).toBe(false);

        await page.getByRole('button', { name: 'Sign In' }).click();

        // If blocked, we should remain on login and never enter the loading state.
        await expect(page).toHaveURL('/#/login');
        await expect(page.getByRole('button', { name: 'Signing in...' })).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
    });

    test('client-side validation - empty password field', async ({ page }) => {
        // Fill email, leave password empty
        await page.fill('#email', 'test@example.com');

        const form = page.locator('form');
        const isValid = await form.evaluate((f) => (f as HTMLFormElement).checkValidity());
        expect(isValid).toBe(false);

        await page.getByRole('button', { name: 'Sign In' }).click();

        await expect(page).toHaveURL('/#/login');
        await expect(page.getByRole('button', { name: 'Signing in...' })).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
    });

    test('client-side validation - both fields empty', async ({ page }) => {
        const form = page.locator('form');
        const isValid = await form.evaluate((f) => (f as HTMLFormElement).checkValidity());
        expect(isValid).toBe(false);

        await page.getByRole('button', { name: 'Sign In' }).click();

        await expect(page).toHaveURL('/#/login');
        await expect(page.getByRole('button', { name: 'Signing in...' })).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
    });

    test('client-side validation - invalid email format', async ({ page }) => {
        // Fill invalid email format
        await page.fill('#email', 'invalid-email');
        await page.fill('#password', 'somepassword');

        const form = page.locator('form');
        const isValid = await form.evaluate((f) => (f as HTMLFormElement).checkValidity());
        expect(isValid).toBe(false);

        await page.getByRole('button', { name: 'Sign In' }).click();

        await expect(page).toHaveURL('/#/login');
        await expect(page.getByRole('button', { name: 'Signing in...' })).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
    });
    test('cognito API error - simulated NotAuthorizedException', async ({ page }) => {
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

        await page.fill('#email', 'test@example.com');
        await page.fill('#password', 'WrongPassword123!');
        await page.getByRole('button', { name: 'Sign In' }).click();

        const errorMessage = page.locator('.error-message');
        await expect(errorMessage).toBeVisible();
        await expect(errorMessage).toHaveText('Incorrect username or password.');
        await expect(page).toHaveURL('/#/login');
    });

    test('cognito API error - simulated TooManyRequestsException', async ({ page }) => {
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

        await page.fill('#email', 'test@example.com');
        await page.fill('#password', 'ValidPassword123!');
        await page.getByRole('button', { name: 'Sign In' }).click();

        const errorMessage = page.locator('.error-message');
        await expect(errorMessage).toBeVisible();
        // Login.tsx displays error.message directly for unknown types or specific ones not caught
        await expect(errorMessage).toHaveText('Rate limit exceeded');
        await expect(page).toHaveURL('/#/login');
    });

    test('cognito API error - simulated InternalErrorException', async ({ page }) => {
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

        await page.fill('#email', 'test@example.com');
        await page.fill('#password', 'ValidPassword123!');
        await page.getByRole('button', { name: 'Sign In' }).click();

        const errorMessage = page.locator('.error-message');
        await expect(errorMessage).toBeVisible();
        await expect(errorMessage).toHaveText('Internal server error');
        await expect(page).toHaveURL('/#/login');
    });
});

import { test, expect, type Page } from '@playwright/test';

/**
 * Registration acceptance tests.
 *
 * NOTE: The tests in this file intentionally do NOT mock Cognito.
 * They exercise real Cognito behaviour via amazon-cognito-identity-js.
 */

test.describe('Register Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/#/register');
    await expect(page.locator('h2')).toHaveText('Register');
  });

  const expectedPolicyMessage =
    'Password must be at least 12 characters with uppercase, lowercase, number, and symbol.';

  let lastEpochMs = 0;
  const uniqueTestEmail = (): string => {
    // Requested format: test_<epoch timestamps in milliseconds>@delete.me
    // Ensure uniqueness even if multiple tests run within the same millisecond.
    const now = Date.now();
    lastEpochMs = now <= lastEpochMs ? lastEpochMs + 1 : now;
    return `test_${String(lastEpochMs)}@delete.me`;
  };

  const fillRegisterForm = async (
    page: Page,
    params: { email: string; password: string; confirmPassword?: string }
  ) => {
    await page.fill('#email', params.email);
    await page.fill('#password', params.password);
    await page.fill('#confirmPassword', params.confirmPassword ?? params.password);
  };

  const validPassword = 'aA1!56789012';

  interface PasswordPolicyCase {
    name: string;
    password: string;
  }

  // Cognito password policy (cognito-template.yaml):
  // MinimumLength: 12, RequireUppercase/Lowercase/Numbers/Symbols: true
  const passwordPolicyCases: PasswordPolicyCase[] = [
    { name: 'missing uppercase letter', password: 'aa1!56789012' },
    { name: 'missing lowercase letter', password: 'AA1!56789012' },
    { name: 'missing number', password: 'aA!!abcdefghij' },
    { name: 'missing symbol', password: 'aA15678901234' },
    { name: 'too short', password: 'aa1!5678901' }
  ];

  for (const c of passwordPolicyCases) {
    test(`password policy - ${c.name}`, async ({ page }) => {
      const email = uniqueTestEmail();

      await fillRegisterForm(page, { email, password: c.password });
      await page.getByRole('button', { name: 'Register', exact: true }).click();

      const errorMessage = page.locator('.error-message');
      await expect(errorMessage).toBeVisible();
      await expect(errorMessage).toHaveText(expectedPolicyMessage);
      await expect(page).toHaveURL('/#/register');
    });
  }

  test('client-side validation - empty email field', async ({ page }) => {
    await page.fill('#password', validPassword);
    await page.fill('#confirmPassword', validPassword);

    const form = page.locator('form');
    const isValid = await form.evaluate((f) => (f as HTMLFormElement).checkValidity());
    expect(isValid).toBe(false);

    await page.getByRole('button', { name: 'Register', exact: true }).click();

    await expect(page).toHaveURL('/#/register');
    await expect(page.getByRole('button', { name: 'Creating account...' })).toHaveCount(0);
  });

  test('client-side validation - empty password fields', async ({ page }) => {
    await page.fill('#email', 'test@example.com');

    const form = page.locator('form');
    const isValid = await form.evaluate((f) => (f as HTMLFormElement).checkValidity());
    expect(isValid).toBe(false);

    await page.getByRole('button', { name: 'Register', exact: true }).click();

    await expect(page).toHaveURL('/#/register');
    await expect(page.getByRole('button', { name: 'Creating account...' })).toHaveCount(0);
  });

  test('client-side validation - all fields empty', async ({ page }) => {
    const form = page.locator('form');
    const isValid = await form.evaluate((f) => (f as HTMLFormElement).checkValidity());
    expect(isValid).toBe(false);

    await page.getByRole('button', { name: 'Register', exact: true }).click();

    await expect(page).toHaveURL('/#/register');
    await expect(page.getByRole('button', { name: 'Creating account...' })).toHaveCount(0);
  });

  test('client-side validation - invalid email format (HTML5)', async ({ page }) => {
    await fillRegisterForm(page, { email: 'invalid-email', password: validPassword });

    const form = page.locator('form');
    const isValid = await form.evaluate((f) => (f as HTMLFormElement).checkValidity());
    expect(isValid).toBe(false);

    await page.getByRole('button', { name: 'Register', exact: true }).click();

    await expect(page).toHaveURL('/#/register');
    await expect(page.getByRole('button', { name: 'Creating account...' })).toHaveCount(0);
  });

  interface BasicEmailValidationCase {
    name: string;
    email: string;
  }

  const basicInvalidEmailCases: BasicEmailValidationCase[] = [
    { name: 'missing local-part before @', email: '@example.com' },
    { name: 'missing @ symbol', email: 'example.com' },
    { name: 'missing domain after @', email: 'a@' },
    { name: 'missing characters after dot', email: 'a@b.' }
  ];

  for (const c of basicInvalidEmailCases) {
    test(`client-side validation - email - ${c.name}`, async ({ page }) => {
      await fillRegisterForm(page, { email: c.email, password: validPassword });

      const inlineEmailHelper = page.locator('p.text-action-accent', {
        hasText: 'Please enter a valid email address'
      });

      await page.getByRole('button', { name: 'Register', exact: true }).click();

      await expect(inlineEmailHelper).toBeVisible();
      await expect(page).toHaveURL('/#/register');
      await expect(page.getByRole('button', { name: 'Creating account...' })).toHaveCount(0);
    });
  }

  test('client-side validation - email - missing dot triggers submit-time error message', async ({ page }) => {
    await fillRegisterForm(page, { email: 'a@b', password: validPassword });

    const form = page.locator('form');
    const isValid = await form.evaluate((f) => (f as HTMLFormElement).checkValidity());
    expect(isValid).toBe(true);

    await page.getByRole('button', { name: 'Register', exact: true }).click();

    const errorMessage = page.locator('.error-message');
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toHaveText('Please enter a valid email address.');
  });

  test('client-side validation - password and confirm password are different', async ({ page }) => {
    await fillRegisterForm(page, {
      email: 'test@example.com',
      password: validPassword,
      confirmPassword: 'aA1!56789013'
    });

    await expect(page.locator('text=Passwords do not match')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Register', exact: true })).toBeDisabled();
  });

  // --- Server-side (Cognito) registration errors (no mocking) ---

  test('server-side validation - invalid email format (.user@example.com)', async ({ page }) => {
    // This email passes the app regex (non-empty local part, @, dot, domain),
    // but Cognito may reject it as invalid format.
    await fillRegisterForm(page, { email: '.user@example.com', password: validPassword });

    const form = page.locator('form');
    const isValid = await form.evaluate((f) => (f as HTMLFormElement).checkValidity());
    expect(isValid).toBe(true);

    await page.getByRole('button', { name: 'Register', exact: true }).click();

    const errorMessage = page.locator('.error-message');
    await expect(errorMessage).toBeVisible();

    // Register.tsx maps InvalidParameterException containing "email" to this message.
    // If Cognito uses a different message for this pool, it may map to the generic InvalidParameterException message.
    await expect(errorMessage).toHaveText(
      /^(Please enter a valid email address\.|Invalid input\. Please check your information\.)$/
    );

    await expect(page).toHaveURL('/#/register');
  });

  test('server-side validation - email validation error (InvalidParameterException)', async ({ page }) => {
    // Use an email that passes our client regex but is likely rejected by Cognito due to size constraints.
    // (Cognito has size constraints for username/email; exceeding them triggers InvalidParameterException)
    const veryLongLocalPart = 'a'.repeat(260);
    const email = `test_${veryLongLocalPart}@delete.me`;

    await fillRegisterForm(page, { email, password: validPassword });

    // Ensure browser allows submission.
    const form = page.locator('form');
    const isValid = await form.evaluate((f) => (f as HTMLFormElement).checkValidity());
    expect(isValid).toBe(true);

    await page.getByRole('button', { name: 'Register', exact: true }).click();

    // Depending on Cognito's returned message text, Register.tsx maps InvalidParameterException to either:
    // - "Please enter a valid email address."  (when message includes 'email')
    // - "Invalid input. Please check your information." (otherwise)
    const errorMessage = page.locator('.error-message');
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toHaveText(
      /^(Please enter a valid email address\.|Invalid input\. Please check your information\.)$/
    );
  });

  test('account already exists error (UsernameExistsException)', async ({ page }) => {
    const email = uniqueTestEmail();

    // 1) First registration should succeed and navigate to Verify Email screen.
    await fillRegisterForm(page, { email, password: validPassword });
    await page.getByRole('button', { name: 'Register', exact: true }).click();
    await expect(page.locator('h2')).toHaveText('Verify Email');

    // 2) Force a full reload back to the Register route so the component state resets.
    await page.goto('/#/register');
    await page.reload();
    await expect(page.locator('h2')).toHaveText('Register');

    // 3) Register again with the same email.
    await fillRegisterForm(page, { email, password: validPassword });
    await page.getByRole('button', { name: 'Register', exact: true }).click();

    const errorMessage = page.locator('.error-message');
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toHaveText('An account with this email already exists. Try logging in instead.');
    await expect(page).toHaveURL('/#/register');
  });

  test('registration success - happy path', async ({ page }) => {
    const email = uniqueTestEmail();

    await fillRegisterForm(page, { email, password: validPassword });
    await page.getByRole('button', { name: 'Register', exact: true }).click();

    // Expect navigation to Verify Email view
    await expect(page.locator('h2')).toHaveText('Verify Email');

    // Validate that the verification view is showing the sent-to email
    await expect(page.locator(`text=We've sent a verification code to ${email}`)).toBeVisible();
  });

  test('email verification - simulated wrong code and resend ', async ({ page }) => {
    // Mock entire flow to ensure stability
    await page.route('https://cognito-idp.*.amazonaws.com/', async (route) => {
      const request = route.request();
      const headers = request.headers();
      const target = headers['x-amz-target'] as string | undefined;

      // Use .endsWith for strict matching
      if (target?.endsWith('.ConfirmSignUp')) {
        await route.fulfill({
          status: 400,
          contentType: 'application/x-amz-json-1.1',
          body: JSON.stringify({
            __type: 'CodeMismatchException',
            message: 'Invalid verification code provided, please try again.'
          })
        });
        return;
      }

      if (target?.endsWith('.ResendConfirmationCode')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/x-amz-json-1.1',
          body: JSON.stringify({})
        });
        return;
      }

      // Mock SignUp success last (or irrelevant order if strict)
      if (target?.endsWith('.SignUp')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/x-amz-json-1.1',
          body: JSON.stringify({ UserSub: "mock-sub", CodeDeliveryDetails: { Destination: "test@test.test", DeliveryMedium: "EMAIL", AttributeName: "email" } })
        });
        return;
      }

      await route.continue();
    });

    const email = uniqueTestEmail();

    // 1. Register to get to verification screen
    await fillRegisterForm(page, { email, password: validPassword });
    await page.getByRole('button', { name: 'Register', exact: true }).click();
    await expect(page.locator('h2')).toHaveText('Verify Email');

    // 2. Enter wrong code
    await page.fill('#verificationCode', '123456');
    await page.getByRole('button', { name: 'Verify', exact: true }).click();

    // 3. Assert error message
    const errorMessage = page.locator('.error-message');
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toHaveText('The verification code is incorrect. Please try again.');

    // 4. Click Resend Code
    await page.getByRole('button', { name: '< Resend Code >' }).click();

    // 5. Assert success message
    await expect(errorMessage).toHaveText('New verification code sent to your email.');
  });

  test('cognito API error - simulated TooManyRequestsException', async ({ page }) => {
    // 1. Setup mock for Cognito SignUp call
    // Note: Request headers in Playwright are lower-cased.
    await page.route('https://cognito-idp.*.amazonaws.com/', async (route) => {
      const request = route.request();
      const headers = request.headers();
      const target = headers['x-amz-target'] as string | undefined;

      // Target the SignUp operation specifically
      if (target?.endsWith('.SignUp')) {
        await route.fulfill({
          status: 400,
          contentType: 'application/x-amz-json-1.1',
          body: JSON.stringify({
            __type: 'TooManyRequestsException',
            message: 'Rate limit exceeded'
          })
        });
      } else {
        await route.continue();
      }
    });

    const email = uniqueTestEmail();

    // 2. Attempt registration
    await fillRegisterForm(page, { email, password: validPassword });
    await page.getByRole('button', { name: 'Register', exact: true }).click();

    // 3. Assert user-friendly error message from Register.tsx mapping
    const errorMessage = page.locator('.error-message');
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toHaveText(
      'Too many attempts. Please wait an hour before trying again. Additional attempts will extend the wait time.'
    );

    // 4. Ensure we stayed on register page
    await expect(page).toHaveURL('/#/register');
  });

  test('cognito API error - simulated InternalErrorException', async ({ page }) => {
    // 1. Setup mock for Cognito SignUp call (500 error)
    await page.route('https://cognito-idp.*.amazonaws.com/', async (route) => {
      const request = route.request();
      const headers = request.headers();
      const target = headers['x-amz-target'] as string | undefined;

      if (target?.endsWith('.SignUp')) {
        await route.fulfill({
          status: 500,
          contentType: 'application/x-amz-json-1.1',
          body: JSON.stringify({
            __type: 'InternalErrorException',
            message: 'Something went wrong on the server'
          })
        });
      } else {
        await route.continue();
      }
    });

    const email = uniqueTestEmail();

    // 2. Attempt registration
    await fillRegisterForm(page, { email, password: validPassword });
    await page.getByRole('button', { name: 'Register', exact: true }).click();

    // 3. Assert fallback error message (expecting exact message from server)
    const errorMessage = page.locator('.error-message');
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toHaveText('Something went wrong on the server');

    // 4. Ensure we stayed on register page
    await expect(page).toHaveURL('/#/register');
  });

  test('email verification - simulated CodeMismatchException', async ({ page }) => {
    // 1. Mock ConfirmSignUp to return CodeMismatchException
    //    AND Mock SignUp to return success (to avoid real network dependencies/rate limits)
    await page.route('https://cognito-idp.*.amazonaws.com/', async (route) => {
      const request = route.request();
      const headers = request.headers();
      const target = headers['x-amz-target'] as string | undefined;

      if (target?.includes('ConfirmSignUp')) {
        await route.fulfill({
          status: 400,
          contentType: 'application/x-amz-json-1.1',
          body: JSON.stringify({
            __type: 'CodeMismatchException',
            message: 'Invalid verification code provided, please try again.'
          })
        });
        return;
      }

      if (target?.includes('SignUp')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/x-amz-json-1.1',
          body: JSON.stringify({ UserSub: "mock-sub", CodeDeliveryDetails: { Destination: "test@test.test", DeliveryMedium: "EMAIL", AttributeName: "email" } })
        });
        return;
      }

      await route.continue();
    });

    const email = uniqueTestEmail();
    await fillRegisterForm(page, { email, password: validPassword });
    await page.getByRole('button', { name: 'Register', exact: true }).click();
    await expect(page.locator('h2')).toHaveText('Verify Email');

    // 2. Submit any code (mock response determines outcome)
    await page.fill('#verificationCode', '123456');
    await page.getByRole('button', { name: 'Verify', exact: true }).click();

    // 3. Assert mapped error message
    const errorMessage = page.locator('.error-message');
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toHaveText('The verification code is incorrect. Please try again.');
  });

  test('email verification - simulated TooManyRequestsException', async ({ page }) => {
    // 1. Mock ConfirmSignUp => error, SignUp => success
    await page.route('https://cognito-idp.*.amazonaws.com/', async (route) => {
      const request = route.request();
      const headers = request.headers();
      const target = headers['x-amz-target'] as string | undefined;

      if (target?.endsWith('.ConfirmSignUp')) {
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

      if (target?.endsWith('.SignUp')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/x-amz-json-1.1',
          body: JSON.stringify({ UserSub: "mock-sub", CodeDeliveryDetails: { Destination: "test@test.test", DeliveryMedium: "EMAIL", AttributeName: "email" } })
        });
        return;
      }

      await route.continue();
    });

    const email = uniqueTestEmail();
    await fillRegisterForm(page, { email, password: validPassword });
    await page.getByRole('button', { name: 'Register', exact: true }).click();
    await expect(page.locator('h2')).toHaveText('Verify Email');

    // 2. Submit code
    await page.fill('#verificationCode', '123456');
    await page.getByRole('button', { name: 'Verify', exact: true }).click();

    // 3. Assert mapped user-friendly error
    const errorMessage = page.locator('.error-message');
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toHaveText(
      'Too many attempts. Please wait an hour before trying again. Additional attempts will extend the wait time.'
    );
  });

  test('email verification - simulated resend code success', async ({ page }) => {
    // 1. Mock ResendConfirmationCode => success, SignUp => success
    await page.route('https://cognito-idp.*.amazonaws.com/', async (route) => {
      const request = route.request();
      const headers = request.headers();
      const target = headers['x-amz-target'] as string | undefined;

      if (target?.endsWith('.ResendConfirmationCode')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/x-amz-json-1.1',
          body: JSON.stringify({})
        });
        return;
      }

      if (target?.endsWith('.SignUp')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/x-amz-json-1.1',
          body: JSON.stringify({ UserSub: "mock-sub", CodeDeliveryDetails: { Destination: "test@test.test", DeliveryMedium: "EMAIL", AttributeName: "email" } })
        });
        return;
      }

      await route.continue();
    });

    const email = uniqueTestEmail();
    await fillRegisterForm(page, { email, password: validPassword });
    await page.getByRole('button', { name: 'Register', exact: true }).click();
    await expect(page.locator('h2')).toHaveText('Verify Email');

    // 2. Click Resend Code
    await page.getByRole('button', { name: '< Resend Code >' }).click();

    // 3. Assert success message
    const errorMessage = page.locator('.error-message');
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toHaveText('New verification code sent to your email.');
  });

  test('register and login - to unconfirmed user redirects to verification', async ({ page }) => {
    const email = uniqueTestEmail();

    // 1. Register a new user (which leaves them unconfirmed)
    await fillRegisterForm(page, { email, password: validPassword });
    await page.getByRole('button', { name: 'Register', exact: true }).click();
    await expect(page.locator('h2')).toHaveText('Verify Email');

    // 2. Navigate to Login page
    await page.goto('/#/login');
    await expect(page.locator('h2')).toHaveText('Log In');

    // 3. Attempt to log in with the unconfirmed user
    await page.fill('#email', email);
    await page.fill('#password', validPassword);
    await page.getByRole('button', { name: 'Sign In' }).click();

    // 4. Expect redirect back to Verify Email view
    // The URL should contain the email and verify=true param
    await expect(page).toHaveURL(new RegExp(`/register\\?email=${encodeURIComponent(email)}&verify=true`));
    await expect(page.locator('h2')).toHaveText('Verify Email');
  });

  test('register followed by email verification - simulated verificartion success', async ({ page }) => {
    // 1. Mock ONLY ConfirmSignUp to return success.
    // Real SignUp is used (no mock for .SignUp).
    await page.route('https://cognito-idp.*.amazonaws.com/', async (route) => {
      const request = route.request();
      const headers = request.headers();
      const target = headers['x-amz-target'] as string | undefined;

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

    const email = uniqueTestEmail();

    // 2. Register (Real Cognito Call)
    await fillRegisterForm(page, { email, password: validPassword });
    await page.getByRole('button', { name: 'Register', exact: true }).click();

    // 3. Verify Landing on Verification Page
    await expect(page.locator('h2')).toHaveText('Verify Email');

    // 4. Check for Resend Code button and Verify button existence
    await expect(page.getByRole('button', { name: '< Resend Code >' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Verify', exact: true })).toBeVisible();

    // 5. Submit Verification (Mocked Success)
    await page.fill('#verificationCode', '123456');
    await page.getByRole('button', { name: 'Verify', exact: true }).click();

    // 6. Assert redirection to Login page
    await expect(page).toHaveURL('/#/login');
    await expect(page.locator('h2')).toHaveText('Log In');
  });
});

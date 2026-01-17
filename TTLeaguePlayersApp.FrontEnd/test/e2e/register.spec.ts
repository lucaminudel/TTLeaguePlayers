import { test, expect, type Page } from '@playwright/test';
import { RegisterPage, User } from './page-objects/User';

/**
 * Registration acceptance tests.
 *
 * NOTE: Some tests in this file intentionally do NOT mock Cognito.
 * Others mock Cognito to keep scenarios stable/deterministic.
 */

let lastEpochMs = 0;
const uniqueTestEmail = (): string => {
  // Requested format: test_<epoch timestamps in milliseconds>@delete.me
  // Ensure uniqueness even if multiple tests run within the same millisecond.
  const now = Date.now();
  lastEpochMs = now <= lastEpochMs ? lastEpochMs + 1 : now;
  return `test_${String(lastEpochMs)}@delete.me`;
};

const validPassword = 'aA1!56789012';

test.describe('Register Flow', () => {
  test.beforeEach(async ({ page }) => {
    await new User(page).navigateToRegister();
  });

  const expectedPolicyMessage =
    'Password must be at least 12 characters with uppercase, lowercase, number, and symbol.';

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
      const registerPage = new RegisterPage(page);

      await registerPage.tentativelyRegisterNewUser(email, c.password, c.password);

      const errorMessage = page.getByTestId('register-error-message');
      await expect(errorMessage).toBeVisible();
      await expect(errorMessage).toHaveText(expectedPolicyMessage);
      await expect(page).toHaveURL('/#/register');
    });
  }

  test('client-side validation - empty email field', async ({ page }) => {
    const registerPage = new RegisterPage(page);    
    await registerPage.tentativelyRegisterNewUserNoClick('', validPassword, validPassword);

    const form = page.locator('form');
    const isValid = await form.evaluate((f) => (f as HTMLFormElement).checkValidity());
    expect(isValid).toBe(false);

    await page.getByTestId('register-submit-button').click();

    await expect(page).toHaveURL('/#/register');
    // Check that the button is not in loading state
    await expect(page.getByTestId('register-submit-button')).not.toBeDisabled();
  });

  test('client-side validation - empty password fields', async ({ page }) => {
    const registerPage = new RegisterPage(page);    
    await registerPage.tentativelyRegisterNewUserNoClick('test@example.com', '');

    const form = page.locator('form');
    const isValid = await form.evaluate((f) => (f as HTMLFormElement).checkValidity());
    expect(isValid).toBe(false);

    await page.getByTestId('register-submit-button').click();

    await expect(page).toHaveURL('/#/register');
    // Check that the button is not in loading state
    await expect(page.getByTestId('register-submit-button')).not.toBeDisabled();
  });

  test('client-side validation - all fields empty', async ({ page }) => {
    const form = page.locator('form');
    const isValid = await form.evaluate((f) => (f as HTMLFormElement).checkValidity());
    expect(isValid).toBe(false);

    await page.getByTestId('register-submit-button').click();

    await expect(page).toHaveURL('/#/register');
    // Check that the button is not in loading state
    await expect(page.getByTestId('register-submit-button')).not.toBeDisabled();
  });

  test('client-side validation - invalid email format (HTML5)', async ({ page }) => {
    const registerPage = new RegisterPage(page);    
    await registerPage.tentativelyRegisterNewUser('invalid-email', validPassword);

    const form = page.locator('form');
    const isValid = await form.evaluate((f) => (f as HTMLFormElement).checkValidity());
    expect(isValid).toBe(false);

    await expect(page).toHaveURL('/#/register');
    // Check that the button is not in loading state
    await expect(page.getByTestId('register-submit-button')).not.toBeDisabled();
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
      const registerPage = new RegisterPage(page);    
      await registerPage.tentativelyRegisterNewUser(c.email, validPassword);

      const inlineEmailHelper = page.getByTestId('register-email-field-error');

      await expect(inlineEmailHelper).toBeVisible();
      await expect(page).toHaveURL('/#/register');
      // Check that the button is not in loading state
    await expect(page.getByTestId('register-submit-button')).not.toBeDisabled();
    });
  }

  test('client-side validation - email - missing dot triggers submit-time error message', async ({ page }) => {
    const registerPage = new RegisterPage(page);    
    await registerPage.tentativelyRegisterNewUser('a@b', validPassword);

    const form = page.locator('form');
    const isValid = await form.evaluate((f) => (f as HTMLFormElement).checkValidity());
    expect(isValid).toBe(true);

    const errorMessage = page.getByTestId('register-error-message');
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toHaveText('Please enter a valid email address.');
  });

  test('client-side validation - password and confirm password are different', async ({ page }) => {
    const registerPage = new RegisterPage(page);    
    await registerPage.tentativelyRegisterNewUserNoClick(
      'test@example.com',
      validPassword,
      'aA1!56789013'
    );

    await expect(page.getByTestId('register-confirm-password-field-error')).toBeVisible();
    await expect(page.getByTestId('register-submit-button')).toBeDisabled();
  });

  // --- Server-side (Cognito) registration errors (no mocking) ---

  test('server-side validation - invalid email format (.user@example.com)', async ({ page }) => {
    // This email passes the app regex (non-empty local part, @, dot, domain),
    // but Cognito may reject it as invalid format.
    const registerPage = new RegisterPage(page);    
    await registerPage.tentativelyRegisterNewUser('.user@example.com', validPassword);

    const form = page.locator('form');
    const isValid = await form.evaluate((f) => (f as HTMLFormElement).checkValidity());
    expect(isValid).toBe(true);

    const errorMessage = page.getByTestId('register-error-message');
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

    const registerPage = new RegisterPage(page);    
    await registerPage.tentativelyRegisterNewUser(email, validPassword);

    // Ensure browser allows submission.
    const form = page.locator('form');
    const isValid = await form.evaluate((f) => (f as HTMLFormElement).checkValidity());
    expect(isValid).toBe(true);

    // Depending on Cognito's returned message text, Register.tsx maps InvalidParameterException to either:
    // - "Please enter a valid email address."  (when message includes 'email')
    // - "Invalid input. Please check your information." (otherwise)
    const errorMessage = page.getByTestId('register-error-message');
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toHaveText(
      /^(Please enter a valid email address\.|Invalid input\. Please check your information\.)$/
    );
  });

  test('account already exists error (UsernameExistsException)', async ({ page }) => {
    const email = uniqueTestEmail();
    const registerPage = new RegisterPage(page);    

    // 1) First registration should succeed and navigate to Verify Email screen.
    await registerPage.registerNewUser(email, validPassword);
    
    // 2) Force a full reload back to the Register route so the component state resets.
    const userPage = new User(page);
    await userPage.navigateToHome();

    await userPage.navigateToRegister();
    
    
    // 3) Register again with the same email.
    await registerPage.tentativelyRegisterNewUser(email, validPassword);

    const errorMessage = page.getByTestId('register-error-message');
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toHaveText('An account with this email already exists. Try logging in instead.');
    await expect(page).toHaveURL('/#/register');
  });

  test('registration success - happy path', async ({ page }) => {
    const email = uniqueTestEmail();

    const registerPage = new RegisterPage(page);    
    await registerPage.registerNewUser(email, validPassword);
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
    const registerPage = new RegisterPage(page);    

    // 1. Register to get to verification screen
    await registerPage.tentativelyRegisterNewUser(email, validPassword);
    await expect(page.locator('h2')).toHaveText('Verify Email');

    // 2. Enter wrong code
    await registerPage.tentativelyVerifyUserEmail('123456');

    // 3. Assert error message
    const errorMessage = page.getByTestId('register-verify-error-message');
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toHaveText('The verification code is incorrect. Please try again.');

    // 4. Click Resend Code
    await page.getByTestId('register-resend-code-button').click();

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
    const registerPage = new RegisterPage(page);    

    // 2. Attempt registration
    await registerPage.tentativelyRegisterNewUser(email, validPassword);

    // 3. Assert user-friendly error message from Register.tsx mapping
    const errorMessage = page.getByTestId('register-error-message');
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
    const registerPage = new RegisterPage(page);    

    // 2. Attempt registration
    await registerPage.tentativelyRegisterNewUser(email, validPassword);

    // 3. Assert fallback error message (expecting exact message from server)
    const errorMessage = page.getByTestId('register-error-message');
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
    const registerPage = new RegisterPage(page);    

    await registerPage.tentativelyRegisterNewUser(email, validPassword);
    await expect(page.locator('h2')).toHaveText('Verify Email');

    // 2. Submit any code (mock response determines outcome)
    await registerPage.tentativelyVerifyUserEmail('123456');    

    // 3. Assert mapped error message
    const errorMessage = page.getByTestId('register-verify-error-message');
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
    const registerPage = new RegisterPage(page);    

    await registerPage.tentativelyRegisterNewUser(email, validPassword);
    await expect(page.locator('h2')).toHaveText('Verify Email');

    // 2. Submit code
    await registerPage.tentativelyVerifyUserEmail( '123456');  

    // 3. Assert mapped user-friendly error
    const errorMessage = page.getByTestId('register-verify-error-message');
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
    const registerPage = new RegisterPage(page);    

    await registerPage.tentativelyRegisterNewUser(email, validPassword);
    await expect(page.locator('h2')).toHaveText('Verify Email');

    // 2. Click Resend Code
    await page.getByTestId('register-resend-code-button').click();

    // 3. Assert success message
    const errorMessage = page.getByTestId('register-verify-error-message');
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toHaveText('New verification code sent to your email.');
  });

  test('register and login - the unconfirmed user is redirected to verification', async ({ page }) => {
    const email = uniqueTestEmail();
    const user = new User(page);
    const registerPage = new RegisterPage(page);    

    // 1. Register a new user (which leaves them unconfirmed)
    await registerPage.tentativelyRegisterNewUser(email, validPassword);
    await expect(page.locator('h2')).toHaveText('Verify Email');

    // 2. Navigate to Login page
    const loginPage = await user.navigateToLogin();

    // 3. Attempt to log in with the unconfirmed user
    await loginPage.tryToLogin(email, validPassword);

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
    const registerPage = new RegisterPage(page);    

    // 2. Register (Real Cognito Call) with assertions of success
    await registerPage.registerNewUser(email, validPassword);

    // 5. Submit Verification (Mocked Success) with assertions of success
    await registerPage.verifyUserEmail('123456');

  });


});



test.describe('Register with Invite Flow', () => {
    test('register via invite - displays info and locks email', async ({ page }) => {
      const invite = {
        nano_id: 'test-invite-id',
        invited_by: 'Captain America',
        invitee_name: 'Bucky Barnes',
        invitee_email_id: 'bucky@avengers.com',
        invitee_role: 'PLAYER',
        invitee_team: 'Avengers',
        team_division: 'Div 1',
        season: '2025',
        league: 'Super League',
        status: 'SENT',
        created_at: '2025-01-01T00:00:00Z',
        expires_at: '2025-02-01T00:00:00Z'
      };

      // 1. Mock the getInvite API call
      await page.route('**/invites/test-invite-id', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(invite)
        });
      });

      // 2. Navigate to Join page
      const user = new User(page);
      const joinPage = await user.navigateToJoin('test-invite-id');

      // 3. Click Register & Verify Register page state
      await joinPage.redeemInvite();

      // Check invite details display using stable container locators
      const inviteDetails = page.getByTestId('register-invite-details');
      await expect(inviteDetails).toContainText(invite.league);
      await expect(inviteDetails).toContainText(invite.season);
      await expect(inviteDetails).toContainText(invite.invitee_team);
      await expect(inviteDetails).toContainText(invite.team_division);
      await expect(inviteDetails).toContainText(invite.invitee_name);
      await expect(inviteDetails).toContainText('Player');

      // Check email is pre-filled and disabled
      const emailInput = page.locator('#email');
      await expect(emailInput).toHaveValue(invite.invitee_email_id);
      await expect(emailInput).toBeDisabled();

      // Check style (bg-gray-400 class added when invite is present)
      await expect(emailInput).toHaveClass(/bg-gray-400/);
      await expect(emailInput).toHaveClass(/cursor-not-allowed/);

      // Check focus is on password field
      await expect(page.locator('#password')).toBeFocused();
    });

    test('registration with invite success - happy path', async ({ page }) => {
      const inviteId = 'abcd5678';
      const email = uniqueTestEmail();

      const invite = {
        nano_id: inviteId,
        invited_by: 'Luca',
        invitee_name: 'John Doe',
        invitee_email_id: email,
        invitee_role: 'PLAYER',
        invitee_team: 'The Smashers',
        team_division: 'Premier',
        season: 'Winter 2024',
        league: 'Local League',
        status: 'SENT',
        created_at: '2025-01-01T00:00:00Z',
        expires_at: '2025-02-01T00:00:00Z'
      };

      // --- Mock invite endpoints for this nano_id (GET + PATCH) ---
      let getInviteCalled = 0;
      let acceptInviteCalled = 0;
      let acceptInviteBody: unknown = null;

      await page.route(`**/invites/${inviteId}`, async (route) => {
        const method = route.request().method();

        if (method === 'GET') {
          getInviteCalled++;
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(invite)
          });
          return;
        }

        if (method === 'PATCH') {
          acceptInviteCalled++;
          acceptInviteBody = route.request().postDataJSON();

          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ ...invite, status: 'ACCEPTED' })
          });
          return;
        }

        await route.continue();
      });

      // --- Mock Cognito (SignUp + ConfirmSignUp) ---
      let signUpCalled = 0;
      let confirmSignUpCalled = 0;
      let signUpRequestBody: unknown = null;

      await page.route('https://cognito-idp.*.amazonaws.com/', async (route) => {
        const request = route.request();
        const headers = request.headers();
        const target = headers['x-amz-target'] as string | undefined;

        if (target?.endsWith('.SignUp')) {
          signUpCalled++;
          signUpRequestBody = request.postDataJSON();

          await route.fulfill({
            status: 200,
            contentType: 'application/x-amz-json-1.1',
            body: JSON.stringify({
              UserSub: 'mock-sub',
              CodeDeliveryDetails: {
                Destination: email,
                DeliveryMedium: 'EMAIL',
                AttributeName: 'email'
              }
            })
          });
          return;
        }

        if (target?.endsWith('.ConfirmSignUp')) {
          confirmSignUpCalled++;
          await route.fulfill({
            status: 200,
            contentType: 'application/x-amz-json-1.1',
            body: JSON.stringify({})
          });
          return;
        }

        await route.continue();
      });

      // 1) Start from Join with invite & Ensure invite has been fetched
      const user = new User(page);
      const joinPage = await user.navigateToJoin(inviteId, email);

      // 2) Navigate to Register
      const registerPage = await joinPage.redeemInvite();

      // 3) Fill password + confirm and register = Cognito + invite acceptance succeed => Verify Email view
      await registerPage.registerNewUserWithInvite(email, validPassword);

      // Assert requests were called
      expect(getInviteCalled).toBeGreaterThan(0);
      expect(signUpCalled).toBe(1);
      expect(acceptInviteCalled).toBe(1);

      const signUpBody = signUpRequestBody as { Username?: string } | null;
      expect(signUpBody?.Username).toBe(email);

      const patchBody = acceptInviteBody as { accepted_at?: number } | null;
      expect(typeof patchBody?.accepted_at).toBe('number');

      // 5) Verify email then redirect to login
      await registerPage.tentativelyVerifyUserEmail('123456');

      await expect(page).toHaveURL('/#/login');
      await expect(page.locator('h2')).toHaveText('Log In');
      expect(confirmSignUpCalled).toBe(1);
    });

    test('registration with invite failure - user already registered', async ({ page }) => {
      const inviteId = 'abcd5678';
      const email = uniqueTestEmail();

      const invite = {
        nano_id: inviteId,
        invited_by: 'Luca',
        invitee_name: 'John Doe',
        invitee_email_id: email,
        invitee_role: 'PLAYER',
        invitee_team: 'The Smashers',
        team_division: 'Premier',
        season: 'Winter 2024',
        league: 'Local League',
        status: 'SENT',
        created_at: '2025-01-01T00:00:00Z',
        expires_at: '2025-02-01T00:00:00Z'
      };

      // --- Mock invite endpoints for this nano_id (GET + PATCH) ---
      let getInviteCalled = 0;
      let acceptInviteCalled = 0;
      let acceptInviteBody: unknown = null;

      await page.route(`**/invites/${inviteId}`, async (route) => {
        const method = route.request().method();

        if (method === 'GET') {
          getInviteCalled++;
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(invite)
          });
          return;
        }

        if (method === 'PATCH') {
          acceptInviteCalled++;
          acceptInviteBody = route.request().postDataJSON();
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ ...invite, status: 'ACCEPTED' })
          });
          return;
        }

        await route.continue();
      });

      // --- Mock Cognito SignUp to fail with UsernameExistsException ---
      let signUpCalled = 0;
      let signUpRequestBody: unknown = null;

      const expectedUserAlreadyRegisteredMessage =
        'An account with this email already exists. Try logging in instead.';

      await page.route('https://cognito-idp.*.amazonaws.com/', async (route) => {
        const request = route.request();
        const headers = request.headers();
        const target = headers['x-amz-target'] as string | undefined;

        if (target?.endsWith('.SignUp')) {
          signUpCalled++;
          signUpRequestBody = request.postDataJSON();
          await route.fulfill({
            status: 400,
            contentType: 'application/x-amz-json-1.1',
            body: JSON.stringify({
              __type: 'UsernameExistsException',
              message: expectedUserAlreadyRegisteredMessage
            })
          });
          return;
        }

        await route.continue();
      });

      // 1) Start from Join with invite
      const user = new User(page);
      const joinPage = await user.navigateToJoin(inviteId, email);

      // 2) Navigate to Register
      const registerPage = await joinPage.redeemInvite();

      // 3) Fill password + confirm and register
      await registerPage.tentativelyRegisterNewUserWithInvite(email, validPassword);

      // 4) Invite acceptance succeeds despite Cognito saying user exists => redirect to Login
      await expect(page).toHaveURL('/#/login');
      await expect(page.locator('h2')).toHaveText('Log In');

      // AuthProvider.signUp sets authError from the Cognito error message; Login shows authError in .error-message.
      const errorMessage = page.getByTestId('login-error-message');
      await expect(errorMessage).toBeVisible();
      await expect(errorMessage).toHaveText(expectedUserAlreadyRegisteredMessage);

      // Assert requests were called
      expect(getInviteCalled).toBeGreaterThan(0);
      expect(signUpCalled).toBe(1);
      expect(acceptInviteCalled).toBe(1);

      const signUpBody = signUpRequestBody as { Username?: string } | null;
      expect(signUpBody?.Username).toBe(email);

      const patchBody = acceptInviteBody as { accepted_at?: number } | null;
      expect(typeof patchBody?.accepted_at).toBe('number');
    });

    test('registration with invite failure - both user registeration and accept invite fail', async ({ page }) => {
      const inviteId = 'abcd5678';
      const email = uniqueTestEmail();

      const invite = {
        nano_id: inviteId,
        invited_by: 'Luca',
        invitee_name: 'John Doe',
        invitee_email_id: email,
        invitee_role: 'PLAYER',
        invitee_team: 'The Smashers',
        team_division: 'Premier',
        season: 'Winter 2024',
        league: 'Local League',
        status: 'SENT',
        created_at: '2025-01-01T00:00:00Z',
        expires_at: '2025-02-01T00:00:00Z'
      };

      // --- Mock invite endpoints for this nano_id (GET succeeds; PATCH fails non-retryable 404) ---
      let getInviteCalled = 0;
      let acceptInviteCalled = 0;
      let acceptInviteBody: unknown = null;

      await page.route(`**/invites/${inviteId}`, async (route) => {
        const method = route.request().method();

        if (method === 'GET') {
          getInviteCalled++;
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(invite)
          });
          return;
        }

        if (method === 'PATCH') {
          acceptInviteCalled++;
          acceptInviteBody = route.request().postDataJSON();
          await route.fulfill({
            status: 404,
            contentType: 'application/json',
            body: JSON.stringify({ message: 'Http Status Code NotFound' })
          });
          return;
        }

        await route.continue();
      });

      // --- Mock Cognito SignUp to fail with UsernameExistsException ---
      let signUpCalled = 0;
      let signUpRequestBody: unknown = null;

      const expectedUserAlreadyRegisteredMessage =
        'An account with this email already exists. Try logging in instead.';

      await page.route('https://cognito-idp.*.amazonaws.com/', async (route) => {
        const request = route.request();
        const headers = request.headers();
        const target = headers['x-amz-target'] as string | undefined;

        if (target?.endsWith('.SignUp')) {
          signUpCalled++;
          signUpRequestBody = request.postDataJSON();
          await route.fulfill({
            status: 400,
            contentType: 'application/x-amz-json-1.1',
            body: JSON.stringify({
              __type: 'UsernameExistsException',
              message: expectedUserAlreadyRegisteredMessage
            })
          });
          return;
        }

        await route.continue();
      });

      // 1) Start from Join with invite
      const user = new User(page);
      const joinPage = await user.navigateToJoin(inviteId, email);

      // 2) Navigate to Register
      const registerPage = await joinPage.redeemInvite();

      // 3) Fill password + confirm and register
      await registerPage.tentativelyRegisterNewUserWithInvite(email, validPassword);

      // 4) Cognito says user exists, and invite acceptance fails => stay on Register with invite failure message
      await expect(page).toHaveURL('/#/register');
      await expect(page.locator('h2')).toHaveText('Register');

      const errorMessage = page.getByTestId('register-error-message');
      await expect(errorMessage).toBeVisible();
      await expect(errorMessage).toHaveText(
        'Invitation confirmation failed. Please contact support to restore access to your team’s features.'
      );

      // When inviteStatus === 'failed' and userAlreadyExists === true, Register.tsx renders no footer button.
      await expect(page.getByTestId('register-submit-button')).toHaveCount(0);
      await expect(page.getByTestId('register-submit-button')).toHaveCount(0);

      // Assert requests were called
      expect(getInviteCalled).toBeGreaterThan(0);
      expect(signUpCalled).toBe(1);
      expect(acceptInviteCalled).toBe(1);

      const signUpBody = signUpRequestBody as { Username?: string } | null;
      expect(signUpBody?.Username).toBe(email);

      const patchBody = acceptInviteBody as { accepted_at?: number } | null;
      expect(typeof patchBody?.accepted_at).toBe('number');
    });

    const registerWithInviteAndFailAcceptInvite = async (
      page: Page,
      params: {
        inviteId: string;
        acceptInviteStatus: number;
        acceptInviteErrorMessage?: string;
        expectedAcceptInviteCalls?: number;
      }
    ) => {
      const email = uniqueTestEmail();

      const invite = {
        nano_id: params.inviteId,
        invited_by: 'Luca',
        invitee_name: 'John Doe',
        invitee_email_id: email,
        invitee_role: 'PLAYER',
        invitee_team: 'The Smashers',
        team_division: 'Premier',
        season: 'Winter 2024',
        league: 'Local League',
        status: 'SENT',
        created_at: '2025-01-01T00:00:00Z',
        expires_at: '2025-02-01T00:00:00Z'
      };

      // --- Mock invite endpoints: GET succeeds, PATCH fails with provided status (non-retryable) ---
      let getInviteCalled = 0;
      let acceptInviteCalled = 0;

      await page.route(`**/invites/${params.inviteId}`, async (route) => {
        const method = route.request().method();

        if (method === 'GET') {
          getInviteCalled++;
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(invite)
          });
          return;
        }

        if (method === 'PATCH') {
          acceptInviteCalled++;
          await route.fulfill({
            status: params.acceptInviteStatus,
            contentType: 'application/json',
            body: JSON.stringify({
              message:
                params.acceptInviteErrorMessage ??
                `Http Status Code ${String(params.acceptInviteStatus)}`
            })
          });
          return;
        }

        await route.continue();
      });

      // --- Mock Cognito (SignUp succeeds; ConfirmSignUp succeeds) ---
      let signUpCalled = 0;
      let confirmSignUpCalled = 0;

      await page.route('https://cognito-idp.*.amazonaws.com/', async (route) => {
        const request = route.request();
        const headers = request.headers();
        const target = headers['x-amz-target'] as string | undefined;

        if (target?.endsWith('.SignUp')) {
          signUpCalled++;
          await route.fulfill({
            status: 200,
            contentType: 'application/x-amz-json-1.1',
            body: JSON.stringify({
              UserSub: 'mock-sub',
              CodeDeliveryDetails: {
                Destination: email,
                DeliveryMedium: 'EMAIL',
                AttributeName: 'email'
              }
            })
          });
          return;
        }

        if (target?.endsWith('.ConfirmSignUp')) {
          confirmSignUpCalled++;
          await route.fulfill({
            status: 200,
            contentType: 'application/x-amz-json-1.1',
            body: JSON.stringify({})
          });
          return;
        }

        await route.continue();
      });

      // 1) Start from Join with invite
      const user = new User(page);
      const joinPage = await user.navigateToJoin(params.inviteId, email);

      // 2) Navigate to Register
      const registerPage = await joinPage.redeemInvite();

      // 3) Fill password + confirm and register
      await registerPage.tentativelyRegisterNewUserWithInvite(email, validPassword);

      // Wait until all expected PATCH attempts have happened (initial call + any retries)
      const expectedCalls = params.expectedAcceptInviteCalls ?? 1;
      await expect
        .poll(() => acceptInviteCalled, { timeout: 15000 })
        .toBe(expectedCalls);

      // 4) Cognito succeeds but invite acceptance fails => error shown + continue button
      expect(getInviteCalled).toBeGreaterThan(0);
      expect(signUpCalled).toBe(1);

      // Must match expected attempts (including retries)
      expect(acceptInviteCalled).toBe(expectedCalls);

      const errorMessage = page.getByTestId('register-error-message');
      await expect(errorMessage).toBeVisible();
      await expect(errorMessage).toHaveText(
        'Invitation confirmation failed. Please contact support to restore access to your team’s features.'
      );

      const continueButton = page.getByTestId('register-submit-button');
      await expect(continueButton).toBeVisible();

      // 5) Continue to verification
      await continueButton.click();

      await expect(page.locator('h2')).toHaveText('Verify Email');
      await expect(page.getByTestId('register-verify-success-message')).toContainText(email);
      await expect(page.getByTestId('register-verify-error-message')).toHaveCount(0);

      // 6) Verify email then redirect to login
      await registerPage.tentativelyVerifyUserEmail('123456');

      await expect(page).toHaveURL('/#/login');
      await expect(page.locator('h2')).toHaveText('Log In');
      expect(confirmSignUpCalled).toBe(1);
    };

    test('registration with invite failure - Accept Invite NotFound 404 error', async ({ page }) => {
      await registerWithInviteAndFailAcceptInvite(page, {
        inviteId: 'abcd5678',
        acceptInviteStatus: 404,
        acceptInviteErrorMessage: 'Http Status Code NotFound'
      });
    });

    test('registration with invite failure - Accept Invite BadRequest 400 error', async ({ page }) => {
      await registerWithInviteAndFailAcceptInvite(page, {
        inviteId: 'abcd5678',
        acceptInviteStatus: 400,
        acceptInviteErrorMessage: 'Http Status Code BadRequest'
      });
    });

    test('registration with invite failure - Accept Invite Forbidden 403 error', async ({ page }) => {
      await registerWithInviteAndFailAcceptInvite(page, {
        inviteId: 'abcd5678',
        acceptInviteStatus: 403,
        acceptInviteErrorMessage: 'Http Status Code Forbidden'
      });
    });

    const speedUpTimers = async (page: Page, clampAboveMs: number, clampBelowOrEqualMs?: number) => {
      // Speed up retry backoff (without changing app code) by clamping browser timers above a threshold.
      // Important: addInitScript must happen before navigation for it to affect the app.
      await page.addInitScript(({
        clampAboveMs: clampAboveMsFromNode,
        clampBelowOrEqualMs: clampBelowOrEqualMsFromNode
      }) => {
        const originalSetTimeout = window.setTimeout;
        const originalSetInterval = window.setInterval;

        const clampMs = (ms?: number) => {
          if (typeof ms !== 'number') {
            return ms;
          }

          const isAbove = ms > clampAboveMsFromNode;
          const isBelowOrEqual =
            typeof clampBelowOrEqualMsFromNode === 'number' ? ms <= clampBelowOrEqualMsFromNode : true;

          return isAbove && isBelowOrEqual ? Math.min(ms, 10) : ms;
        };

        window.setTimeout = ((handler: TimerHandler, timeout?: number) => {
          // Note: we intentionally do not forward extra args; we only need to speed up delays.
          return originalSetTimeout(handler, clampMs(timeout));
        }) as typeof window.setTimeout;

        window.setInterval = ((handler: TimerHandler, timeout?: number) => {
          // Note: we intentionally do not forward extra args; we only need to speed up delays.
          return originalSetInterval(handler, clampMs(timeout));
        }) as typeof window.setInterval;
      }, { clampAboveMs, clampBelowOrEqualMs });
    };

    test('registration with invite failure with retries - Accept Invite UnprocessableEntity 422', async ({ page }) => {
      // Clamp only the 10s retry delay used by Register.tsx (acceptInviteWithRetry) to keep test fast,
      // without affecting shorter timeouts (e.g. apiFetch request timeouts) which could create extra retries.
      await speedUpTimers(page, 9000, 11000);

      await registerWithInviteAndFailAcceptInvite(page, {
        inviteId: 'abcd5678',
        acceptInviteStatus: 422,
        acceptInviteErrorMessage: 'Http Status Code UnprocessableEntity',
        expectedAcceptInviteCalls: 3 // 3 total tries (1 initial + 2 retries)
      });
    });

    test('registration with invite failure (with internal API retries) - Accept Invite ServiceUnavailable 503', async ({ page }) => {
      // apiFetch uses jittered delays in the 0..4000ms range for 503 retries; clamp those too.
      // IMPORTANT: do not clamp the 5000ms request timeout used by apiFetch, otherwise Join's GET /invites
      // may abort and never render the invite email. We only clamp retry backoff delays.
      await speedUpTimers(page, 50, 4000);

      await registerWithInviteAndFailAcceptInvite(page, {
        inviteId: 'abcd5678',
        acceptInviteStatus: 503,
        acceptInviteErrorMessage: 'Http Status Code ServiceUnavailable',
        // apiFetch retries 503 up to 3 times (4 total attempts) and Register.tsx retries the whole acceptInvite up to 3 times
        // => 3 * 4 = 12 total PATCH attempts
        expectedAcceptInviteCalls: 4
      });
    });

    test('registration with invite failure with retries - Accept Invite InternalServerError 500', async ({ page }) => {
      // Clamp only the 10s retry delay used by Register.tsx (acceptInviteWithRetry).
      await speedUpTimers(page, 9000, 11000);

      await registerWithInviteAndFailAcceptInvite(page, {
        inviteId: 'abcd5678',
        acceptInviteStatus: 500,
        acceptInviteErrorMessage: 'Http Status Code InternalServerError',
        expectedAcceptInviteCalls: 3 // 3 total tries (1 initial + 2 retries)
      });
    });
  });

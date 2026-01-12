import { type Page, expect } from '@playwright/test';

export class User {
  private page: Page;
  private _menu: MenuPage;

  constructor(page: Page) {
    this.page = page;
    this._menu = new MenuPage(page);
  }

  async navigateToLogin(): Promise<LoginPage> {
    const loginPage = new LoginPage(this.page);
    await this.page.goto('/#/login');
    await expect(this.page.locator('h2')).toHaveText('Log In');
    return loginPage;
  }

  async navigateToRegister(): Promise<RegisterPage> {
    const registerPage = new RegisterPage(this.page);
    await this.page.goto('/#/register');
    await expect(this.page.locator('h2')).toHaveText('Register');
    return registerPage;
  }

  async navigateToJoin(inviteId: string, email?: string): Promise<JoinPage> {
    const joinPage = new JoinPage(this.page);
    await this.page.goto(`/#/join/${inviteId}`);

    await expect(this.page.locator('h2')).toHaveText('Join - Personal Invite');

    // Wait for the fetch to either succeed or fail.
    await expect(this.page.getByTestId('join-loading-message')).not.toBeVisible({ timeout: 10000 });

    if (email) {  
      await expect(this.page.getByTestId('join-invite-email')).toContainText(email);
    }

    return joinPage;
  }

  get menu(): MenuPage {
    return this._menu;
  }
}

export class LoginPage {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async login(email: string, password: string): Promise<void> {
    await this.page.fill('#email', email);
    await this.page.fill('#password', password);
    await this.page.getByTestId('login-submit-button').click();

    // Wait for navigation to complete (either homepage or returnUrl)
    await this.page.waitForLoadState('networkidle');
  }

}

export class MenuPage {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async open(): Promise<void> {
    const menuButton = this.page.getByTestId('main-menu-toggle');
    await menuButton.click();

    // Verify menu is actually open by checking overlay visibility and geometry
    const overlay = this.page.getByTestId('main-menu-overlay');

    // Check strict geometry: overlay must cover the entire viewport
    const viewportSize = this.page.viewportSize();
    expect(viewportSize).not.toBeNull();
    const overlayBox = await overlay.boundingBox();
    expect(overlayBox).not.toBeNull();

    if (viewportSize && overlayBox) {
      expect(overlayBox.x).toBe(0);
      expect(overlayBox.y).toBe(0);
      expect(overlayBox.width).toBe(viewportSize.width);
      expect(overlayBox.height).toBe(viewportSize.height);
    }

    // Verify overlay is visible and interactive with menu items centered
    await expect(overlay).toHaveCSS('opacity', '1');
    await expect(overlay).toHaveCSS('pointer-events', 'auto');
    const link = this.page.getByTestId('main-menu-nav-kudos-standings');
    await expect(link).toBeVisible();

  }

  async close(): Promise<void> {
    const menuButton = this.page.getByTestId('main-menu-toggle');
    await menuButton.click();

    const overlay = this.page.getByTestId('main-menu-overlay');
    await expect(overlay).toHaveCSS('opacity', '0');
    await expect(overlay).toHaveCSS('pointer-events', 'none');
  }

  async logout() {

    const logoutMenuButton = this.page.getByTestId('main-menu-logout-button');
    await expect(logoutMenuButton).toBeVisible();

    await logoutMenuButton.click();

    // Wait for redirect to homepage
    await expect(this.page).toHaveURL('/#/');

  }
}

export class RegisterPage {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async registerNewUser(email: string, password: string, confirmPassword?: string): Promise<void> {
    await this.tentativelyRegisterNewUserNoClick(email, password, confirmPassword);

    await this.page.getByTestId('register-submit-button').click();

    // Expect navigation to Verify Email view
    await expect(this.page.locator('h2')).toHaveText('Verify Email');

    // Validate that the verification view is showing the sent-to email
    await expect(this.page.getByTestId('register-verify-success-message')).toContainText(email);

    // Check for Resend Code button and Verify button existence
    await expect(this.page.getByRole('button', { name: '< Resend Code >' })).toBeVisible();
    await expect(this.page.getByRole('button', { name: 'Verify', exact: true })).toBeVisible();
  };

  async registerNewUserWithInvite(email: string, password: string, confirmPassword?: string): Promise<void> {
    const emailInput = this.page.locator('#email');
    await expect(emailInput).toHaveValue(email);
    await expect(emailInput).toBeDisabled();

    await this.page.fill('#password', password);
    await this.page.fill('#confirmPassword', confirmPassword ?? password);

    await this.page.getByTestId('register-submit-button').click();

    // Expect navigation to Verify Email view
    await expect(this.page.locator('h2')).toHaveText('Verify Email');

    // Validate that the verification view is showing the sent-to email
    await expect(this.page.getByTestId('register-verify-success-message')).toContainText(email);

    // Check for Resend Code button and Verify button existence
    await expect(this.page.getByRole('button', { name: '< Resend Code >' })).toBeVisible();
    await expect(this.page.getByRole('button', { name: 'Verify', exact: true })).toBeVisible();
  };

  async tentativelyRegisterNewUserNoClick(email: string, password: string, confirmPassword?: string): Promise<void> {
    await this.page.fill('#email', email);
    await this.page.fill('#password', password);
    await this.page.fill('#confirmPassword', confirmPassword ?? password);
  };

  async tentativelyRegisterNewUser(email: string, password: string, confirmPassword?: string): Promise<void> {
    await this.tentativelyRegisterNewUserNoClick(email, password, confirmPassword);

    await this.page.getByTestId('register-submit-button').click();
  };

  async tentativelyRegisterNewUserWithInvite(email: string, password: string, confirmPassword?: string): Promise<void> {
    const emailInput = this.page.locator('#email');
    await expect(emailInput).toHaveValue(email);
    await expect(emailInput).toBeDisabled();

    await this.page.fill('#password', password);
    await this.page.fill('#confirmPassword', confirmPassword ?? password);

    await this.page.getByTestId('register-submit-button').click();
  };

  async tentativelyVerifyUserEmail(veefificationCode: string): Promise<void> {
    await this.page.fill('#verificationCode', veefificationCode);
    await this.page.getByTestId('register-verify-button').click();
  }

  async verifyUserEmail(vefificationCode: string): Promise<void> {
    await this.tentativelyVerifyUserEmail(vefificationCode);

    // Assert success: redirection to Login page
    await expect(this.page).toHaveURL('/#/login');
    await expect(this.page.locator('h2')).toHaveText('Log In');
  };

};

export class JoinPage {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async redeemInvite(): Promise<RegisterPage> {

    await this.page.getByTestId('join-register-button').click();

    await expect(this.page.locator('h2')).toHaveText('Register');

    return new RegisterPage(this.page);
  }

}



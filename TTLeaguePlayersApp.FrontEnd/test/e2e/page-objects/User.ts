import { type Page, expect } from '@playwright/test';

export class User {
  private page: Page;
  private _menu: MenuPage;

  constructor(page: Page) {
    this.page = page;
    this._menu = new MenuPage(page);
  }

  async NavigateToLogin(): Promise<LoginPage> {
    const loginPage = new LoginPage(this.page);
    await this.page.goto('/#/login');
    await expect(this.page.locator('h2')).toHaveText('Log In');
    return loginPage;
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
  }

  async close(): Promise<void> {
    const menuButton = this.page.getByTestId('main-menu-toggle');
    await menuButton.click();
    
    const overlay = this.page.getByTestId('main-menu-overlay');
    await expect(overlay).toHaveCSS('opacity', '0');
    await expect(overlay).toHaveCSS('pointer-events', 'none');
  }

  async logout(): Promise<HomePage> {
    
    const logoutMenuButton = this.page.getByTestId('main-menu-logout-button');
    await expect(logoutMenuButton).toBeVisible();
    await logoutMenuButton.click();
    
    // Wait for redirect to homepage
    await expect(this.page).toHaveURL('/#/');
    
    return new HomePage(this.page);
  }

  async verifyOverlayGeometry(): Promise<void> {
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

    // Verify menu items are all centred
    await expect(overlay).toHaveCSS('display', 'flex');
    await expect(overlay).toHaveCSS('flex-direction', 'column');
    await expect(overlay).toHaveCSS('justify-content', 'center');
    await expect(overlay).toHaveCSS('align-items', 'center');
  }

  async verifyWelcomeMessage(expectedName: string): Promise<void> {
    const userInfo = this.page.getByTestId('main-menu-user-info');
    await expect(userInfo.getByTestId('main-menu-welcome-message')).toContainText(`Welcome, ${expectedName}`);
  }

  async verifySeasons(): Promise<void> {
    const userInfo = this.page.getByTestId('main-menu-user-info');
    
    // Verify first season
    await expect(userInfo.getByTestId('main-menu-first-season')).toContainText('CLTTL 2025-2026');
    await expect(userInfo.getByTestId('main-menu-first-season')).toContainText('Morpeth 10, Division 4');
    
    // Verify additional seasons
    const additionalSeasons = userInfo.locator('[data-testid="main-menu-additional-season"]');
    await expect(additionalSeasons.nth(0)).toContainText('BCS 2025-2026');
    await expect(additionalSeasons.nth(0)).toContainText('Morpeth B, Division 2');
    
    await expect(additionalSeasons.nth(1)).toContainText('FLICK 2025-Nov');
    await expect(additionalSeasons.nth(1)).toContainText('Indiidual, Division 1');
    await expect(additionalSeasons.nth(1)).toContainText('(Luca Sr Minudel)');
  }

  async verifyWelcomeMessageNotVisible(): Promise<void> {
    await expect(this.page.getByTestId('main-menu-welcome-message')).not.toBeVisible();
  }

  async verifyLoginLinkVisible(): Promise<void> {
    await expect(this.page.getByTestId('main-menu-login-link')).toBeVisible();
  }
}

export class HomePage {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async verifyTitle(): Promise<void> {
    await expect(this.page.locator('h1')).toHaveText('TT League Players');
  }

  async openMenu(): Promise<MenuPage> {
    const menuButton = this.page.getByTestId('main-menu-toggle');
    await menuButton.click();
    return new MenuPage(this.page);
  }

  async verifyLoginLinkVisible(): Promise<void> {
    await expect(this.page.getByTestId('main-menu-login-link')).toBeVisible();
  }

  async verifyWelcomeMessageNotVisible(): Promise<void> {
    await expect(this.page.getByTestId('main-menu-welcome-message')).not.toBeVisible();
  }
}

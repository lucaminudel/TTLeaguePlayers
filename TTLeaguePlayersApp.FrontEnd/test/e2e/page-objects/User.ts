import { type Page, expect } from '@playwright/test';
import { LoginPage } from './LoginPage';
import { RegisterPage } from './RegisterPage';
import { JoinPage } from './JoinPage';
import { HomePage } from './HomePage';
import { KudosAndAwardPages } from './KudosAndAwardPages';
import { MenuPage } from './MenuPage';

export { LoginPage, RegisterPage, JoinPage, HomePage, KudosAndAwardPages as KudosPage, MenuPage };

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

  async navigateToLoginAndSuccesfullyLogin(email: string, password: string): Promise<LoginPage> {
    const loginPage = new LoginPage(this.page);
    await this.page.goto('/#/login');
    await expect(this.page.locator('h2')).toHaveText('Log In');

    // Perform login
    await loginPage.tryToLogin(email, password);

    // Verify redirect to homepage
    await expect(this.page).toHaveURL('/#/');

    // Open menu, check welcome message and logout item signaling successful loging, close menu
    await this.menu.open();
    const logoutButton = this.page.getByTestId('main-menu-logout-button');
    await expect(logoutButton).toBeVisible();
    const userInfo = this.page.getByTestId('main-menu-user-info');
    await expect(userInfo.getByTestId('main-menu-welcome-message')).toContainText('Welcome,');
    await this.menu.close();

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

  async navigateToHome(inviteId?: string): Promise<HomePage> {
    const homePage = new HomePage(this.page, inviteId ?? undefined);

    const enterButton = this.page.getByTestId('home-enter-button');

    if (inviteId) {
      await this.page.goto(`/#/${inviteId}`);
      await expect(enterButton).toHaveText('Redeem your invite');
      await expect(enterButton).toBeVisible();

    } else {
      await this.page.goto('/');
      await expect(enterButton).toHaveText('Ready to play?');
      await expect(enterButton).toBeVisible();
    }

    await expect(this.page.locator('h1')).toHaveText('TT League Players');
    await expect(this.page.locator('h2')).toHaveText('Welcome');
    return homePage;
  }

  async navigateToKudos(): Promise<KudosAndAwardPages> {
    const kudosPage = new KudosAndAwardPages(this.page);
    await this.page.goto('/#/kudos');
    await expect(this.page.locator('h2')).toHaveText('Fair play Kudos');
    return kudosPage;
  }

  async tentativelyNavigateToKudos(): Promise<KudosAndAwardPages> {
    const kudosPage = new KudosAndAwardPages(this.page);
    await this.page.goto('/#/kudos');

    return kudosPage;
  }

  get menu(): MenuPage {
    return this._menu;
  }
}

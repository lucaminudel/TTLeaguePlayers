import { type Page, expect } from '@playwright/test';
import { LoginPage } from './LoginPage';
import { RegisterPage } from './RegisterPage';
import { JoinPage } from './JoinPage';
import { HomePage } from './HomePage';
import { KudosPage } from './KudosPage';
import { MenuPage } from './MenuPage';

export { LoginPage, RegisterPage, JoinPage, HomePage, KudosPage, MenuPage };

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

  async navigateToKudos(): Promise<KudosPage> {
    const kudosPage = new KudosPage(this.page);
    await this.page.goto('/#/kudos');
    await expect(this.page.locator('h2')).toHaveText('Fair play Kudos');
    return kudosPage;
  }

  async tentativelyNavigateToKudos(): Promise<KudosPage> {
    const kudosPage = new KudosPage(this.page);
    await this.page.goto('/#/kudos');

    return kudosPage;
  }

  get menu(): MenuPage {
    return this._menu;
  }
}

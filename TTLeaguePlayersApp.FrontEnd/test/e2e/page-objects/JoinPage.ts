import { type Page, expect } from '@playwright/test';
import { RegisterPage } from './RegisterPage';
import { HomePage } from './HomePage';
import { LoginPage } from './LoginPage';


export class JoinPage {
    private page: Page;

    constructor(page: Page) {
        this.page = page;
    }

    async registerAndRedeemInvite(): Promise<RegisterPage> {
        await this.page.getByTestId('join-register-button').click();

        await expect(this.page.locator('h2')).toHaveText('Register');

        return new RegisterPage(this.page);
    }

    async tryAuthenticatedUserAcceptInvite(): Promise<void> {

        const acceptButton = this.page.getByTestId('join-accept-invite-button');
        await expect(acceptButton).toBeVisible();

        await acceptButton.click();        
    }    

    async authenticatedUserAcceptInvite(): Promise<HomePage> {

        await this.tryAuthenticatedUserAcceptInvite();
        
        // Navigation completeness verification: wait for redirect to home page to complete
        await expect(this.page).toHaveURL(/\/$/);
        await expect(this.page.locator('h2')).toHaveText('Welcome');
        
        return new HomePage(this.page);
    }    

    async loginAndAccept(): Promise<LoginPage> {

        const loginAndAcceptButton = this.page.getByTestId('join-login-button');
        await expect(loginAndAcceptButton).toBeVisible();

        await loginAndAcceptButton.click();        
        await expect(this.page.locator('h2')).toHaveText('Log In');        
                
        return new LoginPage(this.page);
    }    

}

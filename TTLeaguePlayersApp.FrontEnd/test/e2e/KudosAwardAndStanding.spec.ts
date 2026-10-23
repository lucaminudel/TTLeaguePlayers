import { test, expect } from '@playwright/test';
import { User } from './page-objects/User';
import { mockCognitoLatestKudos } from './helpers/cognito-latest_kudos-mock';
import { deleteCreatedKudos, trackCreatedKudos, type CreatedKudos } from './helpers/created-kudos-cleanup';

const EXECUTE_LIVE_COGNITO_TESTS = process.env.EXECUTE_LIVE_COGNITO_TESTS === 'true';
const CLTTL_SEASON = '2026-2027';
const PASSWORD = 'aA1!56789012';

test.describe.configure({ mode: 'serial' });

test.describe('Kudos Standings', () => {
    const createdKudos: CreatedKudos[] = [];

    test.beforeEach(({ page }) => {
        trackCreatedKudos(page, createdKudos);
    });

    test.afterAll(async ({ request }) => {
        await deleteCreatedKudos(request, createdKudos);
    });

    test('Step 1: Award kudos & show all the kudos Awarded by you', async ({ page }) => {
        test.skip(!EXECUTE_LIVE_COGNITO_TESTS, 'Skipping Cognito integration test');
        test.setTimeout(60000);
        await mockCognitoLatestKudos(page);

        const user = new User(page);
        await user.navigateToLoginAndSuccesfullyLogin('test_already_registered@user.test', PASSWORD);

        await user.setFixedClockTime('2026-10-09T20:46:00Z');
        const kudosPage = await user.navigateToKudos();
        await kudosPage.findAndOpenActiveSeasonCard('CLTTL', CLTTL_SEASON, 'Morpeth 10');
        await kudosPage.ratePositiveKudosFromOpenCard('Morpeth 11 Jr');

        await user.setFixedClockTime('2026-10-16T20:46:00Z');
        await user.navigateToKudos();
        await kudosPage.findAndOpenActiveSeasonCard('CLTTL', CLTTL_SEASON, 'Morpeth 10');
        await kudosPage.RateNeutralKudosFromOpenCard('Highbury 3', 'tick-and-ok');

        await user.setFixedClockTime('2026-10-22T20:46:00Z');
        await user.navigateToKudos();
        await kudosPage.findAndOpenActiveSeasonCard('CLTTL', CLTTL_SEASON, 'Morpeth 10');
        const kudosStandingsPage = await kudosPage.RateNegativeKudosFromOpenCard('Morpeth 9', 'expect-absent');

        expect(await kudosStandingsPage.myKudosItemsCount()).toBe(3);
        await kudosStandingsPage.myKudosItemsContains(1, 'Morpeth 9', 'Fewer');
        await kudosStandingsPage.myKudosItemsContains(2, 'Highbury 3', 'Standard');
        await kudosStandingsPage.myKudosItemsContains(3, 'Morpeth 11 Jr', 'Extra');
    });

    test('Step 2: Kudos awarded to your team & show your Team\'s kudos', async ({ page }) => {
        test.skip(!EXECUTE_LIVE_COGNITO_TESTS, 'Skipping Cognito integration test');
        test.setTimeout(60000);
        await mockCognitoLatestKudos(page);

        const user = new User(page);

        await user.navigateToLoginAndSuccesfullyLogin('test_kudos_highbury3@user.test', PASSWORD);
        await user.setFixedClockTime('2026-10-16T20:46:00Z');
        const highburyKudosPage = await user.navigateToKudos();
        await highburyKudosPage.findAndOpenActiveSeasonCard('CLTTL', CLTTL_SEASON, 'Highbury 3');
        const highburyStandingsPage = await highburyKudosPage.ratePositiveKudosFromOpenCard('Morpeth 10');
        await highburyStandingsPage.dismissInfoModal(false);
        await user.menu.open();
        await user.menu.logout();

        await user.navigateToLoginAndSuccesfullyLogin('test_kudos_morpeth11jr@user.test', PASSWORD);
        await user.setFixedClockTime('2026-10-09T20:46:00Z');
        const morpeth11JrKudosPage = await user.navigateToKudos();
        await morpeth11JrKudosPage.findAndOpenActiveSeasonCard('CLTTL', CLTTL_SEASON, 'Morpeth 11 Jr');
        const morpeth11JrStandingsPage = await morpeth11JrKudosPage.ratePositiveKudosFromOpenCard('Morpeth 10');
        await morpeth11JrStandingsPage.dismissInfoModal(false);
        await user.menu.open();
        await user.menu.logout();

        await user.navigateToLoginAndSuccesfullyLogin('test_already_registered@user.test', PASSWORD);
        const kudosStandingsPage = await user.navigateToKudosStandings();
        await kudosStandingsPage.selectActiveSeason('CLTTL', CLTTL_SEASON, 'Morpeth 10');
        await kudosStandingsPage.openTeamTab();

        expect(await kudosStandingsPage.teamKudosItemsCount()).toBe(2);
        await kudosStandingsPage.teamKudosItemsContains(1, 'Highbury 3', 'Extra');
        await kudosStandingsPage.teamKudosItemsContains(2, 'Morpeth 11 Jr', 'Extra');
    });

    test('Step 3: Kudos awarded to other teams & show Team\'s standings', async ({ page }) => {
        test.skip(!EXECUTE_LIVE_COGNITO_TESTS, 'Skipping Cognito integration test');
        test.setTimeout(60000);
        await mockCognitoLatestKudos(page);

        const user = new User(page);

        await user.navigateToLoginAndSuccesfullyLogin('test_kudos_highbury3@user.test', PASSWORD);
        await user.setFixedClockTime('2026-11-20T20:46:00Z');
        let highburyKudosPage = await user.navigateToKudos();
        await highburyKudosPage.findAndOpenActiveSeasonCard('CLTTL', CLTTL_SEASON, 'Highbury 3');
        await highburyKudosPage.RateNegativeKudosFromOpenCard('Morpeth 11 Jr');

        await user.setFixedClockTime('2026-12-03T20:46:00Z');
        highburyKudosPage = await user.navigateToKudos();
        await highburyKudosPage.findAndOpenActiveSeasonCard('CLTTL', CLTTL_SEASON, 'Highbury 3');
        const highburyStandingsPage = await highburyKudosPage.RateNegativeKudosFromOpenCard('Morpeth 9');
        await highburyStandingsPage.dismissInfoModal(false);
        await user.menu.open();
        await user.menu.logout();

        await user.navigateToLoginAndSuccesfullyLogin('test_kudos_morpeth11jr@user.test', PASSWORD);
        await user.setFixedClockTime('2026-11-20T20:46:00Z');
        let morpeth11JrKudosPage = await user.navigateToKudos();
        await morpeth11JrKudosPage.findAndOpenActiveSeasonCard('CLTTL', CLTTL_SEASON, 'Morpeth 11 Jr');
        await morpeth11JrKudosPage.ratePositiveKudosFromOpenCard('Highbury 3');

        await user.setFixedClockTime('2026-10-16T20:46:00Z');
        morpeth11JrKudosPage = await user.navigateToKudos();
        await morpeth11JrKudosPage.findAndOpenActiveSeasonCard('CLTTL', CLTTL_SEASON, 'Morpeth 11 Jr');
        await morpeth11JrKudosPage.RateNegativeKudosFromOpenCard('Irving 3');

        const kudosStandingsPage = await user.navigateToKudosStandings();
        await kudosStandingsPage.dismissInfoModal(false);
        await kudosStandingsPage.openTableTab();

        await expect(page.getByTestId('kudos-standings-tables')).toBeVisible({ timeout: 30000 });
        expect(await kudosStandingsPage.positiveKudosTableCount()).toBe(3);
        await kudosStandingsPage.positiveKudosTableContains('Morpeth 10', '2');
        await kudosStandingsPage.positiveKudosTableContains('Morpeth 11 Jr', '1');
        await kudosStandingsPage.positiveKudosTableContains('Highbury 3', '1');

        expect(await kudosStandingsPage.negativeKudosTableCount()).toBe(3);
        await kudosStandingsPage.negativeKudosTableContains('Morpeth 11 Jr', '1');
        await kudosStandingsPage.negativeKudosTableContains('Morpeth 9', '2');
        await kudosStandingsPage.negativeKudosTableContains('Irving 3', '1');

        expect(await kudosStandingsPage.neutralKudosTableCount()).toBe(1);
        await kudosStandingsPage.neutralKudosTableContains('Highbury 3', '1');
    });
});

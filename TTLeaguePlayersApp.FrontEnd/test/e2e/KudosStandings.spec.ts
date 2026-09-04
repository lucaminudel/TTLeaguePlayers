import { test, expect } from '@playwright/test';
import { User as UserFlow } from './page-objects/User';
import { mockCognitoLatestKudos } from './helpers/cognito-latest_kudos-mock';

const EXECUTE_LIVE_COGNITO_TESTS = process.env.EXECUTE_LIVE_COGNITO_TESTS === 'true';

// Neither test here writes any data - both are read-only against the standings endpoints - so
// neither needs KudosAwardAndStanding.spec.ts's serial mode or afterAll teardown, and this page is
// distinct from kudos.spec.ts's Matches & Kudos page, so it gets its own file (see the plan).
test.describe('Kudos Standings', () => {
    test('both standings info modals, once dismissed with "don\'t show again", stay hidden for that user but not for another one on the same browser', async ({ page }) => {
        test.skip(!EXECUTE_LIVE_COGNITO_TESTS, 'Skipping Cognito integration test');

        // These users carry kudos from earlier runs, which would hide the Rate button - not used
        // here, but this keeps state consistent with the rest of the suite for the same accounts.
        await mockCognitoLatestKudos(page);

        const user = new UserFlow(page);

        // User A (CAPTAIN): dismiss both standings info modals ticking "Don't show this message
        // again". dismissInfoModal ticks and dismisses the website modal, then the disputes modal.
        await user.setFixedClockTime('2026-01-21T12:00:00Z');
        await user.navigateToLoginAndSuccesfullyLogin('test_kudos_wt@user.test', 'aA1!56789012');

        const kudosStandingsPageA = await user.navigateToKudosStandings();
        await expect(kudosStandingsPageA.websiteInfoModal()).toBeVisible();
        await kudosStandingsPageA.dismissInfoModal(true);

        await user.menu.open();
        await user.menu.logout();

        // User B (PLAYER), same browser and so the same local storage: the preference is scoped to
        // user A's Cognito sub, so both modals must still appear.
        await user.setFixedClockTime('2026-01-18T12:00:00Z');
        await user.navigateToLoginAndSuccesfullyLogin('test_kudos_f5@user.test', 'aA1!56789012');

        // dismissInfoModal asserts each modal is visible before dismissing it, which is the proof
        // that both reappeared for user B despite user A's suppression of both.
        const kudosStandingsPageB = await user.navigateToKudosStandings();
        await kudosStandingsPageB.dismissInfoModal(false);
    });

    test('ticking "don\'t show again" on the Rate modal does not suppress either standings info modal', async ({ page }) => {
        test.skip(!EXECUTE_LIVE_COGNITO_TESTS, 'Skipping Cognito integration test');

        await mockCognitoLatestKudos(page);

        const user = new UserFlow(page);

        await user.setFixedClockTime('2026-01-21T12:00:00Z');
        await user.navigateToLoginAndSuccesfullyLogin('test_kudos_wt@user.test', 'aA1!56789012');

        // Tick "don't show again" on the Rate modal - a different GUID from both standings modals.
        // The OK click lands on /award-kudos (no kudos is awarded here - the rating step is not
        // clicked, so nothing is written to Cognito or DynamoDB).
        const kudosPage = await user.navigateToKudos();
        await kudosPage.findAndOpenActiveSeasonCard('CLTTL', '2025-2026', 'Walworth Tigers');
        await kudosPage.clickRateFromOpenCard('Morpeth 10');
        await expect(kudosPage.rateInfoModal()).toBeVisible();
        await kudosPage.dismissRateInfoModal(true);

        // Navigate to Kudos Standings directly (a fresh mount = a new visit). The Rate GUID is
        // independent of both standings GUIDs, so both the website and disputes info modals must
        // still appear despite the Rate preference being suppressed. dismissInfoModal asserts each
        // is visible before dismissing it, which is the proof that both appeared.
        const kudosStandingsPage = await user.navigateToKudosStandings();
        await kudosStandingsPage.dismissInfoModal(false);
    });
});

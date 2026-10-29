import { stubbedTest as test, expect } from './helpers/tabletennis365-test-setup';
import { User, InviteTeamMembersPage } from './page-objects/User';

const EXECUTE_LIVE_COGNITO_TESTS = process.env.EXECUTE_LIVE_COGNITO_TESTS === 'true';

const FIXED_CLOCK_TIME = '2026-10-16T20:46:00.000Z';

const CAPTAIN_EMAIL = 'test_already_registered@user.test';
const CAPTAIN_PASSWORD = 'aA1!56789012';

const LEAGUE = 'CLTTL';
const SEASON = '2026-2027';
const TEAM = 'Morpeth 10';

const RUN_ID = Date.now().toString(36);
const playerName = (ordinal: string) => `E2E Player ${RUN_ID} ${ordinal}`;
const EXPECTED_PLAYERS = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN'].map(playerName);

test.describe('Invite Team Members Page', () => {
    test.skip(!EXECUTE_LIVE_COGNITO_TESTS, 'Skipping Cognito integration test');

    const createdInvites: { url: string; auth: string | undefined }[] = [];

    test.beforeEach(async ({ page, tableTennis365Stub }) => {
        await page.addInitScript(() => {
            localStorage.clear();
            sessionStorage.clear();
        });

        page.on('response', (response) => {
            const request = response.request();
            if (request.method() === 'POST' && response.url().endsWith('/invites') && response.status() === 201) {
                const auth = request.headers().authorization;
                void response.json().then((body: { nano_id?: string }) => {
                    if (body.nano_id) {
                        createdInvites.push({ url: `${response.url()}/${body.nano_id}`, auth });
                    }
                }).catch(() => undefined);
            }
        });

        tableTennis365Stub.players.returnRoster({ team: TEAM, teamId: 73142, players: EXPECTED_PLAYERS });
    });

    test.afterAll(async ({ request }) => {
        if (createdInvites.length === 0) return;

        console.log(`\n🧹 [Cleanup] Deleting ${String(createdInvites.length)} invite(s) created by this spec...`);

        for (const invite of createdInvites) {
            let attempts = 0;
            let deleted = false;

            while (attempts < 3 && !deleted) {
                attempts++;
                try {
                    const response = await request.delete(
                        invite.url,
                        invite.auth === undefined ? {} : { headers: { Authorization: invite.auth } }
                    );
                    if (response.ok()) {
                        deleted = true;
                    } else {
                        throw new Error(`Status ${String(response.status())}: ${await response.text()}`);
                    }
                } catch (error) {
                    if (attempts < 3) {
                        console.warn(`⚠️ [Cleanup] Attempt ${String(attempts)} failed for ${invite.url}. Retrying...`);
                        await new Promise((resolve) => setTimeout(resolve, attempts * 1000));
                    } else {
                        console.error(`❌ [Cleanup] Could not delete ${invite.url}:`, error);
                    }
                }
            }
        }
    });

    test('shows a player loading error after an invalid roster response', async ({ page, tableTennis365Stub }) => {
        tableTennis365Stub.setResponse('https://www.tabletennis365.com/CentralLondon/Team/Eligibility?handler=Players&leagueId=4760&teamId=73142', {
            status: 200, contentType: 'application/json', body: 'not valid JSON'
        });
        const user = new User(page);
        await user.setFixedClockTime(FIXED_CLOCK_TIME);
        const loginPage = await user.navigateToLogin();
        await loginPage.loginAndWaitForHome(CAPTAIN_EMAIL, CAPTAIN_PASSWORD);
        const invitePage = await user.navigateToInviteTeamMembers();
        const diagnostic = page.waitForResponse(response => response.url().endsWith('/frontend-events') && response.request().method() === 'POST');
        await invitePage.openTeamCard(LEAGUE, SEASON, TEAM);
        const response = await diagnostic;
        expect(response.status()).toBe(204);
        const body = response.request().postDataJSON() as { event_category: string; operation: string };
        expect(body.event_category).toBe('FRONTEND_API_CALL_ERROR');
        expect(body.operation).toBe('getTeamPlayers');
        await expect(page.getByTestId('team-players-unavailable')).toHaveText('The player list for this league could not be loaded. Please retry again later. If the problem persists, contact us.');
    });

    test('lists every player of the captained team with its registration status', async ({ page }) => {
        const user = new User(page);
        let inviteTeamMembersPage: InviteTeamMembersPage;

        await test.step('Given the captain is logged in', async () => {
            await user.setFixedClockTime(FIXED_CLOCK_TIME);

            const loginPage = await user.navigateToLogin();
            await loginPage.loginAndWaitForHome(CAPTAIN_EMAIL, CAPTAIN_PASSWORD);
        });

        await test.step('When they open Invite Team Members and their CLTTL team', async () => {
            inviteTeamMembersPage = await user.navigateToInviteTeamMembers();
            await inviteTeamMembersPage.openTeamCard(LEAGUE, SEASON, TEAM);
        });

        await test.step('Then every player on the league site is listed, in the site order', async () => {
            const rosterRows = page.locator('[data-testid^="team-player-row-"]');
            await expect(rosterRows.getByTestId('team-player-name')).toHaveText(EXPECTED_PLAYERS);
        });

        await test.step('And none of them is invited yet, so no row carries a date or an e-mail', async () => {
            const rosterRows = page.locator('[data-testid^="team-player-row-"]');
            await expect(rosterRows.getByTestId('team-player-date')).toHaveText(EXPECTED_PLAYERS.map(() => ''));
            await expect(rosterRows.getByTestId('team-player-email')).toHaveText(EXPECTED_PLAYERS.map(() => ''));
        });

        await test.step('And every row offers Invite in place of a status label', async () => {
            const rosterRows = page.locator('[data-testid^="team-player-row-"]');
            await expect(rosterRows.getByTestId('team-player-invite-button')).toHaveText(EXPECTED_PLAYERS.map(() => 'Invite'));
            await expect(rosterRows.getByTestId('team-player-status')).toHaveCount(0);
        });
    });

    test('invites a player, and shows the invite as sent', async ({ page }) => {
        const user = new User(page);
        const invitee = playerName('ONE');
        const inviteeEmail = `e2e-player-one-${RUN_ID}@user.test`;
        let inviteTeamMembersPage: InviteTeamMembersPage;

        const invitesBefore = createdInvites.length;
        const invitesCreatedHere = () => createdInvites.length - invitesBefore;

        await test.step('Given the captain has their team open', async () => {
            await user.setFixedClockTime(FIXED_CLOCK_TIME);

            const loginPage = await user.navigateToLogin();
            await loginPage.loginAndWaitForHome(CAPTAIN_EMAIL, CAPTAIN_PASSWORD);

            inviteTeamMembersPage = await user.navigateToInviteTeamMembers();
            await inviteTeamMembersPage.openTeamCard(LEAGUE, SEASON, TEAM);
        });

        await test.step('When they try to invite a player with a malformed address', async () => {
            await inviteTeamMembersPage.openInviteDialogFor(invitee);
            await inviteTeamMembersPage.tentativelySendInviteTo('not-an-email');
        });

        await test.step('Then the address is refused and nothing is created', async () => {
            await expect(page.getByTestId('invite-player-email-error')).toBeVisible();
            await expect(page.getByTestId('invite-player-dialog')).toBeVisible();

            expect(invitesCreatedHere()).toBe(0);
        });

        await test.step('When they correct the address and send', async () => {
            await inviteTeamMembersPage.tentativelySendInviteTo(inviteeEmail);
        });

        await test.step('Then the dialog closes and the row reports the invite as sent', async () => {
            await expect(page.getByTestId('invite-player-dialog')).toBeHidden();

            const row = page.getByTestId(`team-player-row-${invitee}`);
            await expect(row.getByTestId('team-player-status')).toHaveText('Invite sent');
            await expect(row.getByTestId('team-player-date')).toHaveText(/^\d{1,2} [A-Z][a-z]{2}(, \d{4})?$/);
            await expect(row.getByTestId('team-player-email')).toHaveText(inviteeEmail);
            await expect(row.getByTestId('team-player-invite-button')).toHaveCount(0);
        });

        await test.step('And exactly one invite was created, for the teardown to remove', () => {
            expect(invitesCreatedHere()).toBe(1);
        });
    });
});

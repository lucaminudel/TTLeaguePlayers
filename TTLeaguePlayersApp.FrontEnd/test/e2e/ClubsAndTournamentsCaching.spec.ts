import { test, expect } from '@playwright/test';
import { User, PromoteMyTournamentsPage } from './page-objects/User';

const EXECUTE_LIVE_COGNITO_TESTS = process.env.EXECUTE_LIVE_COGNITO_TESTS === 'true';

// Fixed clock time: 15 January 2026 11:01:48 UTC (epoch: 1768474908)
const FIXED_CLOCK_TIME = '2026-01-15T11:01:48.000Z';

// The tournament date-range validation and display use the real wall-clock (not the fixed
// test clock above), so dates must be computed relative to today to stay valid over time.
function futureDateString(daysFromNow: number): string {
    const date = new Date();
    date.setDate(date.getDate() + daysFromNow);
    return date.toISOString().split('T')[0];
}

const CLUBS_CACHE_PREFIX = 'clubs_cache_';

async function getClubsCacheKeys(page: import('@playwright/test').Page): Promise<string[]> {
    return page.evaluate((prefix) => {
        return Object.keys(localStorage).filter((key) => key.startsWith(prefix));
    }, CLUBS_CACHE_PREFIX);
}

test.describe('Clubs & Tournaments Caching E2E', () => {
    test.skip(!EXECUTE_LIVE_COGNITO_TESTS, 'Skipping Cognito integration test');
    test.setTimeout(90000);

    // Playwright runs spec files in parallel workers, so this spec owns a club no other spec
    // writes to. test_already_registered3@user.test manages two clubs for exactly this reason:
    // London/"Morpeth Table Tennis Club" belongs to ClubsAndTournaments.spec.ts and
    // Brighton/"Caching Check Club" to this one. Sharing a club with that spec used to fail
    // intermittently: both add and delete a tournament on it, and both assert the club has none,
    // so whichever ran inside the other's ~1s add/delete window saw a row it did not expect.
    const clubManager = { email: 'test_already_registered3@user.test', password: 'aA1!56789012' };
    const club = { location: 'Brighton', club_name: 'Caching Check Club' };

    const tournament = {
        tournament_name: 'Caching Check Cup',
        tournament_info: 'https://example.com/caching-check-cup',
        start_date: futureDateString(30),
        end_date: futureDateString(32),
    };

    // Recorded from the upsert request the test makes through the UI, so a failure part-way through
    // cannot leak a tournament into the environment. The test also removes it through the UI as its
    // last step; DELETE is idempotent, so this only has work to do when the test did not get there.
    let addedTournament: { url: string; auth: string } | null = null;

    test.afterAll(async ({ request }) => {
        if (!addedTournament) return;

        console.log('\n🧹 [Cleanup] Deleting leftover tournament...');
        try {
            const response = await request.delete(addedTournament.url, {
                headers: { 'Authorization': addedTournament.auth },
            });
            if (response.ok()) {
                console.log(`✅ [Cleanup] Successfully deleted tournament at ${addedTournament.url}.`);
            } else {
                console.error(`❌ [Cleanup] Delete failed with status ${String(response.status())}: ${await response.text()}`);
            }
        } catch (error) {
            console.error('❌ [Cleanup] Delete threw an error:', error instanceof Error ? error.message : error);
        }
    });

    test('the public listing is cached for visitors and invalidated when a manager changes it', async ({ page }) => {
        const user = new User(page);
        let promoteMyTournamentsPage: PromoteMyTournamentsPage;

        page.on('request', (request) => {
            if (request.method() !== 'PUT') return;
            const url = request.url();
            if (url.includes('/tournaments/')) {
                addedTournament = { url, auth: request.headers().authorization };
            }
        });

        await test.step('Given an anonymous visitor opens the public Clubs & Tournaments page', async () => {
            await user.setFixedClockTime(FIXED_CLOCK_TIME);
            await user.navigateToClubsAndTournaments();
        });

        await test.step('Then the listing is cached in localStorage under the clubs_cache_ prefix', async () => {
            const cacheKeys = await getClubsCacheKeys(page);
            expect(cacheKeys.length).toBeGreaterThan(0);
        });

        await test.step('When the Club Manager logs in and adds a tournament', async () => {
            const loginPage = await user.navigateToLogin();
            await loginPage.loginAndWaitForHome(clubManager.email, clubManager.password);

            await user.menu.open();
            promoteMyTournamentsPage = await user.menu.navigateToPromoteMyTournaments();
            await promoteMyTournamentsPage.selectClub(club.location, club.club_name);
            await promoteMyTournamentsPage.openAddTournamentForm();
            await promoteMyTournamentsPage.addTournament(tournament);
        });

        await test.step('Then the cached listing is invalidated, so the next visit reads fresh data', async () => {
            // Nothing on Promote My Tournaments re-fetches GET /clubs, so there is no repopulation
            // to race here (unlike the Kudos caching flow, which redirects back to the cached page).
            const cacheKeys = await getClubsCacheKeys(page);
            expect(cacheKeys.length).toBe(0);
        });

        await test.step('And the newly added tournament appears when the listing is fetched again', async () => {
            await user.navigateToClubsAndTournaments();

            const tournamentLink = page.getByTestId('tournament-link').filter({ hasText: tournament.tournament_name });
            await expect(tournamentLink).toHaveCount(1);

            const cacheKeys = await getClubsCacheKeys(page);
            expect(cacheKeys.length).toBeGreaterThan(0);
        });

        await test.step('Cleanup: remove the tournament through the UI', async () => {
            await user.menu.open();
            promoteMyTournamentsPage = await user.menu.navigateToPromoteMyTournaments();
            await promoteMyTournamentsPage.selectClub(club.location, club.club_name, true);
            await promoteMyTournamentsPage.openDeleteTournamentForm(tournament.tournament_name);
            await promoteMyTournamentsPage.confirmDeleteTournament();
            addedTournament = null; // Removed through the UI, so afterAll has nothing left to delete
        });
    });
});

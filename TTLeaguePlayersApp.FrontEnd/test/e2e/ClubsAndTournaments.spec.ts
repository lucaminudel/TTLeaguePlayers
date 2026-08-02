import { test, expect } from '@playwright/test';
import { User, PromoteMyClubPage, PromoteMyTournamentsPage } from './page-objects/User';

const EXECUTE_LIVE_COGNITO_TESTS = process.env.EXECUTE_LIVE_COGNITO_TESTS === 'true';

// Fixed clock time: 15 January 2026 11:01:48 UTC (epoch: 1768474908)
const FIXED_CLOCK_TIME = '2026-01-15T11:01:48.000Z';

// The tournament date-range validation and display use the real wall-clock (not the fixed
// test clock above), so dates must be computed relative to today to stay valid over time.
function futureDate(daysFromNow: number): Date {
    const date = new Date();
    date.setDate(date.getDate() + daysFromNow);
    return date;
}

function futureDateString(daysFromNow: number): string {
    return futureDate(daysFromNow).toISOString().split('T')[0];
}

test.describe('Clubs & Tournaments Page - public listing', () => {
    // The page is public, so this needs no Cognito login: the API response is mocked.
    test('API errors on GET are displayed on the page', async ({ page }) => {
        const user = new User(page);

        const routeClubsList = async (status: number, body: unknown) => {
            await page.route('**/clubs', async (route) => {
                const request = route.request();
                if (request.method() === 'GET') {
                    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
                } else {
                    await route.continue();
                }
            });
        };

        await test.step('Given the clubs and tournaments service is failing', async () => {
            await user.setFixedClockTime(FIXED_CLOCK_TIME);
            await routeClubsList(503, { message: 'Clubs service is temporarily unavailable.' });
        });

        await test.step('When a visitor opens the page, the error message is displayed instead of the listings', async () => {
            await user.tentativelyNavigateToClubsAndTournaments();

            await expect(page.locator('h2')).toHaveText('Clubs & Tournaments');
            await expect(page.getByTestId('main-error')).toContainText('Clubs service is temporarily unavailable.');

            await expect(page.getByTestId('tournaments-section')).toHaveCount(0);
            await expect(page.getByTestId('clubs-section')).toHaveCount(0);
        });

        await test.step('When the server fails without a message, a generic message is displayed', async () => {
            await page.unrouteAll();
            await page.route('**/clubs', async (route) => {
                if (route.request().method() === 'GET') {
                    await route.fulfill({ status: 500, body: 'Internal Server Error' });
                } else {
                    await route.continue();
                }
            });

            await user.tentativelyNavigateToClubsAndTournaments();
            await page.reload();

            await expect(page.getByTestId('main-error'))
                .toContainText('The server is having trouble right now. Please try again in a few minutes.');
        });
    });
});

test.describe('Clubs & Tournaments Page - promoted club and tournament', () => {
    test.skip(!EXECUTE_LIVE_COGNITO_TESTS, 'Skipping Cognito integration test');

    // Playwright runs spec files in parallel workers, so this spec deliberately uses a club that no
    // other spec writes to: test_already_registered3@user.test manages only "Morpeth Table Tennis
    // Club" in London, and the specs that log in as that user (login, homepage) never mutate club
    // or tournament data. Using London/"Morpeth" here would race PromoteMyClub and
    // PromoteMyTournaments, which add and remove that club's promotion info.
    const clubManager = { email: 'test_already_registered3@user.test', password: 'aA1!56789012' };

    const club = {
        location: 'London',
        club_name: 'Morpeth Table Tennis Club',
        homepage: 'http://morpethttc.co.uk/',
        instagram: '@morpethschooltt',
        facebook: 'https://www.facebook.com/groups/839330283232999/',
        youtube: 'https://www.youtube.com/watch?v=MiiPA2qE59o',
    };

    const tournament = {
        tournament_name: 'Listing Showcase Open',
        tournament_info: 'https://example.com/listing-showcase-open',
        instagram: 'https://www.instagram.com/p/listing-showcase',
        start_date: futureDateString(20),
        end_date: futureDateString(23),
    };

    // Recorded from the upsert requests the test makes through the UI, so that a failure part-way
    // through cannot leak a promoted club or a tournament into the environment. The test also
    // removes both through the UI as its last steps; DELETE is idempotent, so this only has work
    // to do when the test did not get that far.
    let addedClub: { url: string; auth: string } | null = null;
    let addedTournament: { url: string; auth: string } | null = null;

    test.afterAll(async ({ request }) => {
        const leftovers: { label: string; item: { url: string; auth: string } }[] = [];
        if (addedTournament) leftovers.push({ label: 'tournament', item: addedTournament });
        if (addedClub) leftovers.push({ label: 'club info', item: addedClub });

        if (leftovers.length === 0) return;

        console.log(`\n🧹 [Cleanup] Deleting ${String(leftovers.length)} leftover item(s)...`);
        for (const { label, item } of leftovers) {
            try {
                const response = await request.delete(item.url, {
                    headers: { 'Authorization': item.auth },
                });
                if (response.ok()) {
                    console.log(`✅ [Cleanup] Successfully deleted ${label} at ${item.url}.`);
                } else {
                    console.error(`❌ [Cleanup] Delete failed with status ${String(response.status())}: ${await response.text()}`);
                }
            } catch (error) {
                console.error('❌ [Cleanup] Delete threw an error:', error instanceof Error ? error.message : error);
            }
        }
    });

    test('Complete happy-path scenario', async ({ page }) => {
        const user = new User(page);
        let promoteMyClubPage: PromoteMyClubPage;
        let promoteMyTournamentsPage: PromoteMyTournamentsPage;

        // Records the upsert requests for the afterAll cleanup. Registered for the whole test rather
        // than one-shot before each action, so an unrelated request in between cannot consume it.
        page.on('request', (request) => {
            if (request.method() !== 'PUT') return;

            const url = request.url();
            if (url.includes('/tournaments/')) {
                addedTournament = { url, auth: request.headers().authorization };
            } else if (url.includes('/clubs/')) {
                addedClub = { url, auth: request.headers().authorization };
            }
        });

        await test.step('Given a Club Manager has promoted their club and added a tournament', async () => {
            await user.setFixedClockTime(FIXED_CLOCK_TIME);
            const loginPage = await user.navigateToLogin();
            await loginPage.loginAndWaitForHome(clubManager.email, clubManager.password);

            promoteMyClubPage = await user.navigateToPromoteMyClub();
            await promoteMyClubPage.selectClub(club.location, club.club_name);
            await promoteMyClubPage.addClubInfo({
                homepage: club.homepage,
                instagram: club.instagram,
                facebook: club.facebook,
                youtube: club.youtube,
            });

            await user.menu.open();
            promoteMyTournamentsPage = await user.menu.navigateToPromoteMyTournaments();
            await promoteMyTournamentsPage.selectClub(club.location, club.club_name);
            await promoteMyTournamentsPage.openAddTournamentForm();
            await promoteMyTournamentsPage.addTournament(tournament);
        });

        await test.step('When anyone opens the Clubs & Tournaments page, the tournament is listed under its location', async () => {
            await user.navigateToClubsAndTournaments();

            const tournamentsSection = page.getByTestId('tournaments-section');
            await expect(tournamentsSection.getByTestId('tournaments-location').filter({ hasText: club.location })).toHaveCount(1);

            const tournamentLink = tournamentsSection.getByTestId('tournament-link')
                .filter({ hasText: tournament.tournament_name });
            await expect(tournamentLink).toHaveCount(1);
            await expect(tournamentLink).toHaveAttribute('href', tournament.tournament_info);

            // Name and date range are shown together, as "<name>, <start> - <end>"
            await expect(tournamentLink).toContainText(`${tournament.tournament_name},`);
        });

        await test.step('And the promoted club is listed with its homepage and social links', async () => {
            const clubsSection = page.getByTestId('clubs-section');
            await expect(clubsSection.getByTestId('clubs-location').filter({ hasText: club.location })).toHaveCount(1);

            const clubRow = clubsSection.getByTestId('club-row').filter({ hasText: club.club_name });
            await expect(clubRow).toHaveCount(1);

            await expect(clubRow.getByTestId('club-link')).toHaveAttribute('href', club.homepage);
            await expect(clubRow.getByTestId('club-instagram-link')).toBeVisible();
            await expect(clubRow.getByTestId('club-facebook-link')).toBeVisible();
            await expect(clubRow.getByTestId('club-youtube-link')).toBeVisible();
        });

        await test.step('When the Club Manager removes the tournament and the club promotion info', async () => {
            await user.menu.open();
            promoteMyTournamentsPage = await user.menu.navigateToPromoteMyTournaments();
            await promoteMyTournamentsPage.selectClub(club.location, club.club_name, true);
            await promoteMyTournamentsPage.openDeleteTournamentForm(tournament.tournament_name);
            await promoteMyTournamentsPage.confirmDeleteTournament();
            addedTournament = null; // Removed through the UI, so afterAll has nothing left to delete

            promoteMyClubPage = await user.navigateToPromoteMyClub();
            await promoteMyClubPage.selectClub(club.location, club.club_name, true);
            await promoteMyClubPage.removeClubInfo();
            addedClub = null; // Removed through the UI, so afterAll has nothing left to delete
        });

        await test.step('Then neither the tournament nor the club appears on the page any more', async () => {
            await user.navigateToClubsAndTournaments();

            await expect(page.getByTestId('tournament-link').filter({ hasText: tournament.tournament_name })).toHaveCount(0);
            await expect(page.getByTestId('clubs-section').getByTestId('club-row').filter({ hasText: club.club_name })).toHaveCount(0);
        });
    });
});

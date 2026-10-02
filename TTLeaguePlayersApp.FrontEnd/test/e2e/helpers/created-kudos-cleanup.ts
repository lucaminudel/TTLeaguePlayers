import type { APIRequestContext, Page } from '@playwright/test';

export interface KudosIdentifier {
    league: string;
    season: string;
    division: string;
    receiving_team: string;
    home_team: string;
    away_team: string;
    giver_person_sub: string;
}

export interface CreatedKudos {
    body: KudosIdentifier;
    auth: string;
    url: string;
}

/** Tracks only award requests, excluding /kudos/standings and /kudos/clubstandings. */
export function trackCreatedKudos(page: Page, createdKudos: CreatedKudos[]): void {
    page.on('request', (request) => {
        const url = new URL(request.url());
        if (url.pathname.endsWith('/kudos') && request.method() === 'POST') {
            const body = request.postDataJSON() as KudosIdentifier | null;
            const auth = request.headers().authorization as string | undefined;
            if (body !== null && auth !== undefined) {
                createdKudos.push({
                    body: {
                        league: body.league,
                        season: body.season,
                        division: body.division,
                        receiving_team: body.receiving_team,
                        home_team: body.home_team,
                        away_team: body.away_team,
                        giver_person_sub: body.giver_person_sub,
                    },
                    auth,
                    url: request.url(),
                });
            }
        }
    });
}

export async function deleteCreatedKudos(
    request: APIRequestContext,
    createdKudos: CreatedKudos[]
): Promise<void> {
    if (createdKudos.length === 0) return;

    console.log(`\n🧹 [Cleanup] Starting deletion of ${String(createdKudos.length)} created Kudos...`);
    let successCount = 0;
    let failCount = 0;

    for (const item of [...createdKudos].reverse()) {
        let attempts = 0;
        const maxAttempts = 3;
        let deleted = false;

        while (attempts < maxAttempts && !deleted) {
            attempts++;
            try {
                const response = await request.delete(item.url, {
                    data: item.body,
                    headers: { Authorization: item.auth },
                });

                if (response.ok()) {
                    deleted = true;
                    successCount++;
                } else {
                    throw new Error(`Status ${String(response.status())}: ${await response.text()}`);
                }
            } catch (error) {
                if (attempts < maxAttempts) {
                    const delay = attempts * 1000;
                    console.warn(`⚠️ [Cleanup] Attempt ${String(attempts)} failed for Kudos to ${item.body.receiving_team}. Retrying in ${String(delay)}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    console.error(`❌ [Cleanup] Failed to delete Kudos to ${item.body.receiving_team} after ${String(maxAttempts)} attempts:`, error instanceof Error ? error.message : error);
                    failCount++;
                }
            }
        }
    }

    if (failCount > 0) {
        console.error(`\n⚠️ [Cleanup] Finished with ${String(failCount)} failures and ${String(successCount)} successes. Please check the datastore for stale items.`);
    } else {
        console.log(`\n✅ [Cleanup] Successfully deleted all ${String(successCount)} created Kudos.`);
    }
}

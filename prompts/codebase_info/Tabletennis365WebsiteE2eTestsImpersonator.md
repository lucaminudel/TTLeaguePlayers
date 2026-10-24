# TableTennis365 browser response fixtures

These committed files:

- TTLeaguePlayersApp.FrontEnd/test/e2e/data
- TTLeaguePlayersApp.FrontEnd/test/e2e/helpers/tabletennis365-test-setup.ts
- TTLeaguePlayersApp.FrontEnd/test/e2e/helpers/tabletennis365-impersonator.ts

supply deterministic HTTP responses to the scoped Playwright impersonator. They do not contact TableTennis365 during a stubbed test. There is no automatic refresh, expiry, runtime capture or generated response cache. Calendar `REFRESH-INTERVAL` and `X-PUBLISHED-TTL` metadata do not cause fixture updates.

`manifest.json` is an array of `{ url, status, contentType, bodyFile, capturedAt, provenance }`. Body paths are relative to this directory. `capturedAt` is the known capture date, or `null` for an existing fixture whose capture date is unknown. Status/content type describe the response served by the stub; provenance distinguishes observed upstream status from an existing test's success status.

The resolver matches complete upstream URLs, normalising only query order. The `d`, `handler`, `leagueId` and `teamId` values matter. A direct website request and a known proxy request carrying that same upstream URL select the same entry. Never save proxy credentials, proxy request URLs or session tokens here. Unlisted TT365 requests must fail rather than reach the website.

| Upstream target under `/CentralLondon/` | File | Origin and preservation |
| --- | --- | --- |
| `Fixtures/calendar.ics?d=9761` | `fixtures/division-4.ics` | Full public inception capture from 2026-10-24, including all original dates, opponents, timezone, cancellations, folding and venue fields. Teams share this division calendar; the real processor filters it. |
| `Team/Eligibility` | `players/eligibility.html` | Public inception capture from 2026-10-24 reduced to the actual `select#teamSelect`, retaining all original options/attributes. Morpeth 10 has ID `75706`. |
| `Team/Eligibility?handler=Players&leagueId=4760&teamId=75706` | `players/morpeth-10.json` | Same-date public roster capture, preserving six `{ id, name }` records under `teamPlayers`. Player names and IDs are anonymous fixture values; unrelated `otherPlayers` is empty. |
| `Clubs/TSPxHAtVSl` | `clubs/walworth.html` | Existing Walworth scenario fixture, reduced to its original teams table. |
| `Clubs/Highbury` | `clubs/highbury.html` | Existing Highbury scenario fixture, reduced to its original teams table. |
| `Clubs/Morpeth` | `clubs/morpeth.html` | Existing Morpeth scenario fixture, reduced to its original teams table. |

Selector/club HTML omits scripts, navigation, advertisements, tracking, contact information and unrelated content. Club tables retain their four original columns and rows; division spellings, team names and existing anonymised captain cells are unchanged. Existing fixtures outside this directory remain untouched. Calendar fixture dates are intentionally fixed: don't alter scenario clocks or expected opponents to accommodate a replacement capture.

The anonymous default roster is useful for endpoint/shape checks. Invitation scenarios need their own run-specific player names for backend isolation; supply them through the named `players.returnRoster(...)` override, which supplies a consistent selector/roster pair. Same-URL failure or alternative-data scenarios likewise use test-scoped named overrides rather than duplicate manifest entries.

## Add a request for a future test

1. Establish that the test actually triggers that upstream request. Record the complete upstream URL and parameters without proxy credentials.
2. Capture the public response deliberately, review it, and save a new body file. Alternatively reuse compatible reviewed scenario data and identify it as such. Remove unnecessary personal/contact details and active scripts while preserving meaningful response structure. Record each alteration.
3. Add one manifest entry with exact URL, response status/content type, relative body filename, known capture date and honest provenance. For example, a different `d` value needs its own entry and calendar file. A new roster needs the selector's actual team ID and a matching `handler=Players&leagueId=...&teamId=...` entry. Do not invent an upstream capture date or success status.
4. Check that a retained external-services test covers that endpoint, parameter pattern and response structure. Add meaningful contract coverage if missing; do not replace live contracts with this stub.
5. Enable stubbed mode only for the dependent test/group. Run the affected behavioral test, prove its relevant assertion fails with an incompatible response, then restore the response and confirm it passes. Include the shared routing/scope/isolation checks and record the evidence in the task verification matrix.

A changed response for the same URL in a particular scenario belongs in a scoped override. A duplicate normalised manifest URL is an error. Missing parameters, extra parameters or different IDs must never silently reuse another entry's response.

## Readable setup in a spec

For a file whose tests all need TT365 responses:

```ts
import { stubbedTest as test, expect } from './helpers/tabletennis365-test-setup';
```

For a mixed file, import `test`, `stubbedTest` and `expect` from that module and declare only the dependent cases with `stubbedTest(...)`. Ordinary `test(...)` defaults to off and installs no TT365 routes. Adjust the relative import to the spec's directory.

The helper is available as the `tableTennis365Stub` test parameter. Its named overrides are synchronous setup operations:

```ts
tableTennis365Stub.fixtures.failWithHttpStatus(500);
tableTennis365Stub.fixtures.failWithNetworkError();
tableTennis365Stub.fixtures.returnServiceUnavailable();
tableTennis365Stub.clubs.failWithNetworkError(
    'https://www.tabletennis365.com/CentralLondon/Clubs/Highbury'
);
tableTennis365Stub.players.returnRoster({
    team: 'Morpeth 10', teamId: 73142, players: EXPECTED_PLAYERS
});
```

These are alternative scenario choices, not setup to combine in one test. Normal successes use the manifest without extra setup. Fixture failures can optionally take an exact upstream URL as their last argument. Club failures take the exact URL or club URL slug, not the configured display name. Roster setup supplies both selector and matching JSON with numeric player IDs. Overrides and handlers are per test and are disposed even after a failure; unrelated page routes remain installed for their own lifetime.

The existing external-services specs deliberately retain the base `@playwright/test` import and remain live/direct. A spec importing this shared fixture can also explicitly use `test.use({ tableTennis365: 'live' })` to disable impersonation. Never enable the stub in a live contract.

Manual replacement follows the same review process. An upstream change alone does not require updating static fixtures. Keep existing scenario behavior intact or obtain an explicit decision before changing it.

## Live contract correspondence

Paths below are relative to `test/e2e/external-services/clttl-2026/`:

- **F:** `ActiveSeasonProcessor/Access/ActiveSeasonBrowserProxyAccess.spec.ts` exercises browser/proxy calendar fetching; `ActiveSeasonProcessor/ContentStructure/ActiveSeasonContentStructure.spec.ts` checks direct calendar response markers and production-parser fixtures with valid dates and nonempty teams.
- **P:** The same Access file exercises selector plus selector-derived roster. The ContentStructure file checks `select#teamSelect option[value]`, named teams with positive numeric IDs, a matching roster URL and nonempty `teamPlayers` containing positive integer `id` and nonempty string `name`. Anonymous player values preserve this structure; exact live identities/counts are not contracts.
- **C:** `ManagedClubProcessor/Access/ManagedClubContentBrowserProxyAccess.spec.ts` exercises browser/proxy club fetching and meaningful parsed teams/divisions. `ManagedClubProcessor/ContentStructure/ManagedClubContentStructure.spec.ts` checks `table.tt-contact-table tbody tr`, at least three cells and meaningful name/division content. The reduced tables preserve those fields and column ordering.

Live contracts continue calling real services. These files do not establish current website availability, proxy availability or transport behavior. `Transport/FailureHandling/CLTTLTransportFailureHandling.spec.ts` covers the injected fault semantics separately: real fetchers call local HTTP servers returning F HTTP 500/plain text, F HTTP 200/service-unavailable HTML, and F/C connection aborts. Those deterministic fault contracts do not claim the live website was observed failing; live success-shape contracts do not prove fault handling.

# Frontend caching

Current implementation status: 25 October 2026.

The frontend caches resource data in browser `localStorage`, using `src/utils/CacheUtils.ts`.
The backend API policy names below describe **frontend caches of backend responses**. They do not
configure API Gateway, Lambda, DynamoDB, CloudFront or the external TT365/proxy infrastructure.

## Shared windows

All six constants are exported from `TTLeaguePlayersApp.FrontEnd/src/utils/CacheWindows.ts`.
Each contains `freshDurationMs` and `staleDurationMs` in milliseconds. Despite its existing name,
`staleDurationMs` is the **total age at expiry**, not an additional interval after freshness.

| Constant | Fresh below | Expired at or above | Current use |
| --- | --- | --- | --- |
| BACKEND_API_SHORT | 2 hours | 7 days | Player kudos, team kudos, division kudos standings, club kudos standings |
| BACKEND_API_MEDIUM | 4 hours | 10 days | Club-team registration statuses, team-player registration statuses, public clubs and tournaments |
| BACKEND_API_LONG | 1 day | 14 days | Defined; no current assignment |
| TT365_PROCESSOR_SHORT | 12 hours | 21 days | Team players |
| TT365_PROCESSOR_MEDIUM | 1 day | 42 days | Fixtures, managed club teams |
| TT365_PROCESSOR_LONG | 1 day | 42 days | Defined; no current assignment; intentionally identical to Medium |

Cache age is measured from the last successful fetch, stored as `{timestamp, data}`. Existing entries
keep their timestamps and immediately use the new windows; keys and stored shape have not changed.

- Age < freshness threshold: return cached data without fetching.
- Freshness threshold <= age < expiry: return cached data immediately and fetch in the background.
- Age >= expiry, or missing cache: await a fetch; do not serve expired data as a fallback.
- A rejected fetch does not overwrite a valid entry, even if expired. Failed stale refreshes retain
  the cached result and log a browser warning. Invalid cache JSON/structure is removed.
- Any successfully resolved payload, including an empty collection, is still cacheable. Parser and
  API response validity and frontend error reporting are separate concerns not changed by these goals.

## Cache identities and invalidation

| Resource | Key |
| --- | --- |
| Fixtures | cache_{league}_{season}_{division}_{team}_fixtures |
| Team players | cache_{league}_{season}_{division}_{team}_players |
| Managed club teams | cache_club_{league}_{season}_{location}_{club} |
| Club-team registrations | invite_cache_registrations_{league}_{season}_{location}_{club} |
| Team-player registrations | invite_cache_players_{league}_{season}_{division}_{team} |
| Player kudos | kudos_cache_player_{league}_{season}_{division}_{team}_{giverPersonSub or all} |
| Team kudos | kudos_cache_team_{league}_{season}_{division}_{team} |
| Division standings | kudos_cache_standings_{league}_{season}_{division} |
| Club standings | kudos_cache_clubstandings_{league}_{season}_{location}_{club} |
| Public clubs and tournaments | clubs_cache_all |

Successful invite creation/acceptance invalidates `invite_cache_`; kudos award invalidates
`kudos_cache_`; club/tournament writes invalidate `clubs_cache_`. Processor caches have no explicit
write invalidation. Registration/club-standings wrappers invalidate entries unable to answer all
requested names. Requested-name projection applies both to the returned result and to background
update callbacks, preserving caller ordering and excluding obsolete names.

### Changes to cached item structure

Whenever a local cache item's stored structure changes, explicitly document the change and make
a compatibility decision about deleting existing items and storing the new structure under a new
cache key (for example, a versioned key). Do not silently reuse a key for incompatible structures:
old and new app versions could otherwise read or overwrite each other's incompatible items.
Record the chosen key and old-item cleanup strategy with the change, including how existing
prefix-based invalidation will reach the new key.

## Updating mounted screens

Implemented for every current cached consumer:

| Screen | Background completion behaviour |
| --- | --- |
| Matches & Kudos | Recomputes previous/next fixtures, dates, venues and directions from the refreshed calendar |
| Invite Team Members | Applies refreshed player registration statuses; a refreshed TT365 roster updates names and re-reads statuses |
| My Club Teams | Applies refreshed registrations; a refreshed TT365 team list re-reads registration statuses |
| My Club Standings | Applies refreshed counts; a refreshed TT365 team list re-reads club standings |
| Kudos Standings: Awarded, Team, Table | Updates the displayed list/table |
| Public Clubs & Tournaments | Updates the displayed clubs/tournaments |

`ActiveSeasonProcessor` and `ManagedClubProcessor` cached read methods accept an optional data-update
callback. Their cache decorators pass it into `withSWR`. Existing backend cache wrappers also expose
callbacks. Components consume the initial value and refreshes with `readWithUpdates`, which prevents
a fast refresh from being overwritten by a later-delivered initial stale value.

Effect cleanup ignores callbacks from obsolete selections, collapsed fixture cards and unmounted
screens. Version checks also ignore older dependent requests after a new roster/team list arrives.
After invite creation, the immediate row update is kept while registrations are re-read; older
registration callbacks cannot overwrite it.

This is request-triggered SWR, not periodic polling: a stale read starts the refresh. A screen does
not refresh merely because the displayed data crosses the freshness threshold. Callbacks update the
consumer that initiated a read; localStorage is not a shared reactive subscription across tabs or
unrelated mounted consumers. Background refresh failures do not display a new error banner.

## Verification

Verified on 25 October 2026: frontend lint passed, TypeScript project build and dev Vite build
passed, test TypeScript checks passed, and the full frontend unit suite passed (49 files, 949 tests). No live services or E2E
flows were exercised for these changes.

- `test/unit/utils/CacheWindows.test.ts`: all ten resource mappings, just below/exact freshness and
  expiry thresholds, successful refresh callbacks, fixture Date restoration, and all six constants.
- Existing API and processor cache tests: fresh/stale/expired behaviour, cache identity and isolation,
  callback behaviour, and failed refresh retention.
- `test/unit/utils/readWithUpdates.test.ts`: initial display, later refresh, fast refresh ordering,
  and ignored late results after cleanup/supersession.
- Component tests for ActiveSeasonCard, ClubTeamsList, ClubStandingsList and TeamPlayersList:
  current-screen updates, dependent reads, empty refreshes and obsolete callback protection.
- Existing page tests cover the public listing and Kudos Standings consumers.
- `test/unit/components/ui/CacheRefreshLifecycle.test.tsx`: 32 independently deferred StrictMode
  and dependent-request cases protect rows, loading/error states and late callbacks.
- Strengthened Kudos page tests cover tab-switch races, current errors, request arguments and
  obsolete-request information-modal guards.
- Invitation creation uses a separate selection version from status-read generations, so a
  same-team roster refresh cannot discard a successful write. Ten additional TeamPlayersList cases
  and five detected temporary sensitivity mutations cover pending writes, current roster names,
  superseded errors, empty rosters and old-team completion protection. Six further draft-lifecycle
  cases and three detected sensitivity mutations verify that a roster refresh preserves a typed
  invitation email while its player remains present, and clears the draft on removal/team changes.
  Both invitation findings are resolved; see the task's review.md.

Deterministic mutation testing covered 13 changed executable source files. Initial scope: 1,373
mutants, 892 killed, 404 survived, 74 uncovered, two runtime errors and one timeout. Three fresh
focused reruns increased cumulative evidence to 950 killed, 356 survived, 64 uncovered, two runtime
errors and one timeout; this is an overlay of matching mutants, not a final full rerun. All three
generated policy mutants and 12 supplemental duration-field sensitivity mutations were detected.
The broad run predates the Review fix to TeamPlayersList and its ten added tests. Review subsequently
reproduced and fixed a pending-invitation race, with the focused evidence described above. Other
existing API/rendering branches retain evidence gaps. Full reconciliation, scope, report paths and conservative
survivor classifications are recorded in
`.codex/coding-tasks/frontend-external-call-outcomes/mutation-review.md`.

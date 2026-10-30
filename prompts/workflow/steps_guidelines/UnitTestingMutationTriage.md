# Unit-testing mutation triage

## Document purpose and references

Version-controlled register of problems surfaced by frontend unit-test mutation testing
and findings investigated and determined not to require a fix. Update this register
alongside test or source changes. Human and AI reviewers use the same evidence requirements.

Commands and report destinations are documented in
[FrontEnd Verification Commands](../instructions/FrontEnd%20VerificationCommands.md#3-commands-to-run-frontend-mutation-tests).
This register is a decision record, not generated output or a Stryker configuration file.



## Current mutation testing results and triage decisions record

| Action status | ID | File / finding | Survived | No coverage | Timeout | Decision state | Determination date | Reason / evidence | Next action | Evidence run |
| --- | --- | --- | ---: | ---: | ---: | --- | --- | --- | --- | --- |
| 🛑 | UTM-001 | `service/frontend-diagnostics/FrontendEventQueue.ts` | 37 | 6 | 2 | Fix required | 2026-10-30 | Current full report: malformed-entry validation, invalid persisted queue handling and drain lifecycle branches remain non-killed. The two timeout mutants have separate accepted decisions in UTM-014. | Split queue parsing, persistence-failure and drain-lifecycle behaviours into exact groups; add assertions before considering acceptance. | FULL-2026-10-30 |
| 🛑 | UTM-002 | `components/navigation/MainMenu.tsx` | 50 | 1 | 2 | Fix required | 2026-10-30 | Current full report: menu state, role/navigation visibility, and user-information fallbacks retain 51 non-killed mutations after UTM-016 resolved the first-season guard. | Split by authenticated/role/empty-data display behaviour; add semantic UI assertions and investigate the two timeout variants. | FULL-2026-10-30 |
| 🛑 | UTM-003 | `service/league-season-processors/clttl-2026/TT365Diagnostics.ts` | 13 | 1 | 0 | Fix required | 2026-10-30 | Current full report: diagnostic envelope fields and nested-cause handling survive or are uncovered. Existing tests do not distinguish all absent-cause and non-Error-cause contracts. | Add focused assertions for request/source/exception fields, absent causes and nested causes; accept only proven equivalent envelope variants. | FULL-2026-10-30 |
| 🛑 | UTM-004 | `service/frontend-diagnostics/FrontendDiagnostics.ts` | 1 | 1 | 0 | Fix required | 2026-10-30 | `frontendException` has no direct unit coverage for non-`Error` values, and its `instanceof Error` guard survives. | Add direct unit tests for `Error` and primitive/non-Error inputs, asserting the exact diagnostic object shape. | FULL-2026-10-30 |
| 🛑 | UTM-005 | `service/league-season-processors/clttl-2026/CLTTLHttpTransport.ts` | 16 | 3 | 0 | Fix required | 2026-10-30 | Current full report: retry/decompression/abort cleanup branches retain non-killed and uncovered mutations. Existing transport tests do not yet distinguish all response-body and timeout paths. | Split request construction, decompression, timeout cleanup and retry outcomes; add deterministic tests for each observable contract. | FULL-2026-10-30 |
| 🛑 | UTM-006 | `utils/CacheUtils.ts` | 17 | 5 | 1 | Fix required | 2026-10-30 | Current full report: cache-shape validation, stale callbacks and invalidation edge cases retain non-killed mutations. The one loop timeout is separately accepted in UTM-013. | Add tests for malformed cache payloads, missing keys, stale refresh callbacks and invalidation boundary conditions. | FULL-2026-10-30 |
| 🛑 | UTM-007 | `api/frontendEventsApi.ts` | 4 | 0 | 0 | Fix required | 2026-10-30 | Current full report: the GeneralApiError/status propagation condition and timeout cleanup retain four survivors. Existing tests cover network and numeric-status paths but not all error-shape distinctions. | Add tests for GeneralApiError with/without status and timer cleanup after each delivery outcome. | FULL-2026-10-30 |
| 🟢 | UTM-008 | `service/league-season-processors/CLTTLActiveSeason2026Processor.ts`: `getTeamFixtures` / `getTeamIds` / `getTeamPlayers` operation names and their `{ division, team, teamId }` diagnostic contexts | 0 | 0 | 0 | Resolved | 2026-10-30 | The integration suite now asserts the emitted diagnostic operation and exact parameters for fixture, team-ID and roster failures. The expanded suite passes; the six-survivor full-run result is pre-fix evidence. | Retain the failure-path assertions and rerun this source scope before refreshing full-run counts. | FULL-2026-10-30 |
| 🟢 | UTM-009 | `service/league-season-processors/CLTTLManagedClub2026Processor.ts`: `getClubTeams` operation name and `{ club }` diagnostic context | 0 | 0 | 0 | Resolved | 2026-10-30 | The managed-club integration suite now asserts the emitted `getClubTeams` operation and club parameter on a fetch failure. The suite passes; the two-survivor full-run result is pre-fix evidence. | Retain the failure-path assertion and rerun this source scope before refreshing full-run counts. | FULL-2026-10-30 |
| 🟢 | UTM-010 | `service/league-season-processors/clttl-2026/PageFetcherError.ts`: `this.name = 'PageFetcherError'` mutated to `""` (StringLiteral) | 0 | 0 | 0 | Resolved | 2026-10-30 | Survived with only `TT365Diagnostics.test.ts`; killed when the existing `CLTTLHttpTransport.test.ts` error-identity assertion was included. Final incremental report: 2 killed, none survived. A selected-test scope issue, not a confirmed missing test. | Retain the transport spec when verifying this class. No source change or suppression required. | INC-2026-10-30-error-names |
| 🟢 | UTM-011 | `service/league-season-processors/clttl-2026/TT365ParsingError.ts`: `this.name = 'TT365ParsingError'` mutated to `""` (StringLiteral) | 0 | 0 | 0 | Resolved | 2026-10-30 | The diagnostic test now asserts the literal error name rather than deriving the expectation from `error.name`. The six-test diagnostic suite passes; the previous one-survivor result is pre-fix evidence. | Retain the explicit error-name assertion. Rerun the focused mutation scope before treating the full baseline as refreshed. | INC-2026-10-30-error-names |
| 🟢 | UTM-012 | `components/ui/ClubTeamsList.tsx`: null-guard conditional and its `return null` block | 0 | 0 | 0 | Resolved | 2026-10-30 | The full run reported two `RuntimeError` mutants. Directly applying either mutation makes the registrations-endpoint-failure test render an error boundary instead of the supported empty state. The test now asserts that no error boundary is rendered, so both direct mutants fail. | Retain the boundary assertion. The next relevant Stryker run should record these as killed rather than runtime errors. | FULL-2026-10-30 |
| 🟢 | UTM-013 | `utils/CacheUtils.ts`: `for (let i = 0; i < localStorage.length; i++)` mutated to `i--` (UpdateOperator) | 0 | 0 | 1 | Accepted: no fix required | 2026-10-30 | The full report identifies the existing “Invalidate by prefix” test as covering the mutation. Starting at zero, decrementing `i` never reaches a positive `localStorage.length`, so the mutant intentionally runs until Stryker’s 300-test limit. The timeout detects the faulty behaviour; no product or test gap is indicated. | Keep visible in Stryker and reevaluate if this loop or its test changes. Do not suppress it. | FULL-2026-10-30 |
| 🟢 | UTM-014 | `service/frontend-diagnostics/FrontendEventQueue.ts`: valid-queue guards `parsed.version !== QUEUE_VERSION` and `!('entries' in parsed)` (EqualityOperator / BooleanLiteral) | 0 | 0 | 2 | Accepted: no fix required | 2026-10-30 | Each full-run timeout was directly replayed. Either mutant discards every valid stored queue, and the existing queue unit suite fails 16 assertions immediately: persisted entries are neither drained nor retained. The timeout is a Stryker execution classification, not a product or test gap. | Keep visible in Stryker and reevaluate if queue validation or its test suite changes. Do not suppress it. | FULL-2026-10-30 |
| 🟢 | UTM-015 | `api/api.ts`: the retry `while` body, its `try` block, and its `catch` block mutated to `{}` (BlockStatement) | 0 | 0 | 3 | Accepted: no fix required | 2026-10-30 | All three full-run timeouts are bounded by Stryker’s test limit and covered by retry tests. Each mutation leaves `attempt` unchanged inside `while (attempt <= maxRetries)`, creating a non-terminating retry loop. This is detection of a broken mutant, not evidence of a production or test gap. | Keep visible in Stryker and reevaluate if retry control flow or its tests change. Do not suppress it. | FULL-2026-10-30 |
| 🟢 | UTM-016 | `components/navigation/MainMenu.tsx`: `firstSeason && (...)` mutated to `true` / `false` (ConditionalExpression) | 0 | 0 | 0 | Resolved | 2026-10-30 | The full run timed out on both variants. Existing assertions already reject the hidden-first-season variant. The no-seasons case now uses a test-only error boundary and asserts normal rendering; forcing the block true throws on `firstSeason.league` and fails the suite. | Retain the no-seasons error-boundary assertion. The next relevant Stryker run should classify both variants as killed. | FULL-2026-10-30 |
| 🟢 | UTM-017 | `CLTTLActiveSeason2026PagesParser.ts`: year validation in `parseCalendarDateTime` (year comparison and the combined year/month condition) | 0 | 0 | 0 | Resolved | 2026-10-30 | Added the valid-format but invalid `0000` year case. `Date.UTC` normalizes it to 1900 while preserving the other components, so the parser must reject it. This makes the year guard and combined-condition mutations observable. | Retain the zero-year calendar fixture; rerun the parser mutation scope before refreshing counts. | INC-2026-10-30-parser |
| 🟢 | UTM-018 | `CLTTLActiveSeason2026PagesParser.ts`: month/day/hour/minute/second normalization comparisons in `parseCalendarDateTime` | 5 | 0 | 0 | Accepted: no fix required | 2026-10-30 | For a numeric value outside these components’ ranges, JavaScript date normalization necessarily changes an earlier component already checked: month/day changes the year or month, hour changes the day, minute changes the hour, and second changes the minute. Removing only the later comparison is therefore equivalent under this parser’s fixed-width numeric input. | Keep visible in Stryker and reevaluate if date parsing or validation order changes. Do not suppress it. | INC-2026-10-30-parser |
| 🟢 | UTM-019 | `CLTTLActiveSeason2026PagesParser.ts`: case-insensitive `(Division …)` suffix removal from `SUMMARY` | 0 | 0 | 0 | Resolved | 2026-10-30 | Added a lower-case `(division 4)` calendar event and asserted that the parser returns the unsuffixed home and away names. This makes the regex case-insensitivity observable. | Retain the lower-case suffix case and rerun the parser mutation scope before refreshing counts. | INC-2026-10-30-parser |
| 🟢 | UTM-020 | `CLTTLActiveSeason2026PagesParser.ts`: legacy `{ players: [...] }` player-response branch | 0 | 0 | 0 | Resolved | 2026-10-30 | Added a legacy object payload using `players` rather than `teamPlayers` and asserted name extraction from both supported name fields. This makes the fallback response selection observable. | Retain the legacy-payload contract and rerun the parser mutation scope before refreshing counts. | INC-2026-10-30-parser |
| 🟢 | UTM-021 | `CLTTLActiveSeason2026PagesParser.ts`: selector options with absent or blank `value` attributes | 0 | 0 | 0 | Resolved | 2026-10-30 | Added a selector containing both an option with no `value` attribute and a whitespace-only value. Both must be ignored safely and produce no team IDs. | Retain the absent/blank-option case and rerun the parser mutation scope before refreshing counts. | INC-2026-10-30-parser |
| 🟢 | UTM-022 | `CLTTLActiveSeason2026PagesParser.ts`: `unknown event` observability fallback for unusable events without UID or SUMMARY | 0 | 0 | 0 | Resolved | 2026-10-30 | Added a malformed calendar event with neither UID nor SUMMARY and asserted the exact fallback diagnostic. This covers the previously uncovered fallback identifier. | Retain the anonymous-event diagnostic case and rerun the parser mutation scope before refreshing counts. | INC-2026-10-30-parser |
| 🟢 | UTM-023 | `CLTTLActiveSeason2026PagesParser.ts`: whitespace-tolerant `(Division …)` summary suffix removal | 0 | 0 | 0 | Resolved | 2026-10-30 | Added a summary with multiple spaces before and after the division suffix and asserted clean team names. This makes the suffix regex’s surrounding-whitespace handling observable. | Retain the spaced-suffix case and rerun the parser mutation scope before refreshing counts. | INC-2026-10-30-parser |
| 🛑 | FULL-api-api-ts | `api/api.ts` | 87 | 40 | 3 | Fix required | 2026-10-30 | Complete full-baseline source inventory. A more specific UTM decision overrides this broad source row. | Split into behavioural groups; add tests or replace with a narrow accepted decision backed by evidence. | FULL-2026-10-30 |
| 🛑 | FULL-api-cachedInviteApi-ts | `api/cachedInviteApi.ts` | 24 | 4 | 0 | Fix required | 2026-10-30 | Complete full-baseline source inventory. A more specific UTM decision overrides this broad source row. | Split into behavioural groups; add tests or replace with a narrow accepted decision backed by evidence. | FULL-2026-10-30 |
| 🛑 | FULL-api-cachedKudosApi-ts | `api/cachedKudosApi.ts` | 43 | 6 | 0 | Fix required | 2026-10-30 | Complete full-baseline source inventory. A more specific UTM decision overrides this broad source row. | Split into behavioural groups; add tests or replace with a narrow accepted decision backed by evidence. | FULL-2026-10-30 |
| 🛑 | FULL-api-clubsApi-ts | `api/clubsApi.ts` | 3 | 0 | 0 | Fix required | 2026-10-30 | Complete full-baseline source inventory. A more specific UTM decision overrides this broad source row. | Split into behavioural groups; add tests or replace with a narrow accepted decision backed by evidence. | FULL-2026-10-30 |
| 🛑 | FULL-api-frontendEventsApi-ts | `api/frontendEventsApi.ts` | 4 | 0 | 0 | Fix required | 2026-10-30 | Complete full-baseline source inventory. A more specific UTM decision overrides this broad source row. | Split into behavioural groups; add tests or replace with a narrow accepted decision backed by evidence. | FULL-2026-10-30 |
| 🛑 | FULL-api-kudosApi-ts | `api/kudosApi.ts` | 0 | 4 | 0 | Fix required | 2026-10-30 | Complete full-baseline source inventory. A more specific UTM decision overrides this broad source row. | Split into behavioural groups; add tests or replace with a narrow accepted decision backed by evidence. | FULL-2026-10-30 |
| 🛑 | FULL-App-tsx | `App.tsx` | 0 | 15 | 0 | Fix required | 2026-10-30 | Complete full-baseline source inventory. A more specific UTM decision overrides this broad source row. | Split into behavioural groups; add tests or replace with a narrow accepted decision backed by evidence. | FULL-2026-10-30 |
| 🛑 | FULL-components-common-Button-tsx | `components/common/Button.tsx` | 8 | 0 | 0 | Fix required | 2026-10-30 | Complete full-baseline source inventory. A more specific UTM decision overrides this broad source row. | Split into behavioural groups; add tests or replace with a narrow accepted decision backed by evidence. | FULL-2026-10-30 |
| 🛑 | FULL-components-common-ErrorMessage-tsx | `components/common/ErrorMessage.tsx` | 2 | 0 | 0 | Fix required | 2026-10-30 | Complete full-baseline source inventory. A more specific UTM decision overrides this broad source row. | Split into behavioural groups; add tests or replace with a narrow accepted decision backed by evidence. | FULL-2026-10-30 |
| 🛑 | FULL-components-common-FieldError-tsx | `components/common/FieldError.tsx` | 2 | 0 | 0 | Fix required | 2026-10-30 | Complete full-baseline source inventory. A more specific UTM decision overrides this broad source row. | Split into behavioural groups; add tests or replace with a narrow accepted decision backed by evidence. | FULL-2026-10-30 |
| 🛑 | FULL-components-common-FormField-tsx | `components/common/FormField.tsx` | 2 | 0 | 0 | Fix required | 2026-10-30 | Complete full-baseline source inventory. A more specific UTM decision overrides this broad source row. | Split into behavioural groups; add tests or replace with a narrow accepted decision backed by evidence. | FULL-2026-10-30 |
| 🛑 | FULL-components-common-InfoModal-tsx | `components/common/InfoModal.tsx` | 12 | 1 | 0 | Fix required | 2026-10-30 | Complete full-baseline source inventory. A more specific UTM decision overrides this broad source row. | Split into behavioural groups; add tests or replace with a narrow accepted decision backed by evidence. | FULL-2026-10-30 |
| 🛑 | FULL-components-common-infoModalMessages-tsx | `components/common/infoModalMessages.tsx` | 7 | 0 | 0 | Fix required | 2026-10-30 | Complete full-baseline source inventory. A more specific UTM decision overrides this broad source row. | Split into behavioural groups; add tests or replace with a narrow accepted decision backed by evidence. | FULL-2026-10-30 |
| 🛑 | FULL-components-common-Input-tsx | `components/common/Input.tsx` | 26 | 4 | 0 | Fix required | 2026-10-30 | Complete full-baseline source inventory. A more specific UTM decision overrides this broad source row. | Split into behavioural groups; add tests or replace with a narrow accepted decision backed by evidence. | FULL-2026-10-30 |
| 🛑 | FULL-components-ui-ClubTeamsList-tsx | `components/ui/ClubTeamsList.tsx` | 20 | 1 | 0 | Fix required | 2026-10-30 | Complete full-baseline source inventory. A more specific UTM decision overrides this broad source row. | Split into behavioural groups; add tests or replace with a narrow accepted decision backed by evidence. | FULL-2026-10-30 |
| 🛑 | FULL-components-ui-InvitePlayerDialog-tsx | `components/ui/InvitePlayerDialog.tsx` | 6 | 0 | 0 | Fix required | 2026-10-30 | Complete full-baseline source inventory. A more specific UTM decision overrides this broad source row. | Split into behavioural groups; add tests or replace with a narrow accepted decision backed by evidence. | FULL-2026-10-30 |
| 🛑 | FULL-components-ui-ManagedClubsCard-tsx | `components/ui/ManagedClubsCard.tsx` | 10 | 0 | 0 | Fix required | 2026-10-30 | Complete full-baseline source inventory. A more specific UTM decision overrides this broad source row. | Split into behavioural groups; add tests or replace with a narrow accepted decision backed by evidence. | FULL-2026-10-30 |
| 🛑 | FULL-components-ui-TeamPlayersList-tsx | `components/ui/TeamPlayersList.tsx` | 46 | 6 | 0 | Fix required | 2026-10-30 | Complete full-baseline source inventory. A more specific UTM decision overrides this broad source row. | Split into behavioural groups; add tests or replace with a narrow accepted decision backed by evidence. | FULL-2026-10-30 |
| 🛑 | FULL-config-environment-ts | `config/environment.ts` | 2 | 12 | 0 | Fix required | 2026-10-30 | Complete full-baseline source inventory. A more specific UTM decision overrides this broad source row. | Split into behavioural groups; add tests or replace with a narrow accepted decision backed by evidence. | FULL-2026-10-30 |
| 🛑 | FULL-contexts-AuthContext-tsx | `contexts/AuthContext.tsx` | 36 | 302 | 0 | Fix required | 2026-10-30 | Complete full-baseline source inventory. A more specific UTM decision overrides this broad source row. | Split into behavioural groups; add tests or replace with a narrow accepted decision backed by evidence. | FULL-2026-10-30 |
| 🛑 | FULL-contexts-AuthContextParsers-ts | `contexts/AuthContextParsers.ts` | 41 | 0 | 0 | Fix required | 2026-10-30 | Complete full-baseline source inventory. A more specific UTM decision overrides this broad source row. | Split into behavioural groups; add tests or replace with a narrow accepted decision backed by evidence. | FULL-2026-10-30 |
| 🛑 | FULL-hooks-useAcceptInvite-ts | `hooks/useAcceptInvite.ts` | 41 | 26 | 0 | Fix required | 2026-10-30 | Complete full-baseline source inventory. A more specific UTM decision overrides this broad source row. | Split into behavioural groups; add tests or replace with a narrow accepted decision backed by evidence. | FULL-2026-10-30 |
| 🛑 | FULL-hooks-useAuth-ts | `hooks/useAuth.ts` | 1 | 2 | 0 | Fix required | 2026-10-30 | Complete full-baseline source inventory. A more specific UTM decision overrides this broad source row. | Split into behavioural groups; add tests or replace with a narrow accepted decision backed by evidence. | FULL-2026-10-30 |
| 🛑 | FULL-hooks-useInfoModalSequence-ts | `hooks/useInfoModalSequence.ts` | 5 | 1 | 0 | Fix required | 2026-10-30 | Complete full-baseline source inventory. A more specific UTM decision overrides this broad source row. | Split into behavioural groups; add tests or replace with a narrow accepted decision backed by evidence. | FULL-2026-10-30 |
| 🛑 | FULL-hooks-useInfoModalSuppression-ts | `hooks/useInfoModalSuppression.ts` | 3 | 2 | 0 | Fix required | 2026-10-30 | Complete full-baseline source inventory. A more specific UTM decision overrides this broad source row. | Split into behavioural groups; add tests or replace with a narrow accepted decision backed by evidence. | FULL-2026-10-30 |
| 🛑 | FULL-main-tsx | `main.tsx` | 0 | 4 | 0 | Fix required | 2026-10-30 | Complete full-baseline source inventory. A more specific UTM decision overrides this broad source row. | Split into behavioural groups; add tests or replace with a narrow accepted decision backed by evidence. | FULL-2026-10-30 |
| 🛑 | FULL-pages-AboutAndContactUs-tsx | `pages/AboutAndContactUs.tsx` | 0 | 6 | 0 | Fix required | 2026-10-30 | Complete full-baseline source inventory. A more specific UTM decision overrides this broad source row. | Split into behavioural groups; add tests or replace with a narrow accepted decision backed by evidence. | FULL-2026-10-30 |
| 🛑 | FULL-pages-AwardKudos-tsx | `pages/AwardKudos.tsx` | 0 | 99 | 0 | Fix required | 2026-10-30 | Complete full-baseline source inventory. A more specific UTM decision overrides this broad source row. | Split into behavioural groups; add tests or replace with a narrow accepted decision backed by evidence. | FULL-2026-10-30 |
| 🛑 | FULL-pages-ClubsAndTournaments-tsx | `pages/ClubsAndTournaments.tsx` | 16 | 0 | 0 | Fix required | 2026-10-30 | Complete full-baseline source inventory. A more specific UTM decision overrides this broad source row. | Split into behavioural groups; add tests or replace with a narrow accepted decision backed by evidence. | FULL-2026-10-30 |
| 🛑 | FULL-pages-ExternalContractsLiveTesting-tsx | `pages/ExternalContractsLiveTesting.tsx` | 8 | 2 | 0 | Fix required | 2026-10-30 | Complete full-baseline source inventory. A more specific UTM decision overrides this broad source row. | Split into behavioural groups; add tests or replace with a narrow accepted decision backed by evidence. | FULL-2026-10-30 |
| 🛑 | FULL-pages-ForgotPassword-tsx | `pages/ForgotPassword.tsx` | 18 | 4 | 0 | Fix required | 2026-10-30 | Complete full-baseline source inventory. A more specific UTM decision overrides this broad source row. | Split into behavioural groups; add tests or replace with a narrow accepted decision backed by evidence. | FULL-2026-10-30 |
| 🛑 | FULL-pages-Home-tsx | `pages/Home.tsx` | 0 | 18 | 0 | Fix required | 2026-10-30 | Complete full-baseline source inventory. A more specific UTM decision overrides this broad source row. | Split into behavioural groups; add tests or replace with a narrow accepted decision backed by evidence. | FULL-2026-10-30 |
| 🛑 | FULL-pages-InviteTeamMembers-tsx | `pages/InviteTeamMembers.tsx` | 3 | 0 | 0 | Fix required | 2026-10-30 | Complete full-baseline source inventory. A more specific UTM decision overrides this broad source row. | Split into behavioural groups; add tests or replace with a narrow accepted decision backed by evidence. | FULL-2026-10-30 |
| 🛑 | FULL-pages-Join-tsx | `pages/Join.tsx` | 76 | 118 | 0 | Fix required | 2026-10-30 | Complete full-baseline source inventory. A more specific UTM decision overrides this broad source row. | Split into behavioural groups; add tests or replace with a narrow accepted decision backed by evidence. | FULL-2026-10-30 |
| 🛑 | FULL-pages-Kudos-tsx | `pages/Kudos.tsx` | 17 | 8 | 0 | Fix required | 2026-10-30 | Complete full-baseline source inventory. A more specific UTM decision overrides this broad source row. | Split into behavioural groups; add tests or replace with a narrow accepted decision backed by evidence. | FULL-2026-10-30 |
| 🛑 | FULL-pages-KudosStandings-tsx | `pages/KudosStandings.tsx` | 109 | 37 | 0 | Fix required | 2026-10-30 | Complete full-baseline source inventory. A more specific UTM decision overrides this broad source row. | Split into behavioural groups; add tests or replace with a narrow accepted decision backed by evidence. | FULL-2026-10-30 |
| 🛑 | FULL-pages-Login-tsx | `pages/Login.tsx` | 24 | 0 | 0 | Fix required | 2026-10-30 | Complete full-baseline source inventory. A more specific UTM decision overrides this broad source row. | Split into behavioural groups; add tests or replace with a narrow accepted decision backed by evidence. | FULL-2026-10-30 |
| 🛑 | FULL-pages-MyClubStandings-tsx | `pages/MyClubStandings.tsx` | 3 | 0 | 0 | Fix required | 2026-10-30 | Complete full-baseline source inventory. A more specific UTM decision overrides this broad source row. | Split into behavioural groups; add tests or replace with a narrow accepted decision backed by evidence. | FULL-2026-10-30 |
| 🛑 | FULL-pages-MyClubTeams-tsx | `pages/MyClubTeams.tsx` | 3 | 0 | 0 | Fix required | 2026-10-30 | Complete full-baseline source inventory. A more specific UTM decision overrides this broad source row. | Split into behavioural groups; add tests or replace with a narrow accepted decision backed by evidence. | FULL-2026-10-30 |
| 🛑 | FULL-pages-PromoteMyClub-tsx | `pages/PromoteMyClub.tsx` | 158 | 48 | 0 | Fix required | 2026-10-30 | Complete full-baseline source inventory. A more specific UTM decision overrides this broad source row. | Split into behavioural groups; add tests or replace with a narrow accepted decision backed by evidence. | FULL-2026-10-30 |
| 🛑 | FULL-pages-PromoteMyTournaments-tsx | `pages/PromoteMyTournaments.tsx` | 154 | 50 | 0 | Fix required | 2026-10-30 | Complete full-baseline source inventory. A more specific UTM decision overrides this broad source row. | Split into behavioural groups; add tests or replace with a narrow accepted decision backed by evidence. | FULL-2026-10-30 |
| 🛑 | FULL-pages-Register-tsx | `pages/Register.tsx` | 93 | 12 | 0 | Fix required | 2026-10-30 | Complete full-baseline source inventory. A more specific UTM decision overrides this broad source row. | Split into behavioural groups; add tests or replace with a narrow accepted decision backed by evidence. | FULL-2026-10-30 |
| 🛑 | FULL-service-frontend-diagnostics-FrontendDiagnostics-ts | `service/frontend-diagnostics/FrontendDiagnostics.ts` | 1 | 1 | 0 | Fix required | 2026-10-30 | Complete full-baseline source inventory. A more specific UTM decision overrides this broad source row. | Split into behavioural groups; add tests or replace with a narrow accepted decision backed by evidence. | FULL-2026-10-30 |
| 🛑 | FULL-service-frontend-diagnostics-FrontendEventQueue-ts | `service/frontend-diagnostics/FrontendEventQueue.ts` | 37 | 6 | 2 | Fix required | 2026-10-30 | Complete full-baseline source inventory. A more specific UTM decision overrides this broad source row. | Split into behavioural groups; add tests or replace with a narrow accepted decision backed by evidence. | FULL-2026-10-30 |
| 🛑 | FULL-service-league-season-processors-ActiveSeasonProcessorFactory-ts | `service/league-season-processors/ActiveSeasonProcessorFactory.ts` | 2 | 2 | 0 | Fix required | 2026-10-30 | Complete full-baseline source inventory. A more specific UTM decision overrides this broad source row. | Split into behavioural groups; add tests or replace with a narrow accepted decision backed by evidence. | FULL-2026-10-30 |
| 🛑 | FULL-service-league-season-processors-clttl-2026-CLTTLActiveSeason2026PagesParser-ts | `service/league-season-processors/clttl-2026/CLTTLActiveSeason2026PagesParser.ts` | 65 | 2 | 0 | Fix required | 2026-10-30 | Complete full-baseline source inventory. A more specific UTM decision overrides this broad source row. | Split into behavioural groups; add tests or replace with a narrow accepted decision backed by evidence. | FULL-2026-10-30 |
| 🛑 | FULL-service-league-season-processors-clttl-2026-CLTTLHttpTransport-ts | `service/league-season-processors/clttl-2026/CLTTLHttpTransport.ts` | 16 | 3 | 0 | Fix required | 2026-10-30 | Complete full-baseline source inventory. A more specific UTM decision overrides this broad source row. | Split into behavioural groups; add tests or replace with a narrow accepted decision backed by evidence. | FULL-2026-10-30 |
| 🛑 | FULL-service-league-season-processors-clttl-2026-TT365Diagnostics-ts | `service/league-season-processors/clttl-2026/TT365Diagnostics.ts` | 13 | 1 | 0 | Fix required | 2026-10-30 | Complete full-baseline source inventory. A more specific UTM decision overrides this broad source row. | Split into behavioural groups; add tests or replace with a narrow accepted decision backed by evidence. | FULL-2026-10-30 |
| 🛑 | FULL-service-league-season-processors-clttl-2026-TT365ParsingError-ts | `service/league-season-processors/clttl-2026/TT365ParsingError.ts` | 1 | 0 | 0 | Fix required | 2026-10-30 | Complete full-baseline source inventory. A more specific UTM decision overrides this broad source row. | Split into behavioural groups; add tests or replace with a narrow accepted decision backed by evidence. | FULL-2026-10-30 |
| 🛑 | FULL-service-league-season-processors-CLTTLActiveSeason2026Processor-ts | `service/league-season-processors/CLTTLActiveSeason2026Processor.ts` | 6 | 0 | 0 | Fix required | 2026-10-30 | Complete full-baseline source inventory. A more specific UTM decision overrides this broad source row. | Split into behavioural groups; add tests or replace with a narrow accepted decision backed by evidence. | FULL-2026-10-30 |
| 🛑 | FULL-service-league-season-processors-CLTTLManagedClub2026Processor-ts | `service/league-season-processors/CLTTLManagedClub2026Processor.ts` | 2 | 0 | 0 | Fix required | 2026-10-30 | Complete full-baseline source inventory. A more specific UTM decision overrides this broad source row. | Split into behavioural groups; add tests or replace with a narrow accepted decision backed by evidence. | FULL-2026-10-30 |
| 🛑 | FULL-service-league-season-processors-DummyActiveSeasonProcessor-ts | `service/league-season-processors/DummyActiveSeasonProcessor.ts` | 0 | 4 | 0 | Fix required | 2026-10-30 | Complete full-baseline source inventory. A more specific UTM decision overrides this broad source row. | Split into behavioural groups; add tests or replace with a narrow accepted decision backed by evidence. | FULL-2026-10-30 |
| 🛑 | FULL-service-league-season-processors-ManagedClubProcessorFactory-ts | `service/league-season-processors/ManagedClubProcessorFactory.ts` | 1 | 0 | 0 | Fix required | 2026-10-30 | Complete full-baseline source inventory. A more specific UTM decision overrides this broad source row. | Split into behavioural groups; add tests or replace with a narrow accepted decision backed by evidence. | FULL-2026-10-30 |
| 🛑 | FULL-utils-apiErrorUtils-ts | `utils/apiErrorUtils.ts` | 4 | 2 | 0 | Fix required | 2026-10-30 | Complete full-baseline source inventory. A more specific UTM decision overrides this broad source row. | Split into behavioural groups; add tests or replace with a narrow accepted decision backed by evidence. | FULL-2026-10-30 |
| 🛑 | FULL-utils-CacheUtils-ts | `utils/CacheUtils.ts` | 17 | 5 | 1 | Fix required | 2026-10-30 | Complete full-baseline source inventory. A more specific UTM decision overrides this broad source row. | Split into behavioural groups; add tests or replace with a narrow accepted decision backed by evidence. | FULL-2026-10-30 |
| 🛑 | FULL-utils-clubUtils-ts | `utils/clubUtils.ts` | 1 | 0 | 0 | Fix required | 2026-10-30 | Complete full-baseline source inventory. A more specific UTM decision overrides this broad source row. | Split into behavioural groups; add tests or replace with a narrow accepted decision backed by evidence. | FULL-2026-10-30 |
| 🛑 | FULL-utils-cognitoErrorUtils-ts | `utils/cognitoErrorUtils.ts` | 3 | 0 | 0 | Fix required | 2026-10-30 | Complete full-baseline source inventory. A more specific UTM decision overrides this broad source row. | Split into behavioural groups; add tests or replace with a narrow accepted decision backed by evidence. | FULL-2026-10-30 |
| 🛑 | FULL-utils-DateUtils-ts | `utils/DateUtils.ts` | 98 | 3 | 0 | Fix required | 2026-10-30 | Complete full-baseline source inventory. A more specific UTM decision overrides this broad source row. | Split into behavioural groups; add tests or replace with a narrow accepted decision backed by evidence. | FULL-2026-10-30 |
| — | FULL-BASELINE-TOTAL | Full baseline total | 1,502 | 867 | 8 | — | 2026-10-30 | The completed full report additionally has 2 `RuntimeError` findings. Every non-killed baseline item is represented by a source row above; specific UTM rows refine individual behaviour groups. | Work the source rows from highest impact/count downward, replacing conservative actions with narrow, evidenced decisions. | FULL-2026-10-30 |
### Decision states glossary

| Action status | Decision | Meaning | Next action |
| --- | --- | --- | --- |
| 🟢 | Resolved | A fix has been verified. | Record the verification command, outcome and date. |
| 🟢 | Accepted: no fix required | Evidence establishes equivalence, an unreachable supported path, or another justified non-problem. | Preserve the reason, assumptions and reevaluation triggers. |
| ⚠️ | Needs reevaluation | Relevant evidence or assumptions have changed since the decision. | Reopen investigation before relying on the previous conclusion. |
| ⚠️ | Awaiting investigation | No supported determination yet. | Inspect the exact mutation, relevant code, tests and selected run scope. |
| 🛑 | Deferred: known gap | A real issue remains, including visual coverage debt. | Keep a concrete action or linked issue; do not count it as resolved. |
| 🛑 | Fix required | A meaningful test gap, production defect or verification problem is confirmed. | Record the specific fix and priority; implement and verify it. |


Stryker statuses (`Survived`, `NoCoverage`, `Timeout`, `RuntimeError`, `CompileError`,
`Ignored`, `Pending`, `Killed`) are observations. Decision states above are review conclusions.

A survivor does not establish a production bug; an uncovered site may reflect selected-test
scope. A timeout caused by a mutation introducing an infinite loop is detected behaviour,
whereas an infrastructure timeout needs investigation. Record which case the evidence supports.

## Referenced mutation testing runs record

Paths below are relative to `TTLeaguePlayersApp.FrontEnd/`. This is a compact
**referenced-runs register**, not a detailed run-history log. Retain the latest completed full
baseline and every targeted incremental run cited by a current inventory-table row. Remove a
run only after no current row cites it. This makes a table containing a full baseline plus newer
targeted decisions traceable without pretending that a targeted run refreshed the whole suite.

Each record has a stable label. Every new or updated table row must state its supporting label in
the **Evidence run** column, for example `FULL-2026-10-30` or
`INC-2026-10-30-parser`. The determination date remains the date the reviewer made the decision;
it is not a substitute for the evidence-run timestamp.

- **FULL-2026-10-30 — Full:** Completed **2026-10-30**; the time to the minute was not
  captured for this historical baseline. At repository HEAD
  `75bcc94488023117c12f2e4a31d73e5d6c691206`. Scope: all configured frontend production files
  and Vitest unit tests. Result: 6,469 mutants — 4,090 killed, 1,502 survived, 867 no coverage,
  8 timed out and 2 runtime errors. The UTM-012 test fix was made after this baseline, so this
  record remains the pre-fix evidence. JSON: `reports/mutation/full/stryker-incremental.json`;
  HTML: `reports/mutation/full/mutation.html`.
- **INC-2026-10-30-error-names — Incremental:** Completed **2026-10-30**; the time to the
  minute was not captured for this historical targeted run. Revision: HEAD
  `781b879bf29f92197a6fcd28e0bfdea86e7c1fb4` with uncommitted mutation configuration/documentation
  changes; the two mutated source files match the source stored in the JSON. Scope:
  `PageFetcherError.ts` and `TT365ParsingError.ts`, with `TT365Diagnostics.test.ts` and
  `CLTTLHttpTransport.test.ts` (29 tests). This is a restricted setup check, not a whole-suite
  baseline. Its mutable incremental JSON/HTML were superseded by a later run; this record
  therefore preserves metadata and decision provenance, not a retrievable machine artifact.
- **INC-2026-10-30-parser — Incremental:** Completed **2026-10-30**; the time to the minute
  was not captured for this historical targeted run. Scope:
  `CLTTLActiveSeason2026PagesParser.ts`, with its covering parser unit test. Result: 334 killed,
  61 survived and 2 no-coverage mutants, with no timeout, runtime or compile errors. This is a
  restricted targeted result, not a whole-suite baseline. JSON:
  `reports/mutation/incremental/stryker-incremental.json`; HTML:
  `reports/mutation/incremental/mutation.html`. These are mutable working artifacts and are
  superseded by the next incremental run.



## How Tos for this document updates

### Accepted findings and suppression policy

An accepted decision can remain visible as `Survived` or `NoCoverage` in Stryker.
Recording acceptance here does not automatically suppress anything or change the score.
This register is the central record for both accepted findings and actual exclusions.

If an explicit Stryker exclusion is implemented, record the precise configuration/directive,
its scope, reason and corresponding register ID. Prefer a narrow, reasoned exclusion to a
file-wide ignore. A source directive can reference the register entry. Missing behavioural
tests, deferred work and uninvestigated timeouts/errors are not reasons to suppress findings.

Every accepted finding must state the conditions that make it harmless. Reevaluate when relevant
source, callers, tests, fixtures, contracts, runtime assumptions, dependencies, Stryker version
or test configuration changes. A change after the determination date is a reason to check
relevance, not proof of invalidity; unrelated edits need not reopen the decision. Use the
reason/evidence and Git history to identify relevant changes. Neither Git nor Stryker automatically
revalidates a Markdown decision or an exclusion comment.

No new Stryker exclusion has been added as part of creating this register.


### Maintaining the table

There is exactly **one** mutation inventory table: the table directly below
**Current mutation testing results and triage decisions record**. Never add a second inventory,
source-inventory, summary or continuation table elsewhere in this document. Add source-level
rows, exact mutation rows and total rows to that same table, using its existing header and
columns. Do not repeat its header or separator midway through the table.

Keep all triage information directly in that table: finding, observed status/counts, decision
state, determination date, evidence-run label, brief reason/evidence and next action. Record the
evidence-run label in the **Evidence run** column. Use `Pending` for the determination date until
investigation supports a decision. On reevaluation, update the date, run label and reason; Git
preserves the previous versions.

Identify findings precisely enough to revisit them: add the function, original expression,
replacement or mutator name to the File / finding cell as needed. Split a file-level row when
its mutations need different decisions. Link a test, report or issue in the reason/action cell
when useful. Separate detailed records and a per-finding template are not required.

Keep report provenance in the referenced-runs register and cite its label in each row. Do not
infer run dates from filesystem timestamps or treat mixed incremental results as a fresh full run.
For every future run, record the local date and time to the minute, tested revision (including
relevant uncommitted changes), source and test scope, completion status, result summary, and
machine-artifact status. The full JSON/HTML are baseline artifacts; incremental JSON/HTML are
mutable working artifacts and may be superseded. Archive a targeted artifact separately only when
its detailed machine evidence must remain inspectable after the next incremental run.

For a targeted incremental run, update only the rows for the exact mutated source files and
selected test scope. Keep the full-baseline rows for every other source unchanged. If the targeted
result changes a previously recorded finding, update that row's counts, decision, determination
date, reason and **Evidence run** label to the new incremental record. If it reveals a new,
distinct behaviour group, add or split that row in this same table. Do not update the full-baseline
total or claim that the full report has been refreshed: the current picture is the full baseline
overlaid by the explicitly referenced incremental rows.

A source-level row is an inventory and work-planning aid, not evidence that every mutation in
that source has the same conclusion. A broad `Fix required` row must state the concrete
follow-up and remains conservative until split into behaviour-level decisions. Never report
whole-report triage as complete merely because every source has an inventory row: completion
requires that every non-killed result is covered by an evidenced exact-mutation or precisely
defined behaviour-group decision, with no unreviewed remainder hidden by a broad row.

### Document update procedure: preserve this structure

1. Read the matching JSON and confirm the actual source/test scope and completion. Identify
   findings against the current code before carrying previous decisions forward. A full baseline
   plus any newer incremental results and this table provides the picture for the revisions tested;
   the table alone does not reconstruct all mutation results.
2. After a successful run, add or update its entry in **Referenced mutation testing runs record**.
   Record a stable label, local date and time to the minute, tested revision (and relevant
   uncommitted changes), scope, completion, results and artifact status. Keep the latest full
   baseline and every incremental record cited by a current row; remove an older record only when
   no row cites it. A focused run never replaces the full baseline. Leave the last completed record
   intact after an interrupted/failed attempt; do not label that attempt a completed baseline.
3. For a full run, reconcile all affected rows. For a targeted incremental run, reconcile only the
   exact mutated source/test scope reported in that run's JSON: update those rows in place and
   leave every other full-baseline row intact. Retain IDs and all existing columns, including
   **Decision state** and **Evidence run**. Add or split rows only for new findings or different
   decisions, always in the one inventory table. For statuses without a dedicated count column,
   such as `RuntimeError` or `CompileError`, state the status and exact mutation in **File /
   finding** and explain the investigation in **Reason / evidence**. Set **Evidence run** to the
   full or incremental label that resolves to the referenced-runs register. Do not alter the full
   baseline total after a targeted run, and do not present out-of-scope historical counts as freshly
   tested.
4. Set the decision and determination date only when evidence supports it. Keep `Pending` until
   then. Put a brief explanation/test reference in **Reason / evidence** and the concrete follow-up
   in **Next action**. Reopen relevant changed findings as **Needs reevaluation**; a rerun alone does
   not renew an acceptance decision. Retain resolved and accepted rows so their conclusions remain
   visible. Update the mixed-inventory total only when its underlying row counts change.
5. Before saying that a full report has been fully triaged, reconcile its JSON totals and exact
   non-killed mutant set against the table. A targeted incremental run may only support the claim
   that its selected scope was triaged; it does not revalidate the rest of the full baseline. Every
   mutant in the claimed scope must map to one evidenced decision or precisely scoped behaviour
   group; source-level rows alone do not satisfy this check. Record any remainder explicitly as
   **Awaiting investigation** or **Fix required** rather than implying completion.
6. Check that dates, run labels, counts, decisions and references agree, then run `git diff --check`.
   Keep the existing sections, decision vocabulary and one-table shape. Do not add per-finding
   templates, separate decision-record sections, additional tables, detailed run logs, repeated
   console output or redundant reports. Git preserves prior versions; generated JSON/HTML retain
   the machine results. Changes to this agreed structure require a user request.

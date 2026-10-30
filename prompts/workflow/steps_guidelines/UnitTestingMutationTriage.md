# Unit-testing mutation triage

## Document purpose and references

Version-controlled register of problems surfaced by frontend unit-test mutation testing
and findings investigated and determined not to require a fix. Update this register
alongside test or source changes. Human and AI reviewers use the same evidence requirements.

Commands and report destinations are documented in
[FrontEnd Verification Commands](../instructions/FrontEnd%20VerificationCommands.md#3-commands-to-run-frontend-mutation-tests).
This register is a decision record, not generated output or a Stryker configuration file.



## Current mutation testing results and triage decisions record

| Action status | ID | File / finding | Survived | No coverage | Timeout | Decision state | Determination date | Reason / evidence | Next action |
| --- | --- | --- | ---: | ---: | ---: | --- | --- | --- | --- |
| ⚠️ | UTM-001 | `service/frontend-diagnostics/FrontendEventQueue.ts` | 37 | 6 | 0 | Awaiting investigation | Pending | Legacy cache; not yet investigated. | Inspect queue/lifecycle behaviours and test selection; split into exact mutation groups. |
| ⚠️ | UTM-002 | `components/navigation/MainMenu.tsx` | 49 | 2 | 0 | Awaiting investigation | Pending | Legacy cache; previous UI decisions need reassessment. | Reassess current routes, role flags and display fallbacks. |
| ⚠️ | UTM-003 | `service/league-season-processors/clttl-2026/TT365Diagnostics.ts` | 14 | 1 | 0 | Awaiting investigation | Pending | Legacy cache; not yet investigated. | Determine diagnostic contracts and identify meaningful missing assertions. |
| ⚠️ | UTM-004 | `service/frontend-diagnostics/FrontendDiagnostics.ts` | 1 | 1 | 0 | Awaiting investigation | Pending | Legacy cache; not yet investigated. | Inspect initialization and diagnostic behaviour. |
| ⚠️ | UTM-005 | `service/league-season-processors/clttl-2026/CLTTLHttpTransport.ts` | 19 | 50 | 0 | Awaiting investigation | Pending | Legacy cache; test-scope coverage not established. | Check selected-test scope and transport/decompression contracts. |
| ⚠️ | UTM-006 | `utils/CacheUtils.ts` | 18 | 16 | 1 | Awaiting investigation | Pending | Legacy cache; timeout cause not established. | Inspect cache behaviours; reproduce the timeout to distinguish mutant-induced nontermination from runner slowness. |
| ⚠️ | UTM-007 | `api/frontendEventsApi.ts` | 4 | 0 | 0 | Awaiting investigation | Pending | Legacy cache; not yet investigated. | Review API contract assertions. |
| ⚠️ | UTM-008 | `service/league-season-processors/CLTTLActiveSeason2026Processor.ts` | 6 | 0 | 0 | Awaiting investigation | Pending | Legacy cache; not yet investigated. | Review current processor mutations and behavioural coverage. |
| ⚠️ | UTM-009 | `service/league-season-processors/CLTTLManagedClub2026Processor.ts` | 2 | 0 | 0 | Awaiting investigation | Pending | Legacy cache; not yet investigated. | Review managed-club processor mutations and coverage. |
| 🟢 | UTM-010 | `service/league-season-processors/clttl-2026/PageFetcherError.ts`: `this.name = 'PageFetcherError'` mutated to `""` (StringLiteral) | 0 | 0 | 0 | Resolved | 2026-10-30 | Survived with only `TT365Diagnostics.test.ts`; killed when the existing `CLTTLHttpTransport.test.ts` error-identity assertion was included. Final incremental report: 2 killed, none survived. A selected-test scope issue, not a confirmed missing test. | Retain the transport spec when verifying this class. No source change or suppression required. |
| 🛑 | UTM-011 | `service/league-season-processors/clttl-2026/TT365ParsingError.ts`: `this.name = 'TT365ParsingError'` mutated to `""` (StringLiteral) | 1 | 0 | 0 | Fix required | 2026-10-30 | Final incremental report: 2 killed, 1 survived. The diagnostic tests derive expected exception names from `error.name`, allowing the empty name to pass. A test gap in the verified two-spec scope; no production defect demonstrated. | Assert the expected parsing-error name explicitly. Rerun the relevant unit and scoped mutation checks; broader-suite coverage is not established by this smoke run. |
| — | Total | Mixed inventory; only UTM-010/011 refreshed | 151 | 76 | 1 | — | — | — | Remaining historical groups still require investigation. |

This cache contains no `RuntimeError`, `CompileError`, `Ignored` or `Pending` entries.
Their absence here does not establish that a fresh full run would contain none.
Prior session triage of the calendar/UI components is historical context, not current acceptance:
code locations and report membership have changed. Any carried-forward conclusion requires
evidence against the current code and test scope.


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

## Latest mutation testing runs record

Paths below are relative to `TTLeaguePlayersApp.FrontEnd/`. Keep only the latest completed
run of each type; these two records describe evidence freshness, not a run-history log.

- **Full:** Not run. Date and tested revision: not available. Intended scope: all configured
  frontend production files and unit tests. Completion: no complete baseline exists yet.
  Expected JSON: `reports/mutation/full/stryker-incremental.json`;
  expected HTML: `reports/mutation/full/mutation.html`. Neither artifact has been generated.
- **Incremental:** Completed **2026-10-30**. Revision: HEAD
  `781b879bf29f92197a6fcd28e0bfdea86e7c1fb4` with uncommitted mutation configuration/documentation
  changes; the two mutated source files match the source stored in the JSON. Scope:
  `PageFetcherError.ts` and `TT365ParsingError.ts`, with `TT365Diagnostics.test.ts` and
  `CLTTLHttpTransport.test.ts` (29 tests). This is a restricted setup check, not a whole-suite
  baseline. JSON: `reports/mutation/incremental/stryker-incremental.json`;
  HTML: `reports/mutation/incremental/mutation.html`.



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

Keep the triage information directly in the inventory table: finding, observed status/counts,
decision state, determination date, brief reason/evidence and next action. Use `Pending` for
the determination date until investigation supports a decision. On reevaluation, update the
date and reason; Git preserves the previous versions.

Identify findings precisely enough to revisit them: add the function, original expression,
replacement or mutator name to the File / finding cell as needed. Split a file-level row when
its mutations need different decisions. Link a test, report or issue in the reason/action cell
when useful. Separate detailed records and a per-finding template are not required.

Keep report provenance shared above the table where it applies to all rows. Do not infer run
dates from filesystem timestamps or treat mixed incremental results as a fresh full run.

### Document update procedure: preserve this structure

1. Read the matching JSON and confirm the actual source/test scope and completion. Identify
   findings against the current code before carrying previous decisions forward. A full baseline
   plus any newer incremental results and this table provides the picture for the revisions tested;
   the table alone does not reconstruct all mutation results.
2. Replace only the appropriate **Latest completed runs** record after a successful run. Include
   date, tested revision (and relevant uncommitted changes), scope, completion and artifact locations.
   A focused run updates the incremental record only. Leave the last completed record intact after
   an interrupted/failed attempt; do not label that attempt a completed baseline.
3. Update affected finding rows in place, retaining their IDs and the existing columns, including
   **Decision state**. Add or split rows only for new findings or different decisions. For statuses
   without a dedicated count column, such as `RuntimeError` or `CompileError`, state the status and
   exact mutation in **File / finding** and explain the investigation in **Reason / evidence**.
   Leave out-of-scope findings intact and do not present their historical counts as freshly tested.
4. Set the decision and determination date only when evidence supports it. Keep `Pending` until
   then. Put a brief explanation/test reference in **Reason / evidence** and the concrete follow-up
   in **Next action**. Reopen relevant changed findings as **Needs reevaluation**; a rerun alone does
   not renew an acceptance decision. Retain resolved and accepted rows so their conclusions remain
   visible. Update the mixed-inventory total only when its underlying row counts change.
5. Check that dates, counts, decisions and references agree, then run `git diff --check`.
   Keep the existing sections, decision vocabulary and table shape. Do not add per-finding templates,
   separate decision-record sections, detailed run logs, repeated console output or redundant
   reports. Git preserves prior versions; generated JSON/HTML retain the machine results. Changes
   to this agreed structure require a user request.

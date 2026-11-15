---
name: coding-task-execution
description: Execute a plan previously produced and persisted by the Coding Task Inception skill, tracking per-sub-task status and building a work summary report for human code review. Use when the user says "Coding Task Execution", or asks to start, resume or continue work on a stored plan.
allowed-tools: Bash(cat:*)
model: sonnet
effort: high
---

# Coding Task Execution

## Codex-specific model and delegation

Use **Terra 6.1**, Medium for this phase. Select the host's available Terra model; this instruction does not
itself change the running session's model. If model selection is unavailable, report the
limitation rather than claiming a switch. The frontmatter `model` is for Claude Code.
Follow [the shared orchestration rules](../shared/orchestration.md). Review work within automatic
unit mode follows the Review skill's **Sol** model instruction.

### Suggested model — at phase start

Before beginning or resuming this phase, send this one-time commentary message:

Suggested model for this phase, for you to switch: <the model and effor suggested above>.

## Session name — at the start

At skill entry, name the current chat `Execution — <existing topic>`. Remove any leading
`Discovery`, `Inception`, `Execution` or `Review` phase prefix followed by `—`, `–`, `-` or `:`
(case-insensitive), then add this skill's prefix once. Preserve the rest of the title; never stack
phase prefixes. If no topic remains, use a short topic from the user's task and refine it once clear.

- **Codex:** read the current chat title from host metadata (use `list_threads` if needed), then
  call `set_thread_title` with the new title. Omit `threadId` to rename the current chat only.
- **Claude Code:** use the current `${CLAUDE_SESSION_ID}`, not the most recently modified session.
  With the installed Claude Agent SDK, read `get_session_info(session_id, directory=project_root)`
  and take `custom_title` or `summary`; call
  `rename_session(session_id, new_title, directory=project_root)` and read back to verify.
  The TypeScript equivalents are `getSessionInfo` and `renameSession`. Do not try to execute
  `/rename` as a shell command or edit transcript files directly.

Do not rename another chat or change project membership. If the current session cannot be identified
or the required tool/SDK is unavailable, report the naming limitation briefly and continue the task;
do not install dependencies or add hooks just to rename it.


## Orchestration rules — read first

Before starting Phase 1, read the shared orchestration guidance in full. Use the
reference for your environment below; resolve the relative link against this `SKILL.md`.
Apply the phase-specific rules throughout this workflow.

```!
# Claude specific
cat ${CLAUDE_PROJECT_DIR}/.claude/skills/shared/orchestration.md
```

Read the shared orchestration guidance at [../shared/orchestration.md](../shared/orchestration.md).

Input is a confirmed plan at
`~/.claude/projects/-Users-lucaminudel-Code-TTLeaguePlayers/coding-tasks/<slug>/plan.md`.
That file is the source of truth across sessions and agents, not the in-session task list. List the
`coding-tasks/` directory to find the slug rather than guessing it: one match, use it; several, ask
the user which; none, there is no plan.

If no such plan exists, stop and say so — run `coding-task-inception` first. Do not improvise one.

### Codex-specific retrieval

In Codex, resolve the task state by inspecting `.codex/coding-tasks/` and reusing the matching
`task.md`. Read the confirmed plan from `.codex/coding-tasks/<task-slug>/plan.md`. If no matching
plan exists, stop and report that Coding Task Inception must run first.


## Phase 1 — Load and reconcile

Read [the shared continuation-record guidance](../shared/no-stop-policy-guidance.md) and the
task's `no-stop-policy.md` beside `plan.md`. Maintain it as the central record for Execution
and Review stop/handover, continuation and upfront permissions. Reconstruct a missing record
from existing evidence without repeating resolved questions. Update and check the entire record
for coherence after every related decision/correction and consult it before each continuation
or handover decision. Link its decision IDs from the plan and work summary; propagate changes
to affected active agents and nested Review. See the guidance for the required diagram, effective
decision table, attributed chronological log and coherence checks.

Read the plan in full: decision table, research findings, sub-task table, standing assumptions,
progress log.
Read `prompts/codebase_info/CodeDesignGuidelines.md` before implementing or reviewing the planned
changes.

Reconcile it against reality before doing anything:

- Sub-tasks marked `done` are **not** redone. Verify the claim cheaply (does the file exist, does
  the test run) rather than trusting the label blindly, and say what you checked.

- Sub-tasks marked `in progress` from an earlier session are the first thing to resolve. Establish
  what actually landed; after the Phase 3 gate, finish or restart that task before starting new work.

- The plan's research findings were true when written. Anything it cites — a selector, a file:line,
  a config key — is verified again the moment you rely on it.

Mirror the plan into the in-session task list if it helps you work, but the persisted file is what
you update.

**Establish where applicable e2e tests may run.** Use the planned changes to assess e2e applicability
under Phase 6. If e2e applies, ask whether the local dev DB is clean enough for it. The e2e environment
is **test** unless the user confirms that dev is clean. If e2e becomes applicable later, resolve the
environment before running it.

**Establish the baseline before changing any code — by asking, not by running.** Ask the user to
confirm a green baseline for the suites applicable to the planned changes. Use dev for C# and
Vitest and the selected e2e environment for Playwright if applicable. Reuse confirmations already
given. Do **not** run suites to establish the baseline yourself.

## Phase 2 — Order the work

Derive the execution order from the plan's *Blocked by* column. Never start a sub-task whose
blockers are not all `done`. Name the tasks that are unblocked right now before starting.
For plans with multiple deployable units, treat each unit's completion and recorded stop or
automatic-review decision as a barrier: do not dispatch later-unit work across that boundary.

**Delegate substantial investigation, implementation or independent review when it helps.** After
the Phase 3 gate, apply the [shared delegation decision and reporting rules](../shared/orchestration.md)
to work within and across ready plan rows. Reassess as completions unblock new work. Read-only
work can overlap with main-agent work within the applicable checkpoints and review rules.

**Keep verification commands serial.** The fast dev loop depends on a local
SAM and web server bound to the main working tree and a single local DynamoDB. Two agents running
`sam build` or the C# suite at once race on shared state and produce failures that look like
regressions. So:

- Delegated implementation must be unblocked, with disjoint file ownership and within the current
  unit/checkpoint barriers.
- Every lint, build and test run happens serially, on the main agent, in the main working tree.
- Subagents work **directly in the main tree**, not in worktrees. Unit commits, when authorized,
  are made by the main agent only after review and verification, never as a subagent hand-off.
- Partition by file. Two agents must never hold the same file open for writing.

Run genuine dependency chains serially. A dependency between plan rows can still leave independent
work within the currently ready row.

## Phase 3 — Resolve upfront asks before execution

**Purpose: let execution proceed autonomously, without interrupting the user for foreseeable
questions or permissions.** New findings during the work may still require an ask; anticipate what
can be resolved now rather than promising that no interruption will ever be needed.

Keep this phase after loading/reconciling the plan and ordering the work: those steps reveal the
actual dependencies, gaps and checkpoints. This phase is a required gate before starting or resuming
Phase 4, including before dispatching implementation subagents.

Read the whole plan and look ahead through implementation, checkpoints and final verification.
Identify every unresolved clarification, decision, missing fact, precondition or permission that
would otherwise cause a later ask. Reuse answers and authorizations already given.

Complete this review as one consolidated upfront pass: gather all foreseeable questions and
permissions across the whole execution, explain their consequences and dependencies, and ask them
together in a single, organized message. Do not ask one foreseeable question, wait, then discover
and ask another that could have been identified in the same pass. Persist answers and authorization
limits, resolve conflicts, and confirm the resulting sequence before starting dependent work. If no
unresolved items remain, state that the gate is satisfied and proceed without an extra confirmation
turn. During execution, interrupt again only for a genuinely new finding, an unmet precondition, a
retained stop, an exceeded limit, or authority outside the recorded scope.

- **For plans with two or more independently deployable units, settle the unit-boundary mode.**
  Present the units and ask **`EXECUTION_UNIT_BOUNDARY_MODE`: How should execution proceed at each unit boundary?**

  1. **`STOP_AND_HAND_OVER` — Stop and hand over.** Present the completed unit and verification evidence, then wait for
     the user's direction. No automatic review, fixes or commits occur at this boundary.
  2. **`AUTO_REVIEW_FIX_CONTINUE_USER_COMMITS` — Automatically review, fix and continue; you commit later.** Perform the automatic part of
     Review, fix confirmed high-priority findings, re-verify and continue without handing over.
     Leave changes uncommitted for the user to commit together later.
  3. **`AUTO_REVIEW_FIX_COMMIT_EACH_UNIT_CONTINUE` — Automatically review, fix, automatically commit each unit and continue.** Perform the same
     automatic review, fixes and verification, then make a separate local commit for each unit
     before continuing.

  For options 2 and 3, use the automatic review process described in
  [the Review skill](../coding-task-review/SKILL.md#execution-unit-review-mode), including for the
  last unit. Record confirmed high-priority findings, their fixes and verification; present them
  during the later manual part of Review together with the other findings. These records are
  informational during execution and do not require a per-unit handover. Option 2 authorizes no
  commits; option 3 authorizes scoped local unit commits only. Neither option authorizes pushing,
  deployment or unrelated changes; separately retained permission gates still apply. Record the
  explicit choice in `no-stop-policy.md`, link it from the plan and work summary, and reuse it without asking again. In each report
  of user answers, include the question code, selected answer code, descriptive label and any
  user qualifications. For example: `EXECUTION_UNIT_BOUNDARY_MODE = AUTO_REVIEW_FIX_CONTINUE_USER_COMMITS`.
  Map an unambiguous natural-language answer to its code without requiring the user to repeat it.
  These codes are stable identifiers; retain them when editing the descriptive wording. Until resolved,
  stop at unit boundaries. If an older choice did not include commits, do not infer commit
  authorization from permission to continue. Record the starting HEAD and any pre-existing
  staged or unstaged changes so unit commits and the final whole-plan review have a clear baseline.
- Present **each checkpoint separately by name/number and purpose**, with what the user would
  inspect there. Ask whether execution should **stop** there or **ignore the stop and continue**.
  Record the explicit choice for each checkpoint; an unresolved choice defaults to stopping.
  Ignoring a checkpoint waives its hand-back, not its work, evidence or verification.
- Present Tier 1-D localized mutation testing for each applicable deployable unit separately
  from final Tier 2 verification and its live Cognito effects. Tier 1-D runs automatically and
  requires no separate approval; record its unit scope and automatic continuation in
  `no-stop-policy.md`. Assess which Tier 2 checks apply under Phase 6 before discussing permission.
  Resolve applicable permission questions upfront and record each permission and its limits.
  Approval establishes permission for a run. Recheck applicability before using it.
  Forced whole-codebase mutation testing is a rare,
  optional post-commit follow-up, not a prerequisite for completing the plan.
- Resolve other foreseeable asks, including any outstanding baseline/environment questions from
  Phase 1 and permissions for planned external mutations. Keep the Cognito budget and lockout
  stopping rules; upfront approval does not remove those limits.

**Explain the consequences and sequence before asking for confirmation.** At this upfront gate,
do not ask the user to choose mode names or skip checkpoints without explaining what will happen.
For the actual plan, show a concise ordered sequence using its named units and checkpoints. Make
clear where implementation and verification happen, where execution stops for the user, when
autonomous adversarial review and high-impact fixes happen, when local commits are made, and when
the final whole-plan verification and human-driven Review take place.

Explain that stopping after a unit currently presents its outcome and evidence and waits; it does
not automatically review, fix or commit that unit. Both continuation options automatically review,
fix confirmed high-priority findings and re-verify each unit, including the last unit. Only option 3
automatically commits each unit; option 2 leaves committing to the user. Separately retained checkpoints
still stop execution. Skipping a checkpoint removes only its human hand-back, not its work or
verification. Distinguish unit boundaries from other checkpoints and resolve conflicting choices
before showing the resulting sequence. For a single-unit plan, explain that automatic unit mode
does not apply: normal final Review requires human approval of fixes and leaves committing to the
user. Do not imply unsupported combinations or promise uninterrupted execution; identify retained
approval gates and the circumstances that can still require a stop.

After the choices are assembled, present the resulting sequence and its authorization scope and
ask the user to explicitly confirm it before implementation starts. If they change a choice,
update the affected sequence and consequences before confirmation. A clear earlier confirmation
of the same sequence and scope satisfies this gate; summarize it without asking again. Persist
the confirmed sequence alongside the mode and checkpoint decisions so resumed execution follows
the same agreement.

Persist each question and answer, checkpoint choice, and approval scope in the plan and relevant
sub-task descriptions. Do not treat silence as approval. Do not skip this discussion because the
plan is detailed or already confirmed. If everything is already explicitly settled, state the
recorded answers and choices and proceed without asking again.

During execution, honour these recorded decisions. Report progress without handing back for an
already-approved action. Ask again only for a new finding, an unmet precondition, a retained stop,
an exceeded limit, or an action outside the recorded authorization.

**Keep executing until a real gate or completion.** A progress update, a completed tool call, an
implementation sub-task report, or a request to "go ahead" is not a handover. Do not end the turn
after reporting intermediate progress while authorized work remains. Continue with the next
unblocked task, verification, recorded automatic review, and approved final pipeline. If a tool
returns a running session/process, retain its identifier and poll it; do not treat yielded output
as completion. If the platform ends a turn or the user sends a message, treat it as steering or
continuation of the same execution: answer briefly when useful, then resume at the first incomplete
step without re-asking settled questions or repeating completed work. End execution only at a
recorded user handover, a genuinely unresolved authorization/precondition, or the completed Phase
10 handoff. When reporting a blocker, keep progressing on independent authorized work.

**No unrecorded stops.** The effective `no-stop-policy.md` is the sole source for planned user
handover points. Do not invent an additional stop, checkpoint, approval request, or turn-ending
handoff when the action is already covered by the plan and recorded authority. A checkpoint whose
recorded choice is to continue is not a stop. Pause only at an explicitly recorded handover, or
when a genuinely new finding creates an unmet precondition, exceeds an approved limit, materially
changes scope, or requires authority not already granted. Record the reason and affected action;
continue all independent authorized work.

## Phase 4 — Execute

Before starting each deployable unit, record its starting HEAD and existing task changes in the
plan. Preserve that baseline on resume rather than replacing it with the latest HEAD; it defines
the interim unit review scope. Keep the overall pre-execution baseline for final whole-plan Review.

For each implementation sub-task, in dependency order:

1. Set its Status to `in progress` in the persisted plan **before** starting.
2. Do the work as the sub-task describes.
3. Verify it using the applicable Tier 1 checks in Phase 6. Tier 2 is the final stage after
   Phase 4 implementation, not a per-sub-task inner-loop check.
4. Set Status to `done` and append a dated line to the plan's progress log.
5. **Replace the comments you just wrote with self-explaining code (Phase 7), then re-verify.**
6. Write its entry in the work summary report (Phase 8) and post that entry in the chat.

At each deployable-unit boundary, after its sub-tasks and applicable Tier 1 checks are complete,
apply the recorded unit-boundary mode before starting the next unit. In stop mode, present the
unit's outcome and evidence and wait. In either continuation option, read and follow the Review
skill's *Execution unit review mode* for automatic review, fixes and verification. Apply the
recorded Execution choice to committing: option 2 leaves changes uncommitted; option 3 makes a
local commit under the Git rule below. Continue when the unit has no unresolved confirmed
high-priority findings and its checks pass; option 3 also requires its commit to succeed. Apply
the selected process to the last unit too. Record high-priority findings and fixes for presentation
with all other findings during the later manual Review, without a per-unit handover.
Execution's main agent is the sole commit owner: the Review portion returns findings and green
evidence; it does not make a second commit. On resume, verify any recorded unit commit and do not
recommit an already committed unit. If no changes remain to commit, record why rather than creating
an empty commit. Additional fixes after a recorded unit commit need their own scope and evidence.
Keep Tier 2 as the final whole-plan stage; a unit review does not establish full-pipeline green
or mean the unit has actually been deployed.

A sub-task execution that cannot be finished stays `in progress`. Never mark `done` on partial
work, failing tests, or unresolved workarounds. Report the status without handing over to the user.
Stop only the stalled attempt, then diagnose, repair, retry, or use another authorized approach.
Continue independent unblocked work where available. Ask the user only when further progress
requires missing information, additional authority, or an external change you cannot make.

After implementation and the applicable Tier 1 checks, assess and run the applicable final Tier 2
checks under Phase 6, then complete the work summary and retrospective before hand-off. Leave final
verification pending while an applicable required check remains unrun or failing. Record checks
skipped as inapplicable and why.
If final verification requires repairs, verify and record them as remaining task changes for
final Review; automatic unit commits do not implicitly authorize amending earlier commits or
committing these later repairs. Resolve any desired additional commit authorization explicitly.

### Read-only commands against the live cloud and Cognito — permitted without asking

`describe-stacks`, `admin-get-user`, `list-users`, `aws dynamodb list-tables`, and the like. Run
them freely. They cost nothing and gating them behind a question buys no safety.

### Mutating or state-changing commands against the live cloud and Cognito— never without permission

What counts as mutating:

- the scripts under `scripts/cognito/tests_helpers/` — `register-test-users.sh`,
  `delete-test-users.sh`, with or without `force`;
- any `aws cognito-idp ...` invocation that creates, deletes, or changes the status or attributes
  of a user;
- **applying pending changes** to those scripts or to a Cognito template/YAML file. Editing the
  script is ordinary work; *running* it to apply the edit needs permission;
- the pipeline scripts, which are not read-only: `run_backend_acceptance_tests.sh`,
  `run_full_stack_builds_tests_pipeline.sh` and `run_smoke_tests_staging.sh` all call
  `delete-test-users.sh` in their cleanup, which deletes the dynamically created `test_*` users.

**Keep a list of every mutating command you ran, and present it at the end of the session.**

### Why this is strict

Cognito applies an automated lockout on repeated user create/delete and sign-up activity. Once
tripped it costs an hour of wall-clock time, and **every further attempt extends the wait** — so a
re-run "just to confirm" makes the outage longer. The Cognito budget in the verification tiers
exists for the same reason.


## Phase 5 — Checkpoints

Deployable-unit boundaries use the mode recorded in Phase 3. Automatic review and continuation
replaces only the hand-back at those boundaries; separately retained checkpoints, plan-drift stops
and authorization limits still apply. Resolve any conflicting checkpoint choices in Phase 3.

Apply the per-checkpoint choice recorded in Phase 3:

- **Stop**, or no explicit choice recorded: stop completely, show the checkpoint evidence and
  purpose, and wait for permission to continue. Do not start the next sub-task or unrelated work.
- **Ignore the stop and continue**: complete the checkpoint work and verification, post its evidence,
  log the recorded authorization, and continue without another ask.

Permission to implement the plan does not by itself waive every checkpoint. Present each checkpoint
and settle its choice in Phase 3; do not silently invent a waiver later.

## Phase 6 — Verify before marking done
Use Tier 1-A through 1-D for applicable unit-level verification, then Tier 2 for final shared
test-environment verification. These checks have different scope, cost and prerequisites; climb
only as far as the change requires. Tier 1-D spends time on localized mutation analysis but no
live Cognito, so the tier order is not a ranking of Cognito usage.

**Select checks from the actual diff.** At each sub-task, checkpoint and final verification, trace
the current in-scope changes to affected entry points and test assertions. Run the smallest set of
checks that covers those paths and their plausible regressions. Apply this to C#, Vitest, Playwright
and any bundled pipeline stages. Reassess the plan's proposed checks against what actually changed.
Record the affected paths, selected checks and reasons for material skips in the work summary.

**Playwright e2e requires a backend change that affects a flow the selected specs exercise.** Trace
the change through the API, Lambda or other backend entry point used by the browser scenario. For
example, a new C# parser with no route or handler calling it is covered by focused C# tests. A
frontend-only change uses relevant frontend checks. A changed backend response used by a browser
flow warrants the corresponding Playwright specs. A checkpoint, clean dev DB, or pipeline approval
does not make an unrelated suite applicable. Apply the same gate to Cognito-free and live runs,
including Playwright triggered by Tier 2. Include live Cognito only when the changed path requires
live coverage.

| Tier | Build, lint, Vitest, C# | e2e | Cognito | Gate |
|---|---|---|---|---|
| **1-A** | applicable checks on dev | affected specs on the **e2e environment** | **none** — excluded by filter / flag | fast feedback after relevant changes |
| **1-B** | relevant live C# tests on dev | affected live specs on the **e2e environment** | scoped to affected Cognito paths | counts against the budget |
| **1-C** | whole affected suite on dev | whole e2e suite only for broad e2e impact and confirmed clean dev DB | live where warranted | counts against the budget |
| **1-D** | localized deterministic mutation testing of the deployable unit's source and covering Vitest specs | none | none | automatic after relevant build/unit checks pass; no approval required |
| **2** | applicable checks on test (clean-room) | applicable specs on test | live where warranted, with cleanup for the full live pipeline | after Phase 4; ask unless already preapproved |

**Where the e2e tests run.** Every e2e test — Cognito-free or live — needs a clean DB; on a dev DB with
leftover data they fail for reasons unrelated to the change. So the **e2e environment** is the **test**
environment (web on 4173, SAM on 3003, DynamoDB on 8001) unless the user confirmed in Phase 1 that the
local dev DB is clean, in which case it is dev. Build, lint, Vitest and the C# suite always run on
**dev** for Tier 1, whatever the DB state: the Lambda unit tests use fakes, and the acceptance tests create
GUID-unique rows and tear them down. If the test-env services are not running, start them yourself —
see *Starting the services* — and stop what you started.

**Tier 1-A — the fast feedback loop, Cognito-free.** Run the applicable build, lint, Vitest or filtered
C# checks on **dev**, and any applicable Cognito-free e2e specs on the e2e environment. Get the
relevant checks green before climbing any higher.

**Tier 1-B — scoped Cognito, after 1-A is green.** Select only the individual tests that exercise
an affected path requiring live Cognito. Run C# tests on dev and applicable e2e specs on the
e2e environment.

**Tier 1-C — whole-suite local verification.** Run an affected whole suite on dev only when the
change has broad impact and the focused checks leave a concrete coverage gap. Adding the whole
Playwright suite also requires broad browser-flow impact from a backend change and a confirmed clean
dev DB. A whole backend run never automatically selects Playwright. If no broader local run is
warranted, finish the checkpoint with the applicable focused checks.

**Tier 1-D — localized deterministic mutation testing.** Limit Stryker to the current deployable
unit's relevant source files and covering Vitest specs after its build and relevant unit tests
pass. This is slower than Tier 1-A/B/C, generally faster than Tier 2, and not an every-edit check.
Use it at unit milestones and when mutation findings require targeted iteration. It may run
during implementation and before unit review/commit; it does not require Tier 2 approval or a
clean dev DB. Run automatically without asking for approval. Autonomously diagnose mutation
findings, improve tests to close observable coverage gaps, re-verify and rerun the localized
scope as needed. If closing a gap requires application-code changes affecting application
behaviour, present the concrete finding, proposed behaviour change and verification for user
approval before applying that change; continue independent test work where possible. Do not
weaken assertions or change application behaviour merely to kill a mutant. Record this boundary
in `no-stop-policy.md`. Run serially on the main agent and automatically update the triage
register after each completed run using its evidence and acceptance rules.

**Tier 2 — final shared-environment verification where applicable.** Run only after Phase 4 and
applicable Tier 1 checks. Select the standalone checks that close a concrete verification gap on
**test**. Use the full-stack pipeline only if its bundled checks are warranted, including its
Playwright stage. If it would run out-of-scope suites and there is a narrower supported check, use
that check with the applicable authorization. If Tier 1 already covers the affected paths and no
shared-environment check is warranted, record Tier 2 as inapplicable.
Ask the user before launching unless the applicable Tier 2 run was explicitly preapproved, for
example in Phase 3. Honour that approval without asking again, within its recorded scope and the
Cognito budget. Localized mutation testing is automatic Tier 1-D and requires no separate
approval; it is not coupled to this pipeline.

Before Tier 2 starts, stop any test-env services you started yourself: the pipeline reuses a SAM
already listening on 3003 instead of its own clean-room build.

Start with the relevant 1-A checks. Complete any applicable checks at higher tiers that cover a
different requirement, such as a clean-room build or an affected live service path.

### The Cognito budget

Tiers 1-B, 1-C and 2 all consume live Cognito, and Cognito rate-limits and then locks out.

**Count every Cognito-touching test run in this session — cumulatively, across all tiers and all
sub-tasks. At 10, stop and ask the user before running another.** When permission is granted the count
**resets to zero** and starts again.

- One command invocation is one unit, whether it ran one test or a hundred.
- The count is per session and never decays on its own; only a granted permission resets it.
- State the current count when you ask, so the user can see what they are approving.

- Re-running a Cognito-touching test to diagnose something **unrelated** to Cognito is the most
  expensive way to learn nothing. Read the trace, the screenshot or the `error-context.md` first.

**Prove which environment a run actually reached — never infer it from the flag you passed.** Passing
`ENVIRONMENT=staging` is an intention, not a result: the value still has to survive the config loader,
and the config decides whether the client talks to AWS or to a container on localhost. Before
reporting a result whose meaning depends on the environment, confirm it from the environment itself —
a table or user that exists in only one of them, a resource the other could not resolve. Read the raw
config rather than trusting a key name you remember; keys here are not spelled the way you would
guess (`AWS.Region`, not `AWSRegion`), and a mistyped lookup returns a confident, silent null.
"Three green staging runs" is worth nothing if they were served by local DynamoDB.

### Test fixtures write to more than the store you tear down

A test's teardown covers the rows it created. It does **not** cover whatever else the code under test
wrote on the way — and lambdas here routinely write outside their own table. Accepting an invite
updates the invitee's **Cognito** attributes; deleting the invite afterwards does not undo that.

So before writing a fixture, ask what the code under test writes *besides* the obvious store, and
whether anything else asserts on it. A fixture pointed at a shared record other suites depend on will
break them in a way that looks nothing like your change: the failure lands in an unrelated spec file,
often only on one browser project, and the diff that caused it touches neither.

**Any shared external record a test needs must be declared in the project's provisioning scripts** —
`scripts/cognito/tests_helpers/register-test-users.sh` for Cognito users — and **never** created or
reconfigured from a test, or by hand with an `aws` command. Two consequences worth knowing:

- Give the test its own record rather than borrowing one that already exists for another suite. A
  record two suites both mutate is the same trap one step further away.

- A new entry usually needs adding in more than one place. A Cognito user added to
  `register-test-users.sh` must also be added to the exclusion list in `delete-test-users.sh`,
  including the `list-users` query — otherwise the pipeline's cleanup deletes it and the next run
  fails.

### Prove the test fails, not just that it passes

A test that has never been seen red is an assertion about nothing. For each behaviour the sub-task
exists to protect, the agent must create a realistic, temporary mutation in the production code, run
the specific C#, frontend-unit, or e2e test that should detect it, then revert the mutation and
confirm the test is green again. The mutation must model a mistake a maintainer could make, not a
syntax error.

Validating tests using inferential mutations created and run by the agent is worth the minutes for the reason that it disproves as often as it confirms (tool-driven deterministic mutation testing takes longer and is slow feedback to be executed only when and where defined). Doing it here
showed that a null-guard believed to be load-bearing was in fact redundant, and that the real hazard
lay somewhere else entirely — so both the code comment and the understanding behind it were wrong
until a mutation said so. Expect that outcome sometimes, and correct the claim when it happens rather
than reaching for a second mutation that flatters the original guess.

### What to run for which change

| Sub-task touched | Run |
|---|---|
| Frontend source | **1-A frontend** — lint+build, plus the Vitest specs covering the changed files |
| Backend C# | **1-A backend** — `dotnet build` , `sam build --config-env dev`, then the filtered suite |
| `config/*.env.json` | **1-A backend** — `LoaderTest` is a Theory over dev/test/staging/prod and parses all four |
| Test or fixture only | just that suite, at the lowest tier that runs it |
| Either, once 1-A is green **and** the change touches a Cognito-dependent path | **1-B**, narrowed to the relevant tests — counts against the budget |
| Plan verification sub-task or checkpoint | Reassess affected paths and reuse current evidence. Run additional applicable checks only for gaps. |
| Final verification stage, after Phase 4 implementation and Tier 1 checks | Select applicable **Tier 2** checks and reuse approval when it covers the selected run. |

---

### Where the commands really live

The commands below are reproduced for speed, not because this file owns them. **Three places in the
repo are the source of truth. When one of them disagrees with this skill, it wins — use it, and fix
this skill.**

| Source | Owns |
|---|---|
| `prompts/workflow/instructions/*`| Verification commands and output foolders |
| `TTLeaguePlayersApp.FrontEnd/package.json` | every frontend command — build, lint, Vitest, Playwright, and which of them set `EXECUTE_LIVE_COGNITO_TESTS` |
| `.vscode/tasks.json` | `sam build` / `sam local start-api` / `sam deploy` per environment, and the labels the user knows them by |
| `scripts/ci_tasks/` | what the pipelines actually run, in what order, and **the test filters** — `--filter Cognito!=Live`, `--filter "Environment=Staging"` |

Read the relevant one before running something you have not run this session, especially after a gap
between sessions.

**`C+` on a task or npm-script name means it includes the live Cognito tests.** The convention holds in
both `package.json` and `tasks.json`, and it is the quickest way to tell what a command will cost you.
In Tier 1-A, never use a `C+` script.

**What these sources do NOT cover, and this skill therefore owns:**

- the **ad-hoc narrowing** forms — `--filter "FullyQualifiedName~<TestClass>"`, `npx vitest run <spec>`,
  `npm run "<script>" -- <spec> --reporter=list`, `npx playwright show-trace`. They are constructed per
  investigation and live in no script;
- `dotnet build TTLeaguePlayersApp.sln` — the pipeline builds only the backend **test project**, not the
  whole solution;
- **all tier and Cognito-cost semantics.** No script will tell you that a command creates Cognito users.

**Two things worth knowing rather than inheriting blindly:**

- The pipeline's SAM build is `sam build --config-env <env> --cached --build-dir "$BUILD_DIR"` — it
  writes to its **own** build directory and so does not disturb the dev `.aws-sam/build`. The dev
  command in Tier 1-A deliberately does.

- **The non-`C+` e2e scripts do not force the Cognito flag off — they inherit it.**
  `"e2e-tests-web:run dev-env"` is `cross-env PORT=5173 playwright test`, with no
  `EXECUTE_LIVE_COGNITO_TESTS` of its own. That is what lets
  `run_full_stack_builds_tests_pipeline.sh` control its e2e step by exporting the variable. The
  consequence for you: **a non-`C+` script is only Cognito-free if the ambient environment leaves the
  variable unset or false.** Never rely on the script name alone — set it explicitly in Tier 1-A.

---

### Tier 1-A — fast feedback loop, no Cognito (dev; e2e on the e2e environment)

**Working directory matters.** Frontend `npm` commands run from
`TTLeaguePlayersApp.FrontEnd/`; `sam`, `dotnet` and `./scripts/...` run from the repo root.

#### 1-A backend — for changes to backend code, the DB, or backend configuration

Fastest compile check of production code *and* tests, before anything else:

```bash
dotnet build TTLeaguePlayersApp.sln
```

Before C# tests, read and follow `prompts/workflow/instructions/BackEndVerificationCommands.md`
and inspect `.vscode/tasks.json` for the `sam-refresh-build dev-env` task. Run that task when a
task runner is available. In a shell-only environment, execute the task's configured command from
the repository root and record that the command, rather than the task runner, was used. Currently it is:

```bash
sam build --config-env dev
```

The task and its configured shell command perform the same build; report which was invoked, without
claiming a different build occurred. A successful refresh is sufficient for the running dev SAM server:
do not check its process ID or restart it routinely. Restart only as the documented recovery step if
an acceptance check shows that the refreshed code is not being served. On the documented sandbox
network or local-socket failures, follow the retry instructions in `BackEndVerificationCommands.md`.

Then the suite with the Cognito tests **excluded**:

```bash
ENVIRONMENT=dev dotnet test "TTLeaguePlayersApp.BackEnd.Tests/TTLeaguePlayersApp.BackEnd.Tests.csproj" --filter "Cognito!=Live" --configuration Debug --logger "console;verbosity=normal"
```

The `--filter Cognito!=Live` is what makes this tier free. It is the same filter the CI scripts apply
when their `COGNITO` argument is absent. A test only stays out of this run if it is correctly tagged —
see `WriteTestsGuidelines.md`, *The two xUnit traits that decide which backend tests run*.

#### 1-A frontend — for changes to frontend code or frontend config

Lint, typecheck, build (`eslint .` → `tsc -b` → `vite build`):

```bash
npm run "build-web:dev-env"
```

Vitest unit tests — never touch Cognito, so run them as freely as the build:

```bash
npm run "unit-tests-web:run"
```

A single spec, much faster while iterating on one file:

```bash
npx vitest run test/unit/<path-to-the-spec>.spec.ts
```

e2e with the live Cognito tests skipped, on the **e2e environment** — `test-env` below; use `dev-env`
only if the user confirmed the dev DB is clean. **Set the flag explicitly** — the non-`C+` script only
omits it, so it inherits whatever the shell already has, and an inherited `true` would turn this into a
Cognito run without changing a character of the command:

```bash
EXECUTE_LIVE_COGNITO_TESTS=false npm run "e2e-tests-web:run test-env"
```

Narrow it to one spec, with readable output:

```bash
EXECUTE_LIVE_COGNITO_TESTS=false npm run "e2e-tests-web:run test-env" -- test/e2e/<path-to-the-spec>.spec.ts --reporter=list
```

---

### Tier 1-B — scoped Cognito (dev; e2e on the e2e environment) · counts against the budget

Only after the matching 1-A is green. Run **individual** tests relevant to the changed files, dropping
the Cognito exclusion so the Cognito-dependent ones actually execute. Never the whole suite — that is
1-C.

**1-B backend** — narrow with `FullyQualifiedName`, and note the absence of `--filter Cognito!=Live`:

```bash
ENVIRONMENT=dev dotnet test "TTLeaguePlayersApp.BackEnd.Tests/TTLeaguePlayersApp.BackEnd.Tests.csproj" --configuration Debug --filter "FullyQualifiedName~<TestClass>" --logger "console;verbosity=normal"
```

**1-B frontend** — the `C+` script on the e2e environment (`test-env`; `dev-env` only with a confirmed
clean dev DB), narrowed to the specs the change affects. Relevant to frontend changes **and** to
backend changes that surface in the UI:

```bash
npm run "C+ e2e-tests-web:run test-env" -- test/e2e/<path-to-the-spec>.spec.ts --reporter=list
```

Each invocation is one unit of the budget. At 10, stop and ask.

---

### Tier 1-C — whole-suite local verification (dev)

These commands include live Cognito. Use them only for applicable whole suites when live coverage
is warranted, and count each invocation. A whole Playwright run also requires a confirmed clean dev
DB. For Cognito-free verification, use the exclusions shown in Tier 1-A.

Backend, whole suite, no filter:

```bash
ENVIRONMENT=dev dotnet test "TTLeaguePlayersApp.BackEnd.Tests/TTLeaguePlayersApp.BackEnd.Tests.csproj" --configuration Debug --logger "console;verbosity=normal"
```

Frontend, whole e2e suite with live Cognito:

```bash
npm run "C+ e2e-tests-web:run dev-env"
```

⚠️ The full e2e suite includes `register.spec.ts`, which **creates new Cognito users on every run**.
That is the single largest consumer of the quota, and the usual cause of a lockout.

### Where Playwright failure evidence lands

Configured in `playwright.config.ts`: `trace: 'retain-on-failure'`, `screenshot: 'only-on-failure'`,
`video: 'retain-on-failure'`. All paths are relative to `TTLeaguePlayersApp.FrontEnd/`.

| Path | What |
|---|---|
| `test-results/<spec>-<test>-<project>/test-failed-1.png` | screenshot at the moment of failure |
| `test-results/<spec>-<test>-<project>/video.webm` | video of the failing run |
| `test-results/<spec>-<test>-<project>/trace.zip` | full trace — DOM, network, console per step |
| `test-results/<spec>-<test>-<project>/error-context.md` | page snapshot at failure |
| `test-results/results.json` | machine-readable results for all tests |
| `playwright-report/index.html` | the HTML report |

A run with `--reporter=list` replaces the configured reporters and does not write `results.json`;
capture the list output in full (no `tail`) or omit the flag.

Open a trace, which is usually faster than re-running to diagnose:

```bash
npx playwright show-trace test-results/<spec-dir>/trace.zip
```

```bash
npm run "e2e-tests-web:report"
```

Read the screenshot directly when a locator assertion fails — it usually shows the reason at a
glance. Note these directories are **overwritten by each run**, so capture what you need before
re-running.

#### Inferential mutation testing — agent-created temporary mutations

For every C#, frontend-unit, or e2e test changed or created, and every input and assertion in that
test, the agent must check that it passes because the implementation is correct rather than because
it returns a false positive.

The agent does this by creating one realistic, temporary mistake in the implementation that the
named input or assertion should detect; it then runs the specific test and confirms that it fails for
the expected reason. The agent reverts the mutation and confirms the test passes again. If the test
does not fail as expected, the agent identifies the cause and fixes the test. The mutations must
exercise boundary conditions, special input values, each relevant execution path, and any other mutation the agent identifies as valuable; do not only mutate the happy path.

---

### Tier 2 — applicable shared-environment verification (test env)

Run after Phase 4 implementation and Tier 1 checks. Use the full-stack command only when each
bundled suite is applicable. Omit `COGNITO` for a Cognito-free pipeline. Use it only when the
affected paths warrant the bundled live coverage. Ask before launching unless the selected run is
explicitly preapproved. Record and reuse that approval.

```bash
./scripts/ci_tasks/run_full_stack_builds_tests_pipeline.sh COGNITO
```

VS Code task: *C+ full-stack-builds-tests-pipeline test-env*. Runs frontend lint+build, a clean-room
SAM build, the full C# suite and the e2e suite on the test environment, then cleans up the dynamically
created `test_*` Cognito users and stops its own SAM.

`COGNITO` governs all three: the Cognito user setup, the backend filter, and — via the exported
`EXECUTE_LIVE_COGNITO_TESTS` that the non-`C+` e2e script inherits — the Playwright step. So this run
does exercise the frontend live-Cognito specs, `register.spec.ts` among them. Budget for it
accordingly.

**It outruns a foreground timeout.** Launch it with Bash `run_in_background`, then arm a `Monitor`
on the output file filtering for step results and failure signatures — not raw logs:

```bash
tail -f <task-output-file> | grep -E --line-buffered "Build Succeeded|Build Failed|Test Run Successful|Test Run Failed|passed \(|failed|error TS|ALL TESTS PASSED|FAILURE"
```

For applicable standalone checks, **ask unless the selected Tier 2 run is already explicitly
preapproved**:

Backend only, on the test environment. Omit `COGNITO` to exclude live tests and their setup and
cleanup when the affected backend paths do not require them:

```bash
./scripts/ci_tasks/run_backend_acceptance_tests.sh 3003 test COGNITO
```

Playwright only, when the backend impact gate is met. Use the Tier 1-A or 1-B command for affected
specs on `test-env` with the appropriate Cognito flag. For broad impact requiring the whole suite
with live Cognito:

```bash
npm run "C+ e2e-tests-web:run test-env"
```

The full-stack and backend scripts with `COGNITO` run user cleanup. Standalone live Playwright can
create users and counts against the same budget.

### Tier 1-D — localized deterministic mutation testing commands

Mutation testing runs Vitest only, with no Playwright or live Cognito. After the deployable unit's
build and relevant unit tests pass, select its relevant `src/` files and covering specs. Tests-only
mutation-gap work may target unchanged production files whose coverage the unit is improving.
Consult `no-stop-policy.md` for unit scope and any retained application-behaviour decision gate.
Localized runs, test-gap fixes and evidence-backed triage updates are automatic and need no
approval. Changes to application code that affect application behaviour require user approval
as described above; test success alone does not authorize a product-behaviour change.

```bash
npm run "mutation-tests-web:run-file" -- --mutate src/<path-to-changed-source>.ts --testFiles test/unit/<path-to-covering-spec>.test.ts
```

Use comma-separated paths for a small set of changed source files and their covering specs. Use
`npm run "mutation-tests-web:check"` to validate Stryker discovery without mutations; reserve
`npm run "mutation-tests-web:run"` for an intentionally authorized incremental configured-suite
run. Never omit localization filters as a shortcut to running the full codebase.

For more than one file, provide comma-separated paths to `--mutate` and `--testFiles`.

### Optional post-commit forced whole-codebase mutation testing

After Tier 2, mention the forced full run as an optional follow-up the user may choose after
committing. It is rare and takes about three hours (the user's current estimate, not a timeout
or guarantee). Do not make it a completion gate, run it automatically, or commit on the user's
behalf to enable it. Record whether it is deferred, declined or authorized in `no-stop-policy.md`.
If authorized, run it after the intended commit exists and record the exact tested revision:

```bash
npm run "mutation-tests-web:full"
```

After completion, update the triage register from the full report, preserving run provenance.
Full and localized runs must remain serial because they share Stryker's temporary workspace.

#### Record every completed deterministic mutation run

After a successful deterministic mutation run, update the version-controlled
[unit-testing mutation triage register](../../../prompts/workflow/steps_guidelines/UnitTestingMutationTriage.md).
Follow its **Document update procedure** and keep its single inventory table intact.

- For a targeted incremental run, update only the rows for its exact mutated source and selected
  test scope. Add or update that incremental run in the referenced-runs register and set the
  affected rows' **Evidence run** label. Do not alter out-of-scope full-baseline rows or the full
  baseline total.
- For a completed full run, reconcile the full JSON result and refresh the full-baseline rows and
  total before claiming whole-suite triage.
- Record the run's local time to the minute, revision, scope, outcome and artifact status. The
  incremental JSON/HTML are mutable working artifacts; retain their run metadata while a current
  table row references them, and archive an artifact separately only when later detailed inspection
  is needed.

The generated artifacts are not the decision record: the triage register holds the reviewed
decision and its provenance. Targeted incremental runs write to
`TTLeaguePlayersApp.FrontEnd/reports/mutation/incremental/`; full forced runs write to
`TTLeaguePlayersApp.FrontEnd/reports/mutation/full/`.

Prioritise mutation findings in this order, in order to start fixing the highest priority failures:

1. `No coverage` or `Survived` mutants in domain logic, authorisation, date calculations, and API error handling.
2. Survived mutations that remove a condition, flip a boolean, alter a comparison boundary, or change a return value.
3. Survivors in high-risk or frequently changed code.
4. Multiple survivors on one branch or decision, where one missing behavioural scenario may kill several mutants.
5. Presentation-only, logging, or trivial adapter survivors, unless the code carries an important user-visible rule.
6. Equivalent mutants: record and accept them when the mutation cannot change observable behaviour; do not add implementation-specific tests merely to improve the score.

For each survivor or uncovered mutant, inspect the exact mutation and trace the affected expression through its callers and supported execution paths. Compare the original and mutated behavior at observable outcomes, including relevant side effects and failure handling. Check whether the mutation changes an outcome the product or code promises, and whether a test could detect that change. For an uncovered mutant, establish whether a supported scenario reaches the code; lack of coverage alone does not establish a behavior gap. If a promised outcome can change, identify the missing scenario or assertion and add a focused behavioral test. If no supported outcome changes or the path is unreachable under the current contract, record the evidence and assumptions for accepting it. For a survivor, confirm that the focused test fails with the mutation and passes with the original implementation before calling it fixed.

When fixing mutation survivors, inspect the exact Stryker mutations and group related survivors from the same source file. Try to address the group before the next localised Stryker run, then verify the exact outcomes before choosing the next batch.
Localised Stryker runs are slow, so fixing related survivors together reduces the number of runs.
Do not combine unrelated survivors just to reduce run count. Keep each run within the authorised source and test scope, and update the triage register from its evidence.

Then triage the failures and suggest what actions to take to solve the problems found (identify which tests are missing, or which gaps existing tests have, or if bugs have been found and need fixing, and so no).

##### Survivor triage: async React effects

When Stryker survivors remove effect cleanup or cancellation guards, check whether the tests reproduce
the app's mounting behavior, including StrictMode where used. Follow the
[React async-effect testing guidance](../../../prompts/workflow/steps_guidelines/WriteTestsGuidelines.md#react-async-effect-testing)
to cover discarded requests completing successfully or failing while a current request is pending.
Add the missing behavioral cases and rerun scoped Stryker to confirm those mutants are killed.
Passing normal-mount tests alone does not establish that a cancellation mutant is equivalent.
Apply this check to async lifecycle changes and relevant survivors, not every component or file move.

#### Codex-specific equivalent

In Codex, run long-lived commands through a terminal session and retain the returned session
identifier. Poll that session periodically for new output, filtering for readiness, completion, and
failure signatures. Use the terminal-session polling tools available in the current Codex
environment instead of `run_in_background` or `Monitor`.

---

### Starting the services, when they are not already up

**Dev** (web 5173, SAM 3000): normally the user already has these running; start them only if they are not.

```bash
sam local start-api --warm-containers LAZY --config-env dev --port 3000
```

```bash
npm run "run-web:dev-env"
```

**Test environment for e2e** (web 4173, SAM 3003, DynamoDB 8001). Check first:

```bash
lsof -nP -iTCP:4173 -sTCP:LISTEN; lsof -nP -iTCP:3003 -sTCP:LISTEN; lsof -nP -iTCP:8001 -sTCP:LISTEN
```

If web or SAM is missing, start it yourself, as the VS Code task `sam-start test-env` and the npm script
`run-web:test-env` do — each with Bash `run_in_background`, from the right directory:

```bash
sam build --config-env test && sam local start-api --warm-containers LAZY --config-env test --port 3003
```

```bash
npm run "run-web:test-env"
```

Then wait for SAM and **warm up the Lambda**, as `run_full_stack_builds_tests_pipeline.sh` does: SAM
answers the readiness check without invoking the Lambda, and the first invocation (which may pull or
rebuild the runtime image) can outlast the tests' timeouts:

```bash
until curl -s -o /dev/null http://127.0.0.1:3003/; do sleep 1; done; curl -s -o /dev/null --max-time 180 http://127.0.0.1:3003/clubs
```

- **Stop what you started, and only that** — when no more e2e runs are needed, and always before Tier 2
  (the pipeline would reuse your SAM instead of its clean-room build). Never stop a process the user started.
- `sam build --config-env test` rewrites the shared `.aws-sam/build`, which a running dev SAM on 3000
  also serves. Tell the user and refresh the dev build before dev checks; follow the stale-code recovery
  guidance below if the refreshed code is not being served.
- If DynamoDB on 8001 (`ttlp-dynamodb-test`, `scripts/local_dynamodb_setup/docker-compose.yml`) is not
  listening, stop and ask the user.

The static Cognito users are created **once, manually, with `force`**. The pipeline calls
`register-test-users.sh` without `force`, which is a no-op — it relies on them already existing.

**Do not run the provisioning script yourself.** It is a mutating Cognito command, and repeated
force-recreations are a direct route to the lockout. When the pool needs creating or refreshing —
because a static user was added to the script, or a test reports a missing user — **hand the commands
to the user and let them run them**:

```bash
scripts/cognito/tests_helpers/delete-test-users.sh dev force && scripts/cognito/tests_helpers/register-test-users.sh dev force
```

Afterwards, verify the result with **read-only** calls (`admin-get-user`) rather than re-running the
script: confirm the new user exists and, just as important, that the pre-existing static users survived.

#### Codex-specific equivalent

In Codex, start each long-lived service in its own terminal session and retain its session identifier.
Poll the sessions until the expected ports respond and the services report readiness. Stop the
sessions after the dependent checks finish. Use the terminal-session tools available in the current
Codex environment instead of `run_in_background` or `Monitor`.

---

### Triage before blaming the change

**Suspected stale SAM:** follow `BackEndVerificationCommands.md`. After a successful dev refresh,
do not inspect process age or routinely restart SAM. Investigate stale code only if an acceptance
check shows behavior from before the refresh. For example, the following can help diagnose an API
failure; an HTTP status alone does not prove that code is stale:

```bash
curl -s -o /dev/null -w "http=%{http_code}\n" --max-time 8 http://localhost:3000/invites/does-not-exist
```

A healthy dev API answers `400` there, not `500`. If stale code is established after refresh, restart
as a recovery step. Do not stop a user-started process without permission.

**The Cognito lockout — recognise it and STOP.** When a Cognito-touching test fails, look at the page
snapshot or the error before re-running anything. This message is the lockout:

> Too many attempts. Please wait an hour before trying again. Additional attempts will extend the wait
> time.

It is **not** a regression and no code change will fix it. **Do not re-run the test, in any tier.**
Every further attempt extends the wait — a re-run "just to confirm" makes the outage longer. Report it,
say which tier triggered it, and stop; Tier 1-C and Tier 2 will both fail for this reason alone until
the window expires. The tell-tale shape is that *only* the tests which create Cognito users fail while
everything else passes.

**Other triage rules that have paid off:**
- If every failure sits in **one test class** while other classes hitting the same local API pass,
  suspect the environment, not the change.
- **Playwright specs run in Node, which has no DOM.** Anything using `DOMParser` fails there with
  `ReferenceError: DOMParser is not defined`. The unit tests only work because `vite.config.ts`
  sets vitest's `environment: 'jsdom'`. Keep parser-level assertions in Vitest; limit e2e specs to
  fetching and asserting on raw HTML.
- **e2e specs sharing mutable records race under parallel workers.** A spec that fails in a full run
  but passes in isolation is flaky, not broken — check it against `WriteTestsGuidelines.md`. Confirm by
  re-running **that spec alone**, not the whole suite: a full re-run costs a unit of the Cognito budget
  and tells you less than the trace already on disk.
- Local DynamoDB tables, when a DataStore test misbehaves:

```bash
aws dynamodb list-tables --endpoint-url http://localhost:8000
```

Fix what you break. If verification will not go green, the sub-task is not done.

## Phase 7 — Replace the comments with self-explaining code

Runs **after** the sub-task is marked `done` and green, on **only the comments this task added or
modified** — never on comments the task did not touch.

The goal: a comment earns its place only when what it says **cannot** be said by the code. Everything
else is moved *into* the code, where it cannot drift out of date, cannot be trimmed away by a later
reader, and cannot be wrong while the code is right.

**Every change in this phase is a semantics-preserving refactoring.** Renaming, extracting a named
function or variable, extracting a private local helper, nesting or renaming tests, naming a builder
method. Nothing about behaviour changes, and the verification that was green before the phase must be
green after it, unchanged — same tests, same count, same results. If a move would alter behaviour,
the move is wrong, not the behaviour: abandon it and leave the comment.

### In implementation code

Express the intent through the code itself, by whatever means the language allows:

- the **name** of a class, method or function;
- the **name** of a parameter, and its type;
- the **name** of a variable — a well-named intermediate variable replaces a comment explaining an
  expression;
- a **private local function** extracted for no reason other than to give a block a name, with
  parameter names that say what it operates on;
- a named constant in place of a literal, an enum or union in place of a magic string, a type that
  makes the invalid state unrepresentable;
- and any other viable way the language offers.

### In test code

The same, through the vocabulary tests have:

- the **test name** — a full sentence about the behaviour, which is where the *why* belongs;
- the **nesting** of tests, and the sibling cases around one case: a rule and its boundaries read as
  a group, so the group's shape says what the single name cannot;
- the **names of the variables** in the test, and of the values in them;
- **test-data builders** and their method names, so the payload's meaning is in the call, not in a
  comment above a literal;
- **page-object** names and their method names;
- a **private local helper** in the spec, extracted to give a setup or an assertion block a name;
- and any other viable way.

### What must remain, and where

- **Keep a comment whose content is not in the code**: a decision and its *why*, a constraint from
  outside the file (a backend rule, a proxy limit, a browser behaviour, a lint rule that forced the
  shape), a warning about a trap, a dated live-source fact, a reference to a decision id.
- **Delete a comment that only restates what the code now says.**
- **Complex domain or logic an LLM cannot deduce from the code** does not belong in a comment either:
  document it in the relevant `prompts/codebase_info/*.md`, and reference that file from the code if a
  pointer is needed. Prefer extending an existing doc's section over inventing a new file.

### The three rules, stated as prohibitions

1. **Do not remove a comment whose information is not expressed in the code.**
2. **Do not leave a comment whose information can be deduced from the code.**
3. **Do not make a refactoring that changes the semantic behaviour of the code.**

### Verify, then record

Re-run the tier that covered the sub-task — at minimum Tier 1-A — and expect an **identical** result
to the one already recorded. A changed test count, a changed assertion, or a newly red test means rule
3 was broken: revert and say so.

Note in the sub-task's work-summary entry which comments were absorbed into code, which were kept and
why, and anything moved into a domain doc. A reviewer reading the diff later cannot tell a comment
that was *answered by the code* from one that was simply *deleted* — this note is the difference.

## Phase 8 — Work summary report

Maintained at
`~/.claude/projects/-Users-lucaminudel-Code-TTLeaguePlayers/coding-tasks/<slug>/work-summary.md` —
the same `<slug>` directory the plan came from — appended as each sub-task completes and **posted
in the chat at the same time** so the user can follow along rather than reading it all at the end.

One section per completed sub-task:

- **Sub-task** — number and title.
- **Files** — each path created or modified, with one line on *why* that file changed.
- **Verification** — what was run and the result, quoted rather than characterised.
- **Requirements and outcomes evidence** — retain relevant verification evidence and any limits
  needed to assess the combined index and user-provided outcomes in `plan.md` during Review.
- **Needs human review** — the honest part. Judgement calls, anything that deviates from the plan,
  assumptions baked into code, brittleness knowingly accepted, and anything a reviewer would want
  to check against the live source. Write "nothing" only when it is true.

Keep entries short. A reviewer should be able to read the whole report before opening the diff.

### Codex-specific persistence

In Codex, also append the work summary to `.codex/coding-tasks/<task-slug>/work-summary.md`, using
the same task directory as `plan.md`. Record each completed sub-task, changed files, verification
evidence, and any item requiring human review. Present the persisted file link when handing it off.



## Phase 9 — Retrospect

Retrospect (reflect on the work just completed with this coding-task-execute Skill, 
list what worked well, what did not work well, what challenges were met, and suggest improvements 
to the skill) on the **Execution workflow itself** after implementation, verification and the work
summary are settled. Assess how task tracking, implementation, tests, verification and hand-off
worked. Technical lessons from the code alone do not satisfy this retrospective. Present supported
improvements to this skill, or say explicitly that none were identified.

Ask the user specifically whether they want to add or change anything about the **Coding Task
Execution workflow**, and wait for their answer. An answer to another phase's retrospective, or a
generic earlier answer, does not count. Address the answer before closing; an explicit decision to
skip the Execution retrospective also permits closure.

Record a distinct `Execution retrospective` outcome in this task's `work-summary.md`: workflow
lessons, skill changes made (or none), and the user's Execution-specific answer or explicit skip.

## Phase 10 — Close

Before closing, check that `work-summary.md` contains the distinct Execution retrospective
outcome from Phase 9, including the user's Execution-specific answer or explicit skip. Complete
Phase 9 if it is missing; another phase's retrospective cannot fill this gate.

**Tell the user** — you cannot run this yourself; `/compact` is a command they type:

> Execution is complete. The plan's progress log and the work summary at `<path>` are up to date.
> Before starting the Review you may want to compact this session:
> `/compact keep all the relevant info emerged during the execution before moving to the Review`

Say also that compacting is optional and the hand-off does not depend on it: the plan and the work
summary are on disk, and those files — not this conversation — are what `coding-task-review` reads.
In automatic unit mode, after the required Execution retrospective is settled or explicitly
skipped, continue into the final Review under the recorded sequence without asking again to start
it. That Review reconciles unit commits and remaining changes and includes the human-driven
decisions and review guide. In other modes, hand off to the user to start Review.


## Standing rules

**Git.** Stay on the current branch. Leave staging and committing to the user unless option 3
(automatically commit each unit) was explicitly selected. Only in option 3, after each unit's adversarial review, high-impact
fixes and applicable checks pass, stage only that unit's changes and make a local commit with a
message describing its outcome. Inspect the staged patch before committing and confirm the
resulting commit contains only the intended changes. Preserve unrelated staged and unstaged work;
use selective staging or an isolated index where needed, and stop if ownership cannot be safely
separated. Never use blanket staging, include unrelated pre-existing work, bypass failing hooks,
push, amend earlier commits, or rewrite history. Record each commit hash, unit and verification
evidence in the plan and work summary. A failed commit blocks continuation; report its cause.
Never stash, revert, or clean the user's pre-existing uncommitted changes.

**Plan drift.** Resolve ordinary implementation discoveries autonomously within the approved
outcome and existing authority. Examples include repairing tests, correcting selectors, reconciling
reports, and adjusting implementation details or dependencies without materially changing the
agreed scope, blast radius, impact, delivery boundary or contracts. Verify the adjustment, record
the reason and evidence in the plan's progress log, and continue; an informational update does
not require a hand-back.

Stop and ask only when the required adjustment materially changes one of those dimensions or
requires authority the user has not already granted. Present the concrete finding, affected
behaviour and consequences, and the available options. Reuse applicable decisions and approvals
already given in the conversation or plan; do not ask again for the same authorized adjustment.
Record the user's resolution before starting work that depends on the new decision or authority.

**Scope.** The plan defines the work. Do not widen it, do not fold in unrelated cleanups noticed in
passing, and do not narrow it because a step looks awkward.

## Anti-patterns

- Treating technical lessons, another phase's retrospective, or an earlier generic answer as the
  Execution retrospective; closing without its distinct outcome in `work-summary.md`.

- Skipping the Phase 3 upfront-asks gate before starting or resuming implementation or dispatching
  implementation subagents; a confirmed plan does not replace that gate.
- Failing to present each checkpoint and its purpose in Phase 3 and ask whether to stop or continue,
  unless that explicit choice is already recorded.
- Deferring a foreseeable question or permission request until execution when it could have been
  settled in Phase 3, or treating silence as authorization.
- Running Tier 2 before Phase 4 implementation and Tier 1 checks are complete, or launching Tier 2
  without an applicable recorded approval.

- Redoing a sub-task already marked `done`, or starting one whose blockers are not.
- Marking `done` with failing or unrun verification.
- Running builds or tests in parallel, or from a worktree, against the shared local dev services.
- Continuing past a checkpoint whose recorded choice is to stop, or asking again at a checkpoint
  explicitly approved for continuation in Phase 3.
- Committing outside the authorized automatic unit mode, branching, or tidying the working tree.
- Batching the work summary to the end instead of reporting per sub-task.
- Adapting the plan quietly when it turns out to be wrong.
- Handing back a question, blocker or checkpoint without the context, cause and options the user
  needs to answer it.
- Reporting which environment a test run reached from the flag passed to it rather than from evidence.
- Running a mutating Cognito command — the provisioning scripts, an `aws cognito-idp` write, applying a
  pending change to either — without asking first.
- Climbing to Tier 1-C or Tier 2 or reaching for them when 1-A would have answered the question.
- Running Playwright without tracing a changed backend path to an affected browser flow, or running
  unrelated suites because they are listed in the plan or bundled into a pipeline.
- Running localized mutation testing outside its authorized unit scope or before relevant build/unit checks pass.
- Starting a forced whole-codebase mutation run without applicable authorization or before its intended commit.
- Re-running a Cognito-touching test to diagnose something unrelated to Cognito, instead of reading the
  trace, screenshot or `error-context.md` already on disk.
- Losing count of the Cognito budget, or continuing past 10 without asking.
- Re-running anything after the "Too many attempts" lockout message, which extends the wait.
- Running e2e tests on dev without the user's confirmation that the dev DB is clean.
- Leaving test-env services you started running, or stopping ones the user started.
- Starting work without a confirmed green baseline for applicable suites — or establishing one by running the suites yourself
  rather than asking the user.
- Creating or reconfiguring a shared test record — a Cognito user above all — from a test or by hand,
  instead of declaring it in the provisioning scripts.
- Marking a behaviour verified by a test that has never been observed failing.
- Skipping the comment refactoring (Phase 7), or doing it *before* the sub-task is green — it is a
  refactoring of working code, not a way of writing it.
- Touching comments the task did not add or modify during Phase 7.
- Deleting a comment in Phase 7 whose information is nowhere in the code, or keeping one whose
  information the code now states.
- Letting Phase 7 change behaviour: a different test count, a changed assertion or a newly red test
  means the refactoring was not semantics-preserving. Revert it and say so.
- Leaving a domain rule an LLM cannot deduce from the code in a comment, instead of documenting it in
  `prompts/codebase_info/*.md`.
- Asking again for permission already granted. 

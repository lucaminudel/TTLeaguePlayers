---
name: coding-task-execution
description: Execute a plan previously produced and persisted by the Coding Task Inception skill, tracking per-sub-task status and building a work summary report for human code review. Use when the user says "Coding Task Execution", or asks to start, resume or continue work on a stored plan.
allowed-tools: Bash(cat:*)
model: sonnet
effort: high
---

# Coding Task Execution

## Codex-specific model and delegation

Use **Terra 5.6**, Medium for this phase. Select the host's available Terra model; this instruction does not
itself change the running session's model. If model selection is unavailable, report the
limitation rather than claiming a switch. The frontmatter `model` is for Claude Code.
Use sub-agents for work that can proceed in parallel. **Delegate every exploration, and dispatch
parallel-ready implementation sub-tasks to sub-agents whenever dependencies, disjoint file
ownership and the current unit/checkpoint barriers allow.** Follow
[the shared orchestration rules](../shared/orchestration.md); keep verification, approvals,
integration and commits serial on the main agent. Review work within automatic unit mode follows
the Review skill's **Sol** model instruction.

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

**Establish where the e2e tests may run — by asking.** Every e2e test, Cognito-free or live, needs a
clean DB, and the local dev DynamoDB is where manual use leaves data behind. Ask the user whether the
local dev DB is clean enough to run e2e tests on dev. The answer fixes the **e2e environment** for the
whole execution (see *Where the e2e tests run* in Phase 6): **test** unless the user confirms the dev
DB is clean.

**Establish the baseline before changing any code — by asking, not by running.** Ask the user to
confirm that all three suites are currently passing: C# and Vitest unit on the local dev environment,
Playwright e2e on the e2e environment. Do **not** run them yourself to find out: the e2e suite spends live Cognito, which is the
scarce resource this skill exists to protect (see *The Cognito budget*). Without a confirmed baseline
you cannot tell your own regressions from failures that were already there — which is the whole
purpose of asking.

## Phase 2 — Order the work

Derive the execution order from the plan's *Blocked by* column. Never start a sub-task whose
blockers are not all `done`. Name the tasks that are unblocked right now before starting.
After the Phase 3 gate is satisfied, at every ready set dispatch independent sub-tasks to
implementation sub-agents; do not execute a parallel-ready group entirely in the main agent.
Reassess when completions unblock new tasks.
Delegate each exploration to a read-only sub-agent, even when there is only one exploration.
For plans with multiple deployable units, treat each unit's completion and recorded stop or
automatic-review decision as a barrier: do not dispatch later-unit work across that boundary.

**Parallelism is for writing code, never for verifying it.** The fast dev loop depends on a local
SAM and web server bound to the main working tree and a single local DynamoDB. Two agents running
`sam build` or the C# suite at once race on shared state and produce failures that look like
regressions. So:

- Subagents must draft code for parallel-ready sub-tasks that are unblocked *and* whose file sets
  are disjoint, within available capacity and the current unit/checkpoint barriers.
- Every lint, build and test run happens serially, on the main agent, in the main working tree.
- Subagents work **directly in the main tree**, not in worktrees. Unit commits, when authorized,
  are made by the main agent only after review and verification, never as a subagent hand-off.
- Partition by file. Two agents must never hold the same file open for writing.

Where the graph is a chain, say so and run it serially rather than manufacturing parallelism.

## Phase 3 — Resolve upfront asks before execution

**Purpose: let execution proceed autonomously, without interrupting the user for foreseeable
questions or permissions.** New findings during the work may still require an ask; anticipate what
can be resolved now rather than promising that no interruption will ever be needed.

Keep this phase after loading/reconciling the plan and ordering the work: those steps reveal the
actual dependencies, gaps and checkpoints. This phase is a required gate before starting or resuming
Phase 4, including before dispatching implementation subagents.

Read the whole plan and look ahead through implementation, checkpoints and final verification.
Identify every unresolved clarification, decision, missing fact, precondition or permission that
would otherwise cause a later ask. Reuse answers and authorizations already given; ask for
what remains unresolved, then wait for the answers before starting dependent work.

- **For plans with two or more independently deployable units, settle the unit-boundary mode.**
  Present the units and ask whether the user wants to **stop after each completed unit** or
  **automatically review, commit locally and continue**: after each unit, run the autonomous adversarial review
  described in [the Review skill](../coding-task-review/SKILL.md#execution-unit-review-mode),
  fix verified high-impact findings, re-verify, commit that unit locally, then continue to the next unit, leaving the
  human-driven part of Review until the whole plan is implemented and verified. Record the
  explicit choice in the plan and work summary; reuse an existing choice without asking again.
  Until resolved, stop at unit boundaries. Choosing automatic mode authorizes the scoped
  high-impact fixes, local unit commits and continuation at these boundaries, not pushing,
  deployment or unrelated changes. If an older recorded choice did not include commits, resolve
  that added authorization before committing. Record the starting HEAD and any pre-existing
  staged or unstaged changes so unit commits and the final whole-plan review have a clear baseline.
- Present **each checkpoint separately by name/number and purpose**, with what the user would
  inspect there. Ask whether execution should **stop** there or **ignore the stop and continue**.
  Record the explicit choice for each checkpoint; an unresolved choice defaults to stopping.
  Ignoring a checkpoint waives its hand-back, not its work, evidence or verification.
- Present the planned Tier 2 verification after Phase 4, including its environment, live Cognito
  effects and deterministic mutation-testing scope/cost. Ask whether to preapprove Tier 2 and
  deterministic mutation testing now or leave either approval until that final stage. Record
  exactly what was approved; pipeline approval alone does not imply mutation-testing approval.
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
not automatically review, fix or commit that unit. Automatic mode reviews, fixes, re-verifies and
commits each unit before continuing, including the last unit; separately retained checkpoints
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
unit's outcome and evidence and wait. In automatic mode, read and follow the Review skill's
*Execution unit review mode*, record its findings, fixes and verification, then make a local commit
of that unit under the Git rule below. Continue only when the unit has no unresolved high-impact
findings, the checks pass and its commit succeeds. Review and commit the last unit too.
Execution's main agent is the sole commit owner: the Review portion returns findings and green
evidence; it does not make a second commit. On resume, verify any recorded unit commit and do not
recommit an already committed unit. If no changes remain to commit, record why rather than creating
an empty commit. Additional fixes after a recorded unit commit need their own scope and evidence.
Keep Tier 2 as the final whole-plan stage; a unit review does not establish full-pipeline green
or mean the unit has actually been deployed.

A sub-task that cannot be finished stays `in progress`. Never mark `done` on partial work, failing
tests, or anything you worked around rather than solved — report it and stop.

After all Phase 4 implementation work and its Tier 1 checks are complete, perform the final Tier 2
stage defined in Phase 6, then complete the work summary and retrospective before hand-off. If the plan includes a final
verification sub-task, leave it pending until this stage passes; do not mark the overall execution
complete before required Tier 2 checks and approved deterministic mutation testing are complete.
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
Four tiers, ordered by how much **live Cognito** they spend. They are **not** interchangeable, and the
ordering is the point: you climb it only as far as the change requires.

| Tier | Build, lint, Vitest, C# | e2e | Cognito | Gate |
|---|---|---|---|---|
| **1-A** | dev | the **e2e environment** | **none** — excluded by filter / flag | run freely, constantly |
| **1-B** | dev | the **e2e environment** | scoped — only the individual tests relevant to the changed files | counts against the budget |
| **1-C** | dev | dev — **exists only if the user confirmed the dev DB is clean** | **full** — whole backend suite + whole e2e suite with live Cognito | counts against the budget; no separate ask |
| **2** | test (clean-room) | test | **full**, plus Cognito user cleanup | after Phase 4; ask unless already preapproved |

**Where the e2e tests run.** Every e2e test — Cognito-free or live — needs a clean DB; on a dev DB with
leftover data they fail for reasons unrelated to the change. So the **e2e environment** is the **test**
environment (web on 4173, SAM on 3003, DynamoDB on 8001) unless the user confirmed in Phase 1 that the
local dev DB is clean, in which case it is dev. Build, lint, Vitest and the C# suite always run on
**dev**, whatever the DB state: the Lambda unit tests use fakes, and the acceptance tests create
GUID-unique rows and tear them down. If the test-env services are not running, start them yourself —
see *Starting the services* — and stop what you started.

**Tier 1-A — the fast feedback loop, Cognito-free.** Build, lint, Vitest and the filtered C# suite on
**dev**; Cognito-free e2e on the e2e environment. Seconds to a couple of minutes. **This is the loop you
live in.** Run it after every change, and get it green before climbing any higher.

**Tier 1-B — scoped Cognito, after 1-A is green.** Only the *individual* tests that cover the files the
sub-task touched, run without the Cognito exclusion so the Cognito-dependent ones actually execute:
C# test classes on dev, e2e specs on the e2e environment.

**Tier 1-C — the fast local full run, only with a clean dev DB.** Everything, on dev, with live
Cognito. It exists **only if the user confirmed the dev DB is clean**: on the test environment the same
run would be Tier 2 without the clean-room build, so it adds a Cognito-heavy run and tells you almost
nothing new. Like Tier 1-B, count each invocation against the Cognito budget; no separate
permission is required within that budget. When it exists, run it at relevant checkpoints or
after long changes that also affect the frontend, before the final Tier 2 — it runs faster locally,
and Playwright screenshots, traces and videos land locally.

Without a clean dev DB there is no 1-C: checkpoints and "application code finished" gates use 1-B, and
the whole e2e suite runs only in Tier 2.

**Tier 2 — the complete verification.** On the **test** environment, with live Cognito and a clean-room
build. Minutes. **Run only after Phase 4 implementation and its Tier 1 checks are complete.**
Ask the user before launching unless the applicable Tier 2 run was explicitly preapproved, for
example in Phase 3. Honour that approval without asking again, within its recorded scope and the
Cognito budget. Deterministic mutation testing belongs only in this Tier 2 stage and needs its own
explicit approval, which may also be recorded in Phase 3.

Before Tier 2 starts, stop any test-env services you started yourself: the pipeline reuses a SAM
already listening on 3003 instead of its own clean-room build.

Never substitute a higher tier for the 1-A loop (too slow, and it burns Cognito to tell you something
a lint error would have). Never let 1-A stand in for Tier 2 (no live Cognito, no
clean-room build, not the whole suite in one run).

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
| Gate: plan verification sub-tasks, and **every checkpoint** | **1-C** front and back if the dev DB is clean; otherwise **1-B** — both count against the budget |
| Application code finished, before writing its tests | same as the row above — establish the green baseline |
| Final verification stage, after Phase 4 implementation and Tier 1 checks | **Tier 2** — ask unless explicitly preapproved |

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

Then refresh the local SAM so it serves the new code. **Mandatory before the C# tests**, and if
`sam local start-api` predates the build, restart it too (see *Triage*):

```bash
sam build --config-env dev
```

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

### Tier 1-C — full local verification with live Cognito (dev, clean dev DB only) · counts against the budget

Only if the user confirmed the dev DB is clean. This local full run provides local artefacts;
it does not replace Tier 2. Like Tier 1-B, each invocation counts against the Cognito budget,
with no separate ask within that budget.

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

### Tier 2 — complete verification (test env, live Cognito)

Run after Phase 4 implementation and Tier 1 checks. Ask before launching unless this run is
explicitly preapproved; record and reuse that approval.

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

When the whole pipeline is more than you need, either half can be run alone — **ask unless that run is already explicitly preapproved**:

Backend only, on the test environment, no filter:

```bash
./scripts/ci_tasks/run_backend_acceptance_tests.sh 3003 test COGNITO
```

Frontend e2e only, whole suite with live Cognito:

```bash
npm run "C+ e2e-tests-web:run test-env"
```

All three of these mutate Cognito: their cleanup deletes the dynamically created `test_*` users.

#### Deterministic mutation testing — Tier 2 only, after user confirmation

Run deterministic mutation testing only in the final Tier 2 stage, after Phase 4 implementation
and Tier 1 checks are complete. Ask for explicit confirmation unless deterministic mutation testing
was already explicitly preapproved with its scope, for example in Phase 3. Do not ask again for the
same approved run. It is time-consuming and must not run as an ordinary inner-loop check or before
Tier 2. Tier 2 pipeline approval alone does not approve deterministic mutation testing.

Mutation testing runs the Vitest unit tests; do not use Playwright or live Cognito for it. Once the
user has confirmed Tier 2 and the build and relevant Vitest specs are green, select only the changed
`src/` production file(s) and their covering unit spec(s).

```bash
npm run "mutation-tests-web:run-file" -- --mutate src/<path-to-changed-source>.ts --testFiles test/unit/<path-to-covering-spec>.test.ts
```

Use comma-separated paths for a small set of changed source files and their covering specs. Use
`npm run "mutation-tests-web:check"` to validate Stryker discovery without mutations; reserve
`npm run "mutation-tests-web:run"` for an incremental configured-suite run and
`npm run "mutation-tests-web:run-file"` without filters for an intentional, forced full run.

For more than one file, provide comma-separated paths to `--mutate` and `--testFiles`.

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
  also serves. Tell the user; their dev SAM may need restarting after a `sam build --config-env dev`.
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

**Stale SAM is the most common false failure.** `sam build` only rewrites `.aws-sam/build`; a
`sam local start-api` started *before* that build keeps serving warm containers from the replaced
artifacts, producing HTTP 500s where a 2xx or 4xx was expected. Check whether the server predates
the build, and restart it if so:

```bash
ps -eo pid,lstart,command | grep "sam local" | grep -v grep
```

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
```

```bash
curl -s -o /dev/null -w "http=%{http_code}\n" --max-time 8 http://localhost:3000/invites/does-not-exist
```

A healthy dev API answers `400` there, not `500`. Restarting `sam local start-api` is the user's
process — ask before killing it.

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

**Git.** Stay on the current branch. Outside the explicitly selected automatic unit mode, leave
staging and committing to the user. In that mode, after each unit's adversarial review, high-impact
fixes and applicable checks pass, stage only that unit's changes and make a local commit with a
message describing its outcome. Inspect the staged patch before committing and confirm the
resulting commit contains only the intended changes. Preserve unrelated staged and unstaged work;
use selective staging or an isolated index where needed, and stop if ownership cannot be safely
separated. Never use blanket staging, include unrelated pre-existing work, bypass failing hooks,
push, amend earlier commits, or rewrite history. Record each commit hash, unit and verification
evidence in the plan and work summary. A failed commit blocks continuation; report its cause.
Never stash, revert, or clean the user's pre-existing uncommitted changes.

**Plan drift.** If anything contradicts the plan — a selector that does not match, a design that
proves unworkable, a dependency that was missed — **stop and ask, always**. Report the finding and
the options; do not silently redesign, and do not silently comply with
a plan you now know to be wrong. Record the resolution in the plan's progress log before resuming.

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
- Running deterministic mutation testing outside Tier 2 or without user confirmation.
- Re-running a Cognito-touching test to diagnose something unrelated to Cognito, instead of reading the
  trace, screenshot or `error-context.md` already on disk.
- Losing count of the Cognito budget, or continuing past 10 without asking.
- Re-running anything after the "Too many attempts" lockout message, which extends the wait.
- Running e2e tests on dev without the user's confirmation that the dev DB is clean.
- Leaving test-env services you started running, or stopping ones the user started.
- Starting work without a confirmed green baseline — or establishing one by running the suites yourself
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

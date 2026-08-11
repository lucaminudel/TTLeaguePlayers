---
name: coding-task-execution
description: Execute a plan previously produced and persisted by the Coding Task Inception skill, tracking per-sub-task status and building a work summary report for human code review. Use when the user says "Coding Task Execution", or asks to start, resume or continue work on a stored plan.
allowed-tools: Bash(cat:*)
model: sonnet
effort: high
---

# Coding Task Execution

Input is a confirmed plan at
`~/.claude/projects/-Users-lucaminudel-Code-TTLeaguePlayers/coding-tasks/<slug>/plan.md`.
That file is the source of truth across sessions and agents, not the in-session task list. List the
`coding-tasks/` directory to find the slug rather than guessing it: one match, use it; several, ask
the user which; none, there is no plan.

If no such plan exists, stop and say so — run `coding-task-inception` first. Do not improvise one.

---
```!
cat ${CLAUDE_PROJECT_DIR}/.claude/skills/shared/interaction-protocol.md
```

---

## Phase 1 — Load and reconcile

Read the plan in full: decision table, research findings, sub-task table, standing assumptions,
progress log.

Reconcile it against reality before doing anything:

- Sub-tasks marked `done` are **not** redone. Verify the claim cheaply (does the file exist, does
  the test run) rather than trusting the label blindly, and say what you checked.

- Sub-tasks marked `in progress` from an earlier session are the first thing to resolve. Establish
  what actually landed, finish or restart that one task, and do not start anything new until it is
  settled.

- The plan's research findings were true when written. Anything it cites — a selector, a file:line,
  a config key — is verified again the moment you rely on it.

Mirror the plan into the in-session task list if it helps you work, but the persisted file is what
you update.

**Establish the baseline before changing any code — by asking, not by running.** Ask the user to
confirm that all three suites (C#, Vitest unit, Playwright e2e) are currently passing on the local dev
environment. Do **not** run them yourself to find out: the e2e suite spends live Cognito, which is the
scarce resource this skill exists to protect (see *The Cognito budget*). Without a confirmed baseline
you cannot tell your own regressions from failures that were already there — which is the whole
purpose of asking.

That is **one ask covering all three suites**, and it is the only thing in that message. The
reconciliation report above — what you verified, what is `in progress`, what you re-checked — is a
report and goes in its own earlier message with no question attached.

IMPORTANT!: Apply to every hand-over message to the user the 'One Ask Per Message Rule', 'the One Point Per Message Rule', and the 'Presenting Rule for the One Ask and the One Topic you do send'.

## Phase 2 — Order the work

Derive the execution order from the plan's *Blocked by* column. Never start a sub-task whose
blockers are not all `done`. Name the tasks that are unblocked right now before starting.

**Parallelism is for writing code, never for verifying it.** The fast dev loop depends on a local
SAM and web server bound to the main working tree and a single local DynamoDB. Two agents running
`sam build` or the C# suite at once race on shared state and produce failures that look like
regressions. So:

- Subagents may draft code for sub-tasks that are unblocked *and* whose file sets are disjoint.
- Every lint, build and test run happens serially, on the main agent, in the main working tree.
- Subagents work **directly in the main tree**, not in worktrees. With no commits being made (see
  Standing rules), a worktree has no clean way to hand changes back.
- Partition by file. Two agents must never hold the same file open for writing.

Where the graph is a chain, say so and run it serially rather than manufacturing parallelism.

IMPORTANT!: Apply to every hand-over message to the user the 'One Ask Per Message Rule', 'the One Point Per Message Rule', and the 'Presenting Rule for the One Ask and the One Topic you do send'.

## Phase 3 — Execute

For each sub-task, in order:

1. Set its Status to `in progress` in the persisted plan **before** starting.
2. Do the work as the sub-task describes.
3. Verify it (Phase 5).
4. Set Status to `done` and append a dated line to the plan's progress log.
5. Write its entry in the work summary report (Phase 6) and post that entry in the chat — as a
   report, with **no question appended**, not even "shall I move on to sub-task 4?". Moving on to
   the next unblocked sub-task needs no permission; a checkpoint (Phase 4) is its own message.

A sub-task that cannot be finished stays `in progress`. Never mark `done` on partial work, failing
tests, or anything you worked around rather than solved — report it and stop. If stopping raises a
question, that question is its own message, sent after the report.

IMPORTANT!: Apply to every hand-over message to the user the 'One Ask Per Message Rule', 'the One Point Per Message Rule', and the 'Presenting Rule for the One Ask and the One Topic you do send'.

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


## Phase 4 — Checkpoints

When the plan contains a review checkpoint, **stop completely** and hand back. Show what the
checkpoint task says to show, framed as the *Presenting Rule for the One Ask and the One Topic you
do send* describes, and wait for explicit permission to continue. Do not start the next sub-task, do not "get a head start" on
unrelated ones.

**The checkpoint's ask is "may I continue?", and nothing else rides with it.** Not a question about
a design choice you made along the way, not permission for the next Tier 1-C run, not a second
decision the user could "answer at the same time". Those each get their own message afterwards — and
if one of them must be settled *before* continuing, ask it first, on its own, and hold the
checkpoint question until it is resolved.

IMPORTANT!: Apply to every hand-over message to the user the 'One Ask Per Message Rule', 'the One Point Per Message Rule', and the 'Presenting Rule for the One Ask and the One Topic you do send'.

## Phase 5 — Verify before marking done
Four tiers, ordered by how much **live Cognito** they spend. They are **not** interchangeable, and the
ordering is the point: you climb it only as far as the change requires.

| Tier | Environment | Cognito | Gate |
|---|---|---|---|
| **1-A** | dev | **none** — excluded by filter | run freely, constantly |
| **1-B** | dev | scoped — only the individual tests relevant to the changed files | counts against the budget |
| **1-C** | dev | **full** — whole backend suite + whole e2e suite with live Cognito | **ask first** |
| **2** | test | **full**, plus Cognito user cleanup | **ask first** |

**Tier 1-A — the fast feedback loop, Cognito-free.** Runs on **dev**, reusing the local web server and
SAM already started. Seconds to a couple of minutes. **This is the loop you live in.** Run it after
every change, and get it green before climbing any higher.

**Tier 1-B — scoped Cognito, after 1-A is green.** Only the *individual* tests that cover the files the
sub-task touched, run without the Cognito exclusion so the Cognito-dependent ones actually execute.
Still on dev.

**Tier 1-C — the fast pre-final verification.** Everything, on dev, with live Cognito. Effectively a
faster Tier 2 with richer local logs and artefacts. **Confirm with the user before launching.** Run it:

- at a plan checkpoint;
- after the application code is finished and **before** starting on its tests, so the baseline is green
  and only the new tests can be red;
- after finishing a sub-task, before the complete verification on the test environment;
- to collect evidence a pipeline run cannot give you — Playwright screenshots, traces and videos land
  locally on a dev run but not from inside the pipeline.

**Tier 2 — the complete verification.** On the **test** environment, with live Cognito and a clean-room
build. Minutes. **Confirm with the user before launching.**

Never substitute a higher tier for the 1-A loop (too slow, and it burns Cognito to tell you something
a lint error would have). Never let 1-A stand in for Tier 2 (different environment, no live Cognito,
no clean-room build).

IMPORTANT!: Apply to every hand-over message to the user the 'One Ask Per Message Rule', 'the One Point Per Message Rule', and the 'Presenting Rule for the One Ask and the One Topic you do send'.

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
exists to protect, break the production code deliberately, watch that specific test fail, then revert
and confirm green. Keep the mutation realistic — the mistake a maintainer would actually make, not a
syntax error.

This is worth the minutes for the reason that it disproves as often as it confirms. Doing it here
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
| Gate: plan verification sub-tasks, and **every checkpoint** | **1-C**, front and back — **ask first** |
| Application code finished, before writing its tests | **1-C** — establish the green baseline — **ask first** |
| Plan's final sub-task | **Tier 2** — **ask first** |

---

### Where the commands really live

The commands below are reproduced for speed, not because this file owns them. **Three places in the
repo are the source of truth. When one of them disagrees with this skill, it wins — use it, and fix
this skill.**

| Source | Owns |
|---|---|
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

### Tier 1-A — fast feedback loop, no Cognito (dev)

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

Lint, typecheck, build (`copy-config` → `eslint .` → `tsc -b` → `vite build`):

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

e2e with the live Cognito tests skipped. **Set the flag explicitly** — the non-`C+` script only omits
it, so it inherits whatever the shell already has, and an inherited `true` would turn this into a
Cognito run without changing a character of the command:

```bash
EXECUTE_LIVE_COGNITO_TESTS=false npm run "e2e-tests-web:run dev-env"
```

Narrow it to one spec, with readable output:

```bash
EXECUTE_LIVE_COGNITO_TESTS=false npm run "e2e-tests-web:run dev-env" -- test/e2e/<path-to-the-spec>.spec.ts --reporter=list
```

---

### Tier 1-B — scoped Cognito (dev) · counts against the budget

Only after the matching 1-A is green. Run **individual** tests relevant to the changed files, dropping
the Cognito exclusion so the Cognito-dependent ones actually execute. Never the whole suite — that is
1-C.

**1-B backend** — narrow with `FullyQualifiedName`, and note the absence of `--filter Cognito!=Live`:

```bash
ENVIRONMENT=dev dotnet test "TTLeaguePlayersApp.BackEnd.Tests/TTLeaguePlayersApp.BackEnd.Tests.csproj" --configuration Debug --filter "FullyQualifiedName~<TestClass>" --logger "console;verbosity=normal"
```

**1-B frontend** — the `C+` script, narrowed to the specs the change affects. Relevant to frontend
changes **and** to backend changes that surface in the UI:

```bash
npm run "C+ e2e-tests-web:run dev-env" -- test/e2e/<path-to-the-spec>.spec.ts --reporter=list
```

Each invocation is one unit of the budget. At 10, stop and ask.

---

### Tier 1-C — full local verification with live Cognito (dev) · **ask first**

A faster Tier 2 with local artefacts. **Confirm with the user before launching.**

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

---

### Tier 2 — complete verification (test env, live Cognito)

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

When the whole pipeline is more than you need, either half can be run alone — **still after asking**:

Backend only, on the test environment, no filter:

```bash
./scripts/ci_tasks/run_backend_acceptance_tests.sh 3003 test COGNITO
```

Frontend e2e only, whole suite with live Cognito:

```bash
npm run "C+ e2e-tests-web:run test-env"
```

All three of these mutate Cognito: their cleanup deletes the dynamically created `test_*` users.

---

### Starting the services, when they are not already up

Normally the user already has these running; start them only if they are not.

```bash
sam local start-api --warm-containers LAZY --config-env dev --port 3000
```

```bash
npm run "run-web:dev-env"
```

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

## Phase 6 — Work summary report

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

IMPORTANT!: Apply to every hand-over message to the user the 'One Ask Per Message Rule', 'the One Point Per Message Rule', and the 'Presenting Rule for the One Ask and the One Topic you do send'.

## Phase 7 — Retrospect

Review how task execution phases 1–6 actually went and fold anything durable back into
this skill. Corrections the user made are the highest-value input. Ask the user if they want to add any other improvement to this skill


**Where the improvement goes — check before editing anything.** Phase logic (the steps, their
order, what this phase produces) belongs in this file. Anything about the interaction protocol —
the One Ask and One Point rules, the pre-send gate, the shape of a hand-back — belongs in
`.claude/skills/shared/interaction-protocol.md`, which all four skills inject verbatim at load
time.

**Never edit the protocol text as it appears in a rendered skill.** What you see inline was
injected from that one shared file; editing it in place either silently diverges the four skills
or is discarded the next time the file is read. Open the shared file and change it there, once.

## Phase 8 — Close

**Tell the user** — you cannot run this yourself; `/compact` is a command they type:

> Execution is complete. The plan's progress log and the work summary at `<path>` are up to date.
> Before starting the Review you may want to compact this session:
> `/compact keep all the relevant info emerged during the execution before moving to the Review`

Say also that compacting is optional and the hand-off does not depend on it: the plan and the work
summary are on disk, and those files — not this conversation — are what `coding-task-review` reads.

```!
cat ${CLAUDE_PROJECT_DIR}/.claude/skills/shared/orchestration.md
```

## Standing rules

**Asking the user.** A question, a blocker, a checkpoint, plan drift, a confirmation before a long
or shared-environment run — each is a stop, and every stop follows *Presenting the one ask you do
send* in the interaction protocol above.

**Git.** Stay on the current branch. Make no commits. Leave the working tree for the user to stage
themselves. Never stash, revert, or clean their pre-existing uncommitted changes.

**Plan drift.** If anything contradicts the plan — a selector that does not match, a design that
proves unworkable, a dependency that was missed — **stop and ask, always**. Report the finding and
the options in the shape described above; do not silently redesign, and do not silently comply with
a plan you now know to be wrong. Record the resolution in the plan's progress log before resuming.

**Scope.** The plan defines the work. Do not widen it, do not fold in unrelated cleanups noticed in
passing, and do not narrow it because a step looks awkward.

IMPORTANT!: Apply to every hand-over message to the user the 'One Ask Per Message Rule', 'the One Point Per Message Rule', and the 'Presenting Rule for the One Ask and the One Topic you do send'.


## Anti-patterns

- Redoing a sub-task already marked `done`, or starting one whose blockers are not.
- Marking `done` with failing or unrun verification.
- Running builds or tests in parallel, or from a worktree, against the shared local dev services.
- Continuing past a review checkpoint without explicit permission.
- Committing, branching, or tidying the working tree.
- Batching the work summary to the end instead of reporting per sub-task.
- Adapting the plan quietly when it turns out to be wrong.
- Handing back a question, blocker or checkpoint without the context, cause and options the user
  needs to answer it.
- Appending a question to a work-summary entry, a status report or a verification result.
- Bundling permission for a Cognito command, a tier run or a checkpoint with any other decision.
- Passing more than one question to a single `AskUserQuestion` call.
- Reporting which environment a test run reached from the flag passed to it rather than from evidence.
- Running a mutating Cognito command — the provisioning scripts, an `aws cognito-idp` write, applying a
  pending change to either — without asking first.
- Climbing to Tier 1-C or Tier 2 without confirmation, or reaching for them when 1-A would have
  answered the question.
- Re-running a Cognito-touching test to diagnose something unrelated to Cognito, instead of reading the
  trace, screenshot or `error-context.md` already on disk.
- Losing count of the Cognito budget, or continuing past 10 without asking.
- Re-running anything after the "Too many attempts" lockout message, which extends the wait.
- Starting work without a confirmed green baseline — or establishing one by running the suites yourself
  rather than asking the user.
- Creating or reconfiguring a shared test record — a Cognito user above all — from a test or by hand,
  instead of declaring it in the provisioning scripts.
- Marking a behaviour verified by a test that has never been observed failing.

---
name: coding-task-execution
description: Execute a plan previously produced and persisted by the Coding Task Inception skill, tracking per-sub-task status and building a work summary report for human code review. Use when the user says "Coding Task Execution", or asks to start, resume or continue work on a stored plan.
---

# Coding Task Execution

Input is a confirmed plan at
`~/.claude/projects/.../memory/plan-<slug>.md`.
That file is the source of truth across sessions and agents, not the in-session task list.

If no such plan exists, stop and say so — run `coding-task-inception` first. Do not improvise one.

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

## Phase 3 — Execute

For each sub-task, in order:

1. Set its Status to `in progress` in the persisted plan **before** starting.
2. Do the work as the sub-task describes.
3. Verify it (Phase 5).
4. Set Status to `done` and append a dated line to the plan's progress log.
5. Write its entry in the work summary report (Phase 6) and post that entry in the chat.

A sub-task that cannot be finished stays `in progress`. Never mark `done` on partial work, failing
tests, or anything you worked around rather than solved — report it and stop.


- **Commands against live cloud and Cognito environment** Running a read-only command against the cloud environment, and Cognito is permitted. Before running any mutating or state changing command against the cloud environment, and Cognito, ask permission from the user, and proceed only if the persimiion is give. Present at the end a list of all such write or mutating or state changing command.

## Phase 4 — Checkpoints

When the plan contains a review checkpoint, **stop completely** and hand back. Show what the
checkpoint task says to show, framed as *Asking the user* under Standing rules describes, and wait
for explicit permission to continue. Do not start the next sub-task, do not "get a head start" on
unrelated ones.

## Phase 5 — Verify before marking done

Two tiers, and they are **not** interchangeable.

**Tier 1 — the fast feedback loop.** Runs on the **dev** environment, reusing the local web server
and SAM that are already started. Seconds to a couple of minutes. Run it constantly, scoped to what
the sub-task touched.

**Tier 2 — the complete verification.** One command, on the **test** environment, with live
Cognito. Minutes. Run it once, at the plan's final verification sub-task, and **confirm with the
user before launching** — it is long-running and touches the shared test environment.

Never substitute tier 2 for a tier-1 loop (too slow to iterate on), and never let tier 1 stand in
for tier 2 (different environment, no live Cognito, no clean-room build).

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
| Frontend source | frontend lint+build, plus the specs covering the changed files |
| `config/*.env.json` | the backend suite — `LoaderTest` is a Theory over dev/test/staging/prod and parses all four |
| Test or fixture only | just that suite |
| Backend C# | `sam build --config-env dev` **then** the backend suite |
| Gate: plan verification sub-tasks, and **every checkpoint** | the whole of tier 1, frontend and backend |
| Plan's final sub-task | tier 2, after asking |

---

### Tier 1 — fast feedback loop (dev)

**Working directory matters.** Frontend `npm` commands run from
`TTLeaguePlayersApp.FrontEnd/`; `sam`, `dotnet` and `./scripts/...` run from the repo root.

**Frontend — lint, typecheck, build** (`copy-config` → `eslint .` → `tsc -b` → `vite build`):

```bash
npm run "build-web:dev-env"
```

**Frontend — unit tests (Vitest), whole suite:**

```bash
npm run "unit-tests-web:run"
```

**Frontend — a single spec**, much faster while iterating on one file:

```bash
npx vitest run test/unit/<path-to-the-spec>.spec.ts
```

**Backend — refresh the local SAM with the latest C# code.** Mandatory before the C# tests:

```bash
sam build --config-env dev
```

**Backend — the whole C# suite against dev:**

```bash
ENVIRONMENT=dev dotnet test "TTLeaguePlayersApp.BackEnd.Tests/TTLeaguePlayersApp.BackEnd.Tests.csproj" --configuration Debug --logger "console;verbosity=normal"
```

**Backend — a single test**, for triaging one failure:

```bash
ENVIRONMENT=dev dotnet test "TTLeaguePlayersApp.BackEnd.Tests/TTLeaguePlayersApp.BackEnd.Tests.csproj" --configuration Debug --filter "FullyQualifiedName~<TestClass>.<TestMethod>" --logger "console;verbosity=normal"
```

**Frontend — e2e (Playwright) on dev, whole suite:**

```bash
npm run "C+ e2e-tests-web:run dev-env"
```

**Frontend — e2e narrowed to one spec:**

```bash
npm run "C+ e2e-tests-web:run dev-env" -- test/e2e/<path-to-the-spec>.spec.ts
```

**Frontend — e2e on dev without the live Cognito tests.** Run Playwright directly; `PORT` is what
sets the `baseURL` (`playwright.config.ts` uses `http://localhost:${PORT ?? 5173}`):

```bash
cross-env PORT=5173 playwright test
```

Append a spec path to narrow it, and `--reporter=list` for readable console output:

```bash
cross-env PORT=5173 playwright test test/e2e/<path-to-the-spec>.spec.ts --reporter=list
```

The equivalent npm script, which now wraps exactly that command:

```bash
npm run "e2e-tests-web:run dev-env"
```

`C+` on a script name means it also runs the live Cognito tests; without it they are skipped.

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

VS Code task: *C+ full-stack-builds-tests-pipeline test-env*. Runs frontend lint+build, SAM build,
the full C# suite and the full e2e suite on the test environment, then cleans up the dynamically
created `test_*` Cognito users and stops its own SAM. Drop `COGNITO` to skip the live Cognito tests.

**It outruns a foreground timeout.** Launch it with Bash `run_in_background`, then arm a `Monitor`
on the output file filtering for step results and failure signatures — not raw logs:

```bash
tail -f <task-output-file> | grep -E --line-buffered "Build Succeeded|Build Failed|Test Run Successful|Test Run Failed|passed \(|failed|error TS|ALL TESTS PASSED|FAILURE"
```

Backend acceptance tests alone on the test environment, if the pipeline is more than you need:

```bash
./scripts/ci_tasks/run_backend_acceptance_tests.sh 3003 test COGNITO
```

---

### Starting the services, when they are not already up

Normally the user already has these running; start them only if they are not.

```bash
sam local start-api --warm-containers LAZY --config-env dev --port 3000
```

```bash
npm run "run-web:dev-env"
```

```bash
scripts/cognito/tests_helpers/register-test-users.sh dev force
```

The static Cognito users are created **once, manually, with `force`**. The pipeline calls
`register-test-users.sh` without `force`, which is a no-op — it relies on them already existing.

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

**Other triage rules that have paid off:**
- If every failure sits in **one test class** while other classes hitting the same local API pass,
  suspect the environment, not the change.
- **Playwright specs run in Node, which has no DOM.** Anything using `DOMParser` fails there with
  `ReferenceError: DOMParser is not defined`. The unit tests only work because `vite.config.ts`
  sets vitest's `environment: 'jsdom'`. Keep parser-level assertions in Vitest; limit e2e specs to
  fetching and asserting on raw HTML.
- **e2e specs sharing mutable records race under parallel workers.** A spec that fails in a full run
  but passes in isolation is flaky, not broken — re-run the full suite once before reporting it as a
  regression, and check it against `WriteTestsGuidelines.md`.
- Local DynamoDB tables, when a DataStore test misbehaves:

```bash
aws dynamodb list-tables --endpoint-url http://localhost:8000
```

Fix what you break. If verification will not go green, the sub-task is not done.

## Phase 6 — Work summary report

Maintained at
`~/.claude/projects/.../memory/work-summary-<slug>.md`,
appended as each sub-task completes and **posted in the chat at the same time** so the user can
follow along rather than reading it all at the end.

One section per completed sub-task:

- **Sub-task** — number and title.
- **Files** — each path created or modified, with one line on *why* that file changed.
- **Verification** — what was run and the result, quoted rather than characterised.
- **Needs human review** — the honest part. Judgement calls, anything that deviates from the plan,
  assumptions baked into code, brittleness knowingly accepted, and anything a reviewer would want
  to check against the live source. Write "nothing" only when it is true.

Keep entries short. A reviewer should be able to read the whole report before opening the diff.


## Phase 7 — Retrospect

Review how task execution phases 1–6 actually went and fold anything durable back into
this skill. Corrections the user made are the highest-value input. Ask the user if they want to add any other improvement to this skill

## Standing rules

**Asking the user.** Every time you stop — a question, a blocker, a checkpoint, plan drift, a
confirmation before a long or shared-environment run — the user is arriving cold. Give them enough
context to decide without reading the transcript or opening the diff. Lead with a short summary:

- **What you were doing** — a summary of which topic or question are the subject, and which sources you used.
- **The root cause** — why you are stopping. Not just the symptom: the actual reason the problem,
  need or question exists.
- **The options** — each one you can see, and for each: how big a change it is, what it affects
  downstream, and its pros and cons. Say which you recommend and why.

Keep it short enough to read in under a minute. The test is whether the user can tell, at a glance,
what it is about, what they can do, and what each choice costs. A bare "should I proceed?" or a
question that assumes they remember the last twenty tool calls fails that test.

In the presentation make a clear visual distinction between the info you present and the questions or next steps expected from the user.

Make sure to ask quesitons to the the user one topic at the time, and if there are sub-topics, one sub-topic at the time, until the sub-topic or topic is fully clarified.
Do not ask questions about multiple topics or sub-topics at the same time unless it is necessary because there are dependencies or tradeoffs between multiple topics or sub-topics that you want to explore with the user. 

When you present the conclusion on a topic or question, even more if that include reports of gaps, ask the user if they consider the topic completed before presenting info or questions on other topics.

**Git.** Stay on the current branch. Make no commits. Leave the working tree for the user to stage
themselves. Never stash, revert, or clean their pre-existing uncommitted changes.

**Plan drift.** If anything contradicts the plan — a selector that does not match, a design that
proves unworkable, a dependency that was missed — **stop and ask, always**. Report the finding and
the options in the shape described above; do not silently redesign, and do not silently comply with
a plan you now know to be wrong. Record the resolution in the plan's progress log before resuming.

**Scope.** The plan defines the work. Do not widen it, do not fold in unrelated cleanups noticed in
passing, and do not narrow it because a step looks awkward.

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
- Reporting which environment a test run reached from the flag passed to it rather than from evidence.
- Creating or reconfiguring a shared test record — a Cognito user above all — from a test or by hand,
  instead of declaring it in the provisioning scripts.
- Marking a behaviour verified by a test that has never been observed failing.

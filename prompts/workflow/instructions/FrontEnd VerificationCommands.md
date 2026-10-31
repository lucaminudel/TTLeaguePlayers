#  FrontEnd Verification Commands 
List of commands to run the build and the tests for the TTLeaguePlayersApp.FrontEnd project.

This is a general rule about the changes you make to the project files: do not make file changes, functional or UI, that have not been explicitly requested.
This is another rule for when making changes to the frontend code and tests: use the following commands in this order to verify the changes made:

## Which commands to reach for: the fast dev loop vs the authoritative pipeline

The commands below are not equal alternatives. Use them in two tiers.

**Tier 1 — the fast inner loop, on the dev environment.** Reuse the local web server and SAM that are already running, so nothing has to be started or rebuilt from scratch:
* `npm run "build-web:dev-env"` — lint + `tsc -b` + vite build
* `npm run "unit-tests-web:run"` — Vitest
* `npm run "C+ e2e-tests-web:run dev-env"` — Playwright, optionally narrowed to one spec by appending `-- test/e2e/<spec>.spec.ts`

Run this loop after every change. Scope it to what the change touched: lint + build plus the specs covering the changed files is usually enough, with the full loop kept for milestones.

**Tier 2 — the authoritative final check, on the test environment.** Run once, when the work is otherwise complete: `./scripts/ci_tasks/run_full_stack_builds_tests_pipeline.sh COGNITO`. It is long-running and touches the shared test environment, so agents should confirm before launching it.

### Notes that save time
* **A dev-only frontend build is safe even when all four `config/*.env.json` files change.** The backend `LoaderTest` is an xUnit Theory over dev/test/staging/prod that reads and deserialises each file, so a malformed edit to any of them fails there. Vite injects the config JSON verbatim, so the frontend build does not type-check config contents in any environment.

---

## Instructions to check for build, lint, and unit tests failures in TTLeaguePlayersApp.FrontEnd

### Prerequisites
The build and unit tests commands 
- do not require anything other than the linter and the compiler.
They must be run directly from the FrontEnd project root.

The end-to-end tests require:
- the local SAM environment running on Docker: `sam-start dev-env` and `sam-start test-env` that will also run the build for SAM, as defined in as VS Code Terminal task json
- the website running: `run-web:dev-env` and `run-web:test-env` or the deployment on staging 
- the creation of the Cognito standard test users: `scripts/cognito/tests_helpers/register-test-users.sh dev | test | staging  force`


### Configuration
The build and unit tests commands use the environment variable ENVIRONMENT = dev | test | staging | prod 
The value of ENVIRONMENT set at build time determines which config file (there is one defined for each environment) will be used at runtime.
The value of ENVIRONMENT is set by the command defined in the 
json so there is no need to set it manually.

The end-to-end tests use 
- the value of the variable ENVIRONMENT is defined statically during the build of the web app.
- the value of the variable EXECUTE_LIVE_COGNITO_TESTS set via the command line defaults to false.

### 1) Commands to lint and build the FrontEnd to check if it is ok or if some errors and warnings need fixing:
For the dev environment:
`npm run "build-web:dev-env"`
For the test environment:
`npm run "build-web:test-env"`
For the staging environment:
`npm run "build-web:staging-env"`
For the production environment:
`npm run "build-web:prod-env"`

### 2) Command to run basic FrontEnd unit tests 
Regardless of the environment, run the tests from the command line:
`npm run "unit-tests-web:run"`
This runs the tests and opens the test browser UI on a web page:
`npm run "unit-tests-web:browser-run"`

### 3) Commands to run FrontEnd mutation tests
Mutation tests exercise the Vitest unit-test suite only. They do not run Playwright or contact Cognito.
Run them after the build and the relevant unit tests pass, and normally mutate only the frontend
production files changed by the task.

Check that Stryker can discover and run the configured unit tests without executing mutations:
`npm run "mutation-tests-web:check"`

Run the configured frontend mutation suite incrementally. It reuses prior results where possible:
`npm run "mutation-tests-web:run"`

Force a complete run of every configured frontend mutant:
`npm run "mutation-tests-web:full"`

For the fast feedback loop, force mutation testing for only changed production file(s) and their
covering Vitest spec(s):
`npm run "mutation-tests-web:run-file" -- --mutate src/<path-to-changed-source>.ts --testFiles test/unit/<path-to-covering-spec>.test.ts`

For more than one file, provide comma-separated paths to `--mutate` and `--testFiles`.

#### Configurations, caches and reports

All paths in the table below are relative to `TTLeaguePlayersApp.FrontEnd/`.

| Entry point | Configuration | Cache and HTML directory |
| --- | --- | --- |
| `npm run mutation-tests-web:run` | `stryker.config.mjs` | `reports/mutation/incremental/` |
| `npm run mutation-tests-web:run-file -- --mutate src/path/File.ts` | `stryker.config.mjs` (forced selected scope) | `reports/mutation/incremental/` |
| VS Code Stryker extension | `stryker.config.mjs` | `reports/mutation/incremental/` |
| `npm run mutation-tests-web:full` | `stryker.full.config.mjs` (forced entire configured scope) | `reports/mutation/full/` |

Each directory contains `stryker-incremental.json` (the reusable machine-readable cache)
and `mutation.html` (the interactive report). Output paths are absolute paths derived
from the configuration file location, so changing the working directory does not
change the output destination. Source/test glob paths still require the configured
working directory; the npm commands and VS Code tasks/extension provide it.

Incremental runs and editor runs use the incremental configuration. A full run
overwrites the full outputs. Both configurations enable incremental persistence;
the full configuration additionally forces retesting instead of reusing verdicts.
Use `mutation-tests-web:full` for full verification rather than appending `--force`
to the incremental command, which would still write into the incremental directory.
Similarly, `mutation-tests-web:run-file` without filters forces the entire configured
scope but still writes into the incremental directory.

The matching VS Code terminal tasks are `mutation-tests-web:run (incremental)` and
`mutation-tests-web:full (forced)`. The Stryker extension uses the frontend working
directory and `stryker.config.mjs`, as defined in `.vscode/settings.json`.

Avoid running the editor extension and an incremental npm run concurrently because
they share the incremental cache and configured HTML destination. Full and incremental
runs also share Stryker's temporary workspace, so run them sequentially.

These generated outputs remain ignored by Git. Archive completed full-run outputs
separately if historical evidence is required. Legacy reports at
`reports/stryker-incremental.json` and `reports/mutation/mutation.html` are not used
by the new configurations and may still contain older results.

Record mutation findings and dated decisions in
[Unit-testing mutation triage](../steps_guidelines/UnitTestingMutationTriage.md).
Include pending fixes/investigations, justified accepted findings and any actual Stryker
exclusions. A decision recorded there does not itself suppress a mutation. Reevaluate
decisions when the relevant code, tests or assumptions change.

### 4) Command to run FrontEnd end-to-end tests
From the dev environment, use the IDE test explorer.

The e2e tests for the dev environment:
`npm run "e2e-tests-web:run dev-env"`
and to run only those specific to the test and page files just changed
`npm run "e2e-tests-web:run dev-env" -- test/e2e/<spec fiile .spec.ts>`

The e2e tests for the test environment:
`npm run "e2e-tests-web:run test-env"`
and to run only those specific to the test and page files just changed
`npm run "e2e-tests-web:run test-env" -- test/e2e/<spec fiile .spec.ts>`

The e2e tests for the dev environment, including the tests involving Cognito users:
`npm run "C+ e2e-tests-web:run dev-env"`
for the test environment:
`npm run "C+ e2e-tests-web:run test-env"`
for the staging environment:
`npm run "C+ e2e-tests-web:run staging-env"`

Run these commands from the frontend project directly (`TTLeaguePlayersApp.FrontEnd/`).
They are defined in `TTLeaguePlayersApp.FrontEnd/package.json` (the full-stack pipeline tasks are defined in `.vscode/tasks.json`).

#### Reports, failure logs, artifacts, and persistence

All paths below are relative to `TTLeaguePlayersApp.FrontEnd/`.

| Output | Location | Format / How to view | Lifecycle & Persistence |
| --- | --- | --- | --- |
| **Interactive HTML Report** | `playwright-report/index.html` | Full HTML report with step logs, error call logs, and trace links. View via `npm run "e2e-tests-web:report"` or open directly in a browser. | Overwritten on each test run. **Remains available after the web server or SAM stops.** Ignored by Git. |
| **Terminal Output** | `stdout` / `stderr` | Real-time console output with assertions, stack traces, and test list (from `list` reporter). | Ephemeral; exists in the terminal scrollback buffer. |
| **Failure Artifacts** | `test-results/<test-dir>/` | Folders created per failed test containing `trace.zip`, screenshots (`*.png`), and videos (`*.webm`). View trace via HTML report or `npx playwright show-trace <path-to-trace.zip>`. | Created only on failure. Cleared/replaced on subsequent test runs. **Remains available after web server stops.** Ignored by Git. |
| **JSON Test Results** | `test-results/results.json` | Machine-readable JSON summary of test execution. | Overwritten on each test run. |
| **VS Code Test Explorer** | VS Code Test Results panel | Inline error diffs, step logs, and clickable trace links. | Displayed in VS Code during the active editor session. |

> [!NOTE]
> **Server stops vs. Test outputs:** Stopping the Vite web server or the SAM Docker container does **not** delete or clear the test reports or artifacts. Playwright writes directly to the local project filesystem, so `playwright-report/` and `test-results/` remain intact and readable after server shutdown until a subsequent test run overwrites them.



###  5) Command to run the full pipeline lint and build and unit, integration, acceptance, e2e tests (before asking me about staging)
This pipeline runs on the test environment:
`./scripts/ci_tasks/run_full_stack_builds_tests_pipeline.sh`
This is defined as VS Code Terminal task: full-stack-builds-tests-pipeline test-env

This pipeline runs on the test environment, including the tests involving Cognito users:
`./scripts/ci_tasks/run_full_stack_builds_tests_pipeline.sh COGNITO`
This is defined as VS Code Terminal task: C+ full-stack-builds-tests-pipeline test-env

They are defined here: TTLeaguePlayers/.vscode/tasks.json


#  BackEnd Verification Commands 

List of commands to run the build and the tests for the TTLeaguePlayersApp.BackEnd project.

This is a general rule about the changes you make to the project files: do not make file changes, functional or UI, that have not been explicitly requested.
This is another rule for when making changes to the C# backend code and tests: use the following commands in this order to verify the changes made:

## Which commands to reach for: the fast dev loop vs the authoritative pipeline

The commands below are not equal alternatives. Use them in two tiers.

**Tier 1 — the fast inner loop, on the dev environment.** Reuse the local SAM and DynamoDB that are already running:
```
sam build --config-env dev
export ENVIRONMENT=dev
dotnet test "TTLeaguePlayersApp.BackEnd.Tests/TTLeaguePlayersApp.BackEnd.Tests.csproj" --configuration Debug --logger "console;verbosity=normal"
```

**Run `sam-refresh-build dev-env` before the C# tests.** In the dev environment this refresh is sufficient for the running SAM server to use the newly built code. Do not check the SAM process ID or stop and restart the server routinely after a successful refresh. Only restart it as a recovery step if, after `sam-refresh-build dev-env`, the new code still appears not to be running—for example, a focused acceptance check returns behavior from before the change. The `sam-start dev-env` task is for starting SAM when no dev server is running; it also runs the build.

**Tier 2 — the authoritative final check, on the test environment.** Run once, when the work is otherwise complete: `./scripts/ci_tasks/run_full_stack_builds_tests_pipeline.sh COGNITO`. It is long-running and touches the shared test environment, so agents should confirm before launching it.

---

## Instructions to check for build, unit/integration and acceptance tests failures in TTLeaguePlayersApp.BackEnd

### Prerequisites
These build commands do not require anything other than the compiler and SAM library to be installed locally.
They must be run directly from the BackEnd project root.

Most C# integration DataStore tests require 
- the local DynamoDb instance for test or dev, running on Docker => simply have Docker and the local DynamoDb image running

Most C# integration Lambda tests require 
- the local SAM environment running on Docker: `sam-start dev-env` and `sam-start test-env` that will also run the build for SAM, as defined in as VS Code Terminal task json

Most C# acceptance tests require 
- the creation of the Cognito standard test users: `scripts/cognito/tests_helpers/register-test-users.sh dev | test | staging  force`


### Configuration
The SAM commands specify the environment using the SAM command line option --config-env with dev | test | staging | prod.
The environment specified defines which section of the samconfig.toml is used.

The C# Acceptance tests use the environment variable ENVIRONMENT = dev | test | staging 
via the BackEnd.Configuration.DataStore, to load the config file and target one environment.
It defaults to dev when empty, as when running the tests from the IDE explorer.
When the tests are run from a command file, the variable ENVIRONMENT can be set.


### 1) Command to build the backend to check if it is ok or some errors and warnings need fixing: 
For the dev environment:
`sam build --config-env dev`
This is defined as VS Code Terminal task: sam-refresh-build dev-env

For the dev environment, with additional debug logs:
`sam build --config-env dev --debug`
This is defined as VS Code Terminal task: sam-refresh-build dev-env (extra debug logs)

For the test environment:
`sam build --config-env test`
This is defined as VS Code Terminal task: sam-refresh-build test-env

All these commands are defined here: TTLeaguePlayers/.vscode/tasks.json

### 2) Commands to run backend tests 
Via command line, after ensuring the prerequisites:
```
export ENVIRONMENT= dev | test | staging  (dev is the default if nothing is specified)
dotnet test "TTLeaguePlayersApp.BackEnd.Tests/TTLeaguePlayersApp.BackEnd.Tests.csproj" --configuration Debug --logger "console;verbosity=normal"
```
They are all expected to pass in dev as well as in test, and from the IDE C# tests explorer (dev)

Via a batch file, that ensures all the prerequisites:
```
./scripts/ci_tasks/run_backend_acceptance_tests.sh 3003 test COGNITO
```
This is defined as VS Code Terminal task: C+ api-tests test-env


Via a batch file that ensures all the prerequisites, but excludes the live Cognito tests, so it stays local:
```
./scripts/ci_tasks/run_backend_acceptance_tests.sh 3003 test
```
This is defined as VS Code Terminal task: api-tests test-env

All these commands are defined here: TTLeaguePlayers/.vscode/tasks.json

## On running the build and the tests from a sandbox

When the sandbox limited this environment, these failures can came from the sandbox boundary:

- SAM tries to install/update Amazon Lambda Tools through NuGet. Network access is blocked, so the normal command failed. With network access enabled (outbound DNS and HTTPS (TCP 443) to api.nuget.org, so SAM’s Lambda Tools install/update check can reach NuGet.), the same command found the already-installed 7.0.0 tool and built successfully.
- The .NET test runner is denied permission to bind its local communication socket. The same tests passed when run with local socket access (permission to bind a local TCP socket on an ephemeral port for VSTest’s testhost communication).
- The sandboxed AWS CLI can see DynamoDB’s port listening but cannot connect to localhost:8001; the access works with network access enabled (permission to connect over loopback TCP to localhost:8001, the Docker-published DynamoDB port).

Run the documented build and test commands unchanged first; if they fail as described above, treat that as an environment restriction and retry with the required access and with the sandbox restrictions removed as described below:

- Solution for the build: dotnet build TTLeaguePlayersApp.sln --no-restore --verbosity:minimal -m:1 /p:UseSharedCompilation=false completed in 1.02 seconds with 0 warnings and 0 errors.
- SAM build: sam build --config-env dev passed with network access. SAM used the already-installed Amazon Lambda Tools 7.0.0; nothing needed installing.
- C# tests: The same filtered dotnet test command passed outside the sandbox: 30/30.
- DynamoDB check: The read-only table listing succeeded outside the sandbox and showed the three expected test tables.

When a solution build stalls, stop it after 45 seconds, then try one bounded serial/single-node build.
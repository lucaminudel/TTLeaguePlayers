#  BackEnd Verification Commands 

List of commands to run the build and the tests for the TTLeaguePlayersApp.BackEnd project.

This is a general rule about the changes you make to the project files: do not make file changes, functional or UI, that have not been explicitly requested.
This is another rule for when making changes to the C# backend code and tests: use the following commands in this order to verify the changes made:

## Instructions to check for build, unit/integration and acceptance tests failures in TTLeaguePlayersApp.BackEnd

### Prerequisites
These build commands do not require anything other than the compiler and SAM library to be installed locally.
They must be run directly from the BackEnd project root.

Most C# integration DataStore tests require 
- the local DynamoDb instance for test or dev, running on Docker => simply have Docker and the local DynamoDb image running

Most C# integration Lambda tests require 
- the local SAM environment running on Docker: `sam-start dev-env` and `sam-start test-env` that will also run the build for SAM

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

All these commands are defined here: /Users/lucaminudel/Code/TTLeaguePlayers/.vscode/tasks.json

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

All these commands are defined here: /Users/lucaminudel/Code/TTLeaguePlayers/.vscode/tasks.json
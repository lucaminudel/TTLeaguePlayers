#  FrontEnd Verification Commands 
List of commands to run the build and the tests for the TTLeaguePlayersApp.FrontEnd project.

This is a general rule about the changes you make to the project files: do not make file changes, functional or UI, that have not been explicitly requested.
This is another rule for when making changes to the frontend code and tests: use the following commands in this order to verify the changes made:

## Instructions to check for build, lint, and unit tests failures in TTLeaguePlayersApp.FrontEnd

### Prerequisites
The build and unit tests commands 
- do not require anything other than the linter and the compiler.
They must be run directly from the FrontEnd project root.

The end-to-end tests require:
- the local SAM environment running on Docker: `sam-start dev-env` and `sam-start test-env` that will also run the build for SAM
- the website running: `run-web:dev-env` and `run-web:test-env` or the deployment on staging 
- the creation of the Cognito standard test users: `scripts/cognito/tests_helpers/register-test-users.sh dev | test | staging  force`


### Configuration
The build and unit tests commands use the environment variable ENVIRONMENT = dev | test | staging | prod 
The value of ENVIRONMENT set at build time determines which config file (there is one defined for each environment) will be used at runtime.
The value of ENVIRONMENT is set by the command defined in the tasks.json so there is no need to set it manually.

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

### 3) Command to run FrontEnd end-to-end tests 
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

Run these commands from the frontend project directly.
They are defined here: /Users/lucaminudel/Code/TTLeaguePlayers/.vscode/tasks.json



###  4) Command to run the full pipeline lint and build and unit, integration, acceptance, e2e tests (before asking me about staging)
This pipeline runs on the test environment:
`./scripts/ci_tasks/run_full_stack_builds_tests_pipeline.sh`
This is defined as VS Code Terminal task: full-stack-builds-tests-pipeline test-env

This pipeline runs on the test environment, including the tests involving Cognito users:
`./scripts/ci_tasks/run_full_stack_builds_tests_pipeline.sh COGNITO`
This is defined as VS Code Terminal task: C+ full-stack-builds-tests-pipeline test-env

They are defined here: /Users/lucaminudel/Code/TTLeaguePlayers/.vscode/tasks.json


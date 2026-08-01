# Automated Testing Guidelines


## Core Principles
*  **No Implementation Changes:** Never modify the implementation code of the system under test (SUT). Only write or modify test code. This includes not increasing the visibility of implementation code private methods.
*  **DRY Test Data:** Use the **Builder Pattern** for test data creation to avoid duplication and keep tests readable.
*  **State Cleanup:** When integration testing involves stateful systems (Files, Databases, Auth Services), ensure the state is reverted or cleaned up in the **teardown/cleanup** phase of the test fixture.

Use data-testid to quickly identify the html elements.

## Mocking and Stubbing
*  **Choose your test style:**
	* Use **Stubs** and if needed **Spyes** for **State Testing** (verifying the final state or return value).
	* Use **Mocks** for **Interaction Testing** (verifying that specific methods were invoked).
	* Avoid mixing state and interaction assertions in a single test case.
*  **Contract Verification:** For every mocked interface/API, there must be a corresponding integration test to ensure the mock's behaviour aligns with the real-world system.
*  **Dependency Injection:** Prefer injecting mocks and stubs via the **Constructor**. Avoid framework-specific "magic" or reflection-based overrides unless the SUT architecture strictly requires it.

  
## E2E Testing DRY code
**Action Encapsulation:** To prevent code duplication in the e2e tests for actions repeated in multiple test cases (Login,  NavigateTo..., registerNewUser, etc), organise those actions with a **Fluent Interface** and reuse that code.

**Specialised Flow Abstractions:** The fluent interface creates high-level methods for complex, repeatable scenarios at the business level with actions related to the **business logic**. Those methods are currently organised like the pages, as the current pages mimic the key business concepts. **Lean Page Objects:** keep the Page Objects, that make up the fluent interface, lightweight, with only the key actions and basic verifications for stability. Where other checks are left in the spec.

**Fluent Interface Actions:** These actions in the fluent interface include internal verifications (assertions) to ensure **integrity and stability** and avoid duplication, where the e2e tests will only include one-off verifications specific to that test.
Look at examples the [e2e test file Registration](file://~/TTLeaguePlayers/TTLeaguePlayersApp.FrontEnd/test/e2e/page-objects/RegisterPage.ts) and the main part of the fluent interface used there, the [RegisterPage](file://~/TTLeaguePlayers/TTLeaguePlayersApp.FrontEnd/test/e2e/page-objects/RegisterPage.ts).

*  **General Structure:** Follow a hierarchical chain starting from a `User` actor:
	* Example: `User.Login().NavigateToDashboard().CreateNewInvoice(data);`
	* Every fluent interface action should return the specific page object (where the user currently is, based on the action executed), and from there, the actions available to the user at that point should be exposed by the fluent interface (`User. ... .CreateNewInvoice(data).<actions available from this object>`) 
*  **Navigation actions and Stability** Navigation methods must ensure the target page is fully loaded and stable before returning, for that they will normally include internal verifications on the expected content and state of the page:
	*  **Header Verification**: Always verify the main page header (usually an `h2`) to confirm the correct page was reached.
	*  **Loading States**: Explicitly wait for any page-level loading messages or spinners to become invisible (e.g., `join-loading-message`).
	*  **Optional Verification**: Accept optional parameters in navigation methods to verify the state of the page (e.g., an expected email pre-filled from an invite) before returning the page object.
	*  **Tentative Navigation**: Some tests will validate behaviour in error cases, for example when a navigation will fail or be redirected, for those add "tentative navigation methods" that are like the other navigation methods but without the verification of the expected content and state of the page as for the normal navigation actions.
	*  **Examples**: Look at Navigation examples in [User file](file://~/TTLeaguePlayers/TTLeaguePlayersApp.FrontEnd/test/e2e/page-objects/User.t)
*  **Other actions:**
	*  **Successful actions and Stability**: Default successful actions include verification of the success of the action, for example as the action `registerPage.registerNewUserWithInvite()` does
	*  **Tentative actions**: Tentative actions used for error case tests will not include the verification of the success of the action but only the action itself, as for example the action `registerPage.tentativeRegisterNewUserWithInvite()` does
	*  **No click actions**: To verify the data entry validation, no-click actions are like the tentative actions but without the final click to allow the test inspect the data entry client-side validation errors, as for example the action `registerPage.registerNewUserWithInviteNoClick()` does
	*  **Examples**: Look at the examples just mentioned in [Registration](file://~/TTLeaguePlayers/TTLeaguePlayersApp.FrontEnd/test/e2e/page-objects/RegisterPage.ts).
*  **What not to include:**	
	**Assertion methods**: Don't create assertion methods like `expectEmailValue(val)` or `expectNoErrorMessages` or `expectSuccessfulRegistration`. Instead, perform these assertions directly in the spec file using standard Playwright locators, preferably using data-testids (avoid using fragile CSS selectors or deep XPaths). Assertions on error message content, success notifications, or displayed data - other than those in the Navigation and Successful actions stability verifications - should stay in the spec.

*  **State Persistence (Test Context):** When the UI visualise outuput  that is needed for later steps in that test (e.g., a generated Username or Invoice ID), store this in a central **Test Context** object
*  **Test Context Access:** This data should be accessible via a fluent interface, for example, data from a newly registered user or a newly created invoice could be
	*  assigned like this
		* `var newInvoice = User...CreateNewInvoice(...)`
		* `App.NewInvoice.RememberInvoiceNumber(newInvoice.Number)` 
	*  accessed later like this: `App.NewInvoice.InvoiceNumber`




# Cognito test users creation and use

## The static Cognito user pool
`register-test-users.sh` under scripts/cognito/tests_helpers (run once, manually, with `force`) creates fixed identities, all `test_<slug>@user.test`, with a fixed password, most pre-baked with `custom:active_seasons` / `custom:managed_clubs` attributes.

These identities are used by the tests who need them.

`delete-test-users.sh` also under under scripts/cognito/tests_helpers with no `force` it only deletes other `test_*` users created dynamically at test time but spares the identities created with `force`.

**How CI Scripts uses these scripts:** `run_full_stack_builds_tests_pipeline.sh` calls `register-test-users.sh $ENVIRONMENT` (dev | test | staging) **without** `force` before tests, which — per the script's own logic — is a no-op (it just prints a hint and creates nothing). So the pipeline doesn't actually (re)create the static pool; it relies on the pool already existing from a prior manual `force` run. Ans at the end the CI scripts runs `delete-test-users.sh $ENVIRONMENT` **without** `force` to delete only the users dynamically created by the e2e tests.

## The manual static Cognito user pool creation and clean-up
Multiple automatic creation and clean-up of Cognito users quickly exhausts the daily quota of Cognito users that can be created and deleted.

To avoid this problem, it is left to the develper to run the `register-test-users.sh $ENVIRONMENT` (dev | test | staging) **with** `force` the first time, or after running `delete-test-users.sh $ENVIRONMENT` (dev | test | staging) **with** `force` every other time.


Most tests use the Cognito users in read-only, so unless a new test user is added to the script, there is no need to clean-up and re-create the static Cognito users with `force`.

There are a few tests that writes to the static Cognito users, as detailed below.

### Risk of not cleaning-up and recreating all the Cognito users at every tests execution
For a few tests below described in Group B, related to accepting invites, there is a risk of a false test success.
This is when the static users have been written by previous tests and the idempotent accept invite operation pass regardless of the code correctly updating the Cognito user.

So when changing the code related to those tests, it is necessary to clean and recreate the Cognito users using `force` before running the tests or the pipeline scripts.


## How different tests uses the static Cognito user pool 


### Mechanism 1 — Most static users are used read-only
Across both backend acceptance tests and frontend e2e specs, most of the static users are used purely to **log in and read** their pre-baked `active_seasons` / `managed_clubs` attributes . Since these tests never write to the user's Cognito attributes, there's no accumulated state to collide with.

### Mechanism 2 — Invite-acceptance tests: Group A (no Cognito touch)

The tests of both groups are in `InvitesAcceptanceTests.cs`' and they **never** reset any Cognito user.

#### Group A — E2E Tests that never touch Cognito at all
Group A tests are read-only/no-touch with respect to Cognito simply because the code path they exercise never reaches it — no static-user reuse concern applies to them.

Tests for CAPTAIN/PLAYER roles that only exercise `POST /invites`, `GET /invites/{id}`, or `DELETE /invites/{id}` (create, read, validation, delete — and never the accept step) use throwaway users that are **not part of the static pool**.  Indeed only `PATCH /invites/{id}` (accept) looks up and writes Cognito attributes for.

 A Create Invite Test for CLUB_MANAGER roles does read Cognito at create-time, but explicitly catches `UserNotFoundException` and returns. 

### Mechanism 3 — Invite-acceptance tests: Group B (writes to the shared mutated user)

#### Group B — Tests that accept an invite and genuinely write to the shared static user
A few Invite tests only *reads* Cognito using **permanently pre-baked static user** witnout writing to Cognito at all now.
While a few others really writte `test_ready_for_accept_invite_api_call@user.test` Cognito user's custom:active_seasons` / `custom:managed_clubs` atributes.
**Risk — false test success on a write-path regression:** For these latter tests, an earlier successful run that already wrote that exact `(league, season, team, division, name, role)` tuple to  would make the assertion still find a **stale** entry and pass — silently masking the regression. 


##### Group B.1 — Captain/Player accept tests (writes `custom:active_seasons`, fixed league/season)
A few tests related to Captain/Player Invites all accept against the shared mutated user using **fixed** league/season values.

They avoid *growing* the related Cognito users state across repeated runs because `CognitoUsers.AddActiveSeason` treats an identical entry as a no-op (in `CognitoUsers.cs`). Therefore the attribute converges to one stable entry instead of accumulating duplicates.

##### Group B.2 — Club-manager accept tests (writes `custom:managed_clubs`)
A few tests related go Club Manager Invites all accept using the same **fixed**-key pattern as B.1. Both genuinely need a write-then-read-back to prove the accept path really updates Cognito.


### Mechanism 4 — Frontend: brand-new dynamic identities instead of the static pool
Where a test needs a genuinely fresh, unregistered user (e.g. registration flow), it doesn't touch the static pool at all but generates a `test_<epoch-ms>@delete.me` on every run. 

### Mechanism 5 — Frontend: neutralizing derived/computed state via response mocking, not real resets
Kudos-rating specs face a subtler problem: the UI disables re-rating a match based on `latest_kudos` inside the static user's Cognito attributes, which would look "already done" on a re-run. Rather than resetting real Cognito state, the test intercepts the `GetUser` network response and forces `latest_kudos: []` client-side before each test.



## Which test type each mechanism applies to

| # | Mechanism | Test type(s) |
|---|---|---|
| 1 | Static users used read-only | **Both** backend acceptance tests **and** frontend e2e specs  |
| 2 | Group A (no Cognito touch)  | Backend acceptance tests only  |
| 3 | Group B.1 (Captain-Player, fixed key "update attributes" test) / Group B.2 (Club Manager: fixed-key "update attributes" test) | Backend acceptance tests only  |
| 4 | Fresh dynamic `test_<epoch>@delete.me` identities | Frontend e2e only |
| 5 | Mocking `GetUser` to neutralize `latest_kudos` | Frontend e2e only  |


### Files Involved

**Cognito test-user creation/cleanup scripts:**
- `scripts/cognito/tests_helpers/register-test-users.sh` — creates the 8 static users (only when passed `force`); called without `force` by the pipeline scripts to (no-op) ensure they exist
- `scripts/cognito/tests_helpers/delete-test-users.sh` — deletes `test_*` users; excludes the 8 static emails unless passed `force`

**Pipeline scripts that call the above:**
- `scripts/ci_tasks/run_full_stack_builds_tests_pipeline.sh` — calls `register-test-users.sh $ENVIRONMENT` (setup, no `force`) and `delete-test-users.sh $ENVIRONMENT` (cleanup trap, no `force`)
- `scripts/ci_tasks/run_backend_acceptance_tests.sh` — calls `delete-test-users.sh $CONFIG_ENV` and `register-test-users.sh $CONFIG_ENV`
- `scripts/ci_tasks/run_smoke_tests_staging.sh` — calls `delete-test-users.sh $ENVIRONMENT` and `register-test-users.sh $ENVIRONMENT`


**Backend C# acceptance tests (hit real Cognito, use the static pool — mechanisms 1 and 2):**
- `TTLeaguePlayersApp.BackEnd.Tests/TTLeaguePlayersApp.BackEnd.APIGateway.AcceptanceTests/`

**Other Backend C# unit tests (no real Cognito, use fakes — not affected by static-user reuse):**
The remaining tests under
- `TTLeaguePlayersApp.BackEnd.Tests/`

**Frontend unit tests (Vitest, no real Cognito — not affected by static-user reuse):**
- `TTLeaguePlayersApp.FrontEnd/test/unit/`

**Frontend e2e tests (Playwright, hit real Cognito, use the static pool):**
- `TTLeaguePlayersApp.FrontEnd/test/e2e/`


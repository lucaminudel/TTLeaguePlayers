# Automated Testing Guidelines


## Core Principles
*  **No Implementation Changes:** Never modify the implementation code of the system under test (SUT). Only write or modify test code. This includes not increasing the visibility of implementation code private methods.
*  **DRY Test Data:** Use the **Builder Pattern** for test data creation to avoid duplication and keep tests readable. It takes two forms in this codebase, and both are valid — pick the one that matches the test project you are in:
	*  **Fluent builder class**, for test data assembled differently by many tests. The e2e specs use `TestInviteBuilder` (`TTLeaguePlayersApp.FrontEnd/test/e2e/builders/TestInviteBuilder.ts`): a valid baseline set in the constructor, then chained `withRole(...)` / `withTeam(...)` / `withLeague(...)` mutators and a final `build()`. See its nine uses in `test/e2e/join.spec.ts`.
	*  **Parameterised static factory**, for test data where only a couple of fields vary. This is the convention in the **C# tests**, which have no builder classes: a `private static` method returning a valid object, with optional parameters for what the test needs to change — `CreateCaptainTestInvite()` / `CreateClubManagerTestInvite()` in `InvitesDataTableTest`, `CreatePlayerInvite(nanoId, acceptedAt, inviteeEmailId, league, season)` in `AccepteInviteLambdaTests`, `CreateTestClub(location?, clubName?)` and `CreateTestTournament(club, startOffset, endOffset)` in `ClubsAndTournamentsDataTableTest`, `CreateInviteRequestJson(...)` in the acceptance tests. Group them under a `// Builders` region as `ClubsAndTournamentsDataTableTest` does, and give them a `UniqueId()` suffix when parallel runs could collide.
	*  Note `TTLeaguePlayersApp.BackEnd.Tests/Builders/` is an **empty directory** — it is not where the C# test data lives. The factories are private to each test class.
*  **State Cleanup:** When integration testing involves stateful systems (Files, Databases, Auth Services), ensure the state is reverted or cleaned up in the **teardown/cleanup** phase of the test fixture. See [Test Data Cleanup](#test-data-cleanup) for the patterns to follow in each test type.

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

## Applying the `EXECUTE_LIVE_COGNITO_TESTS` skip guard in e2e specs

Every frontend e2e spec file declares:

```typescript
const EXECUTE_LIVE_COGNITO_TESTS = process.env.EXECUTE_LIVE_COGNITO_TESTS === 'true';
```

The guard `test.skip(!EXECUTE_LIVE_COGNITO_TESTS, 'Skipping Cognito integration test')` must appear at the top of the test body (or on the `describe` block) **if and only if** the test causes a real network call to AWS Cognito during its execution.

### The decision rule — ask one question

> **Does this test, when run with `EXECUTE_LIVE_COGNITO_TESTS=false` and no real AWS credentials, issue a network request to `cognito-idp.*.amazonaws.com` that is not intercepted by a `page.route(...)` mock?**

- **Yes** → add the guard.
- **No** → do not add the guard.

### What counts as "touching real Cognito"

A test touches real Cognito when any of these is true **and no `page.route(...)` mock intercepts the call**:

| Action | Cognito call triggered |
|---|---|
| `loginPage.tryToLogin(email, password)` | `InitiateAuth` |
| `user.navigateToLoginAndSuccesfullyLogin(...)` | `InitiateAuth` + `GetUser` |
| `loginPage.loginAndWaitForHome(...)` | `InitiateAuth` + `GetUser` |
| `registerPage.registerNewUser(email, password)` | `SignUp` (real, not mocked) |
| `registerPage.tentativelyRegisterNewUser(email, password)` | `SignUp` (real, not mocked) |
| Navigation to a page that runs an auth-check `GetUser` for a logged-in user | `GetUser` |

### What does NOT count as "touching real Cognito"

- A `page.route('https://cognito-idp.*.amazonaws.com/', ...)` mock that intercepts **all** relevant Cognito operations used by the test (`SignUp`, `InitiateAuth`, `ConfirmSignUp`, `GetUser`, …). Even if the code path exercises the Cognito client, the real endpoint is never hit.
- Client-side form validation that prevents the form from being submitted (the network call never fires).
- Navigating to a page as an **unauthenticated user** when the app only reads auth state from `localStorage` / memory without calling `GetUser`.

### The two failure modes to avoid

**Missing guard (the more harmful mistake):**
A test that calls real Cognito without the guard will fail for anyone running without AWS credentials or connectivity, and it silently consumes Cognito request quota in supposedly credential-free runs. Example that required the guard added:

```typescript
// login.spec.ts — fires a real InitiateAuth; no page.route mock intercepts it
test('login - non existing user shows expected error message', async ({ page }) => {
    test.skip(!EXECUTE_LIVE_COGNITO_TESTS, 'Skipping Cognito integration test');
    // ...
    await loginPage.tryToLogin('non_existing_user@Idonotexist.com', 'aA1!56789012');
    // Cognito itself returns "Incorrect username or password."
});
```

**Unnecessary guard (reduces coverage silently):**
A test with the guard whose Cognito calls are all intercepted by `page.route` mocks runs fine without credentials — but the guard skips it unnecessarily, hiding a coverage gap. Example that required the guard removed:

```typescript
// register.spec.ts — both .SignUp and .ConfirmSignUp are mocked via page.route;
// the invite endpoints are also mocked. No real Cognito call is made.
test('registration with invite success - happy path', async ({ page }) => {
    // test.skip removed — guard was wrong here
    await page.route('https://cognito-idp.*.amazonaws.com/', async (route) => {
        if (target?.endsWith('.SignUp')) { await route.fulfill({ ... }); return; }
        if (target?.endsWith('.ConfirmSignUp')) { await route.fulfill({ ... }); return; }
        await route.continue();
    });
    // ...
});
```

### Verification procedure

When unsure, run the test suite with invalid AWS credentials. Any test that truly reaches Cognito will fail with an AWS auth error, and the stack trace will name the call site:

```bash
AWS_ACCESS_KEY_ID=AKIAINVALIDINVALID00 \
AWS_SECRET_ACCESS_KEY=bogussecret \
AWS_EC2_METADATA_DISABLED=true \
EXECUTE_LIVE_COGNITO_TESTS=false \
npx playwright test --project=chromium <spec-file>
```

A clean run means no unguarded real-Cognito tests remain. Any failure exposes a missing guard.

### Placement rule — test vs describe

- If **every** test in a `describe` block touches real Cognito, put the guard on the `describe`:
  ```typescript
  test.describe('My Club Teams Page', () => {
      test.skip(!EXECUTE_LIVE_COGNITO_TESTS, 'Skipping Cognito integration test');
      // all tests inside login as a real user
  });
  ```
- If only **some** tests in a `describe` touch real Cognito, put the guard individually on each affected test, not on the describe.

## Test Data Cleanup

Any test that writes to a real store (DynamoDB, the HTTP API, Cognito, files, environment variables) must leave the environment as it found it, **whether the test passes or fails**.

*  **Cleanup belongs in the teardown hook, never in a final test step.** A cleanup written as the last step of the test is skipped the moment any earlier assertion fails — which is exactly when data is most likely to have been left behind. Teardown hooks run regardless of outcome.
*  **Tests that only use fakes or stubs need no cleanup** — this is all the frontend unit tests and the backend Lambda unit tests, which inject a `Fake...DataTable`.
*  **Verify the teardown actually fires** when you write it: temporarily inject a failure before the test's own removal steps, confirm the cleanup runs and the store is clean, then revert the injected failure.

### BackEnd (C#, xUnit)

The same shape is used by the **DataStore integration tests** (`ClubsAndTournamentsDataTableTest`, `InvitesDataTableTest`, `KudosDataTableTest`) and by the **API acceptance tests** (`ClubsAndTournamentsAcceptanceTests`, `InvitesAcceptanceTests`, `KudosAcceptanceTests`):

*  **Teardown hook:** the test class implements `IAsyncLifetime`; `InitializeAsync` does any setup (or `=> Task.CompletedTask`), and `DisposeAsync` performs the cleanup. xUnit runs `DisposeAsync` after every test class run, pass or fail.
*  **Track what you create:** hold a `ConcurrentBag`/`List` field of the created keys, appended by a small `Tracked...` helper that wraps the write — e.g. `TrackedUpsertClub` / `TrackedCreate` / `TrackedSave`. Tests call the helper rather than the store directly, so nothing can be created without being registered for deletion.
*  **Best-effort deletes:** wrap each delete in `try { ... } catch { /* ignore */ }` so one failure (or an item a test already deleted) does not abort the cleanup of everything else.
*  **Delete children before parents:** e.g. tournaments before clubs, so no orphan rows are left if a delete fails part-way.
*  **Re-authenticate in teardown when the cleanup needs it:** acceptance tests that delete through the API re-acquire the Cognito id token in `DisposeAsync` when their `HttpClient` may no longer carry a valid one.
*  **Dispose owned resources last**, after the data cleanup: `_db.Dispose()`, `_httpClient?.Dispose()`.
*  **Process-level state counts too:** `LoaderTest` implements `IDisposable` purely to restore the `ENVIRONMENT` environment variable it changed, including restoring it to null when it was previously unset.

### FrontEnd e2e (Playwright)

Follow `PromoteMyClub.spec.ts`, `PromoteMyTournaments.spec.ts`, `KudosAwardAndStanding.spec.ts` and `ClubsAndTournaments.spec.ts`:

*  **Teardown hook:** `test.afterAll(async ({ request }) => { ... })` on the `describe`, deleting through the API with Playwright's `request` fixture. It runs whether the tests passed or failed.
*  **Track what you create:** declare a describe-scope variable (`let addedClub: { url: string; auth: string } | null = null`) and record the **URL and the `Authorization` header** of the upsert request the UI issues, by listening to `page.on('request', ...)` (or `page.once` immediately before the action) and filtering on method and URL. The captured token is what lets the teardown delete the item.
*  **Clear the tracker when the test itself removes the item** (`addedClub = null;`), so the teardown only has work to do when the test did not get that far. Removing through the UI can stay a meaningful test step — the teardown is the safety net, not a replacement for it.
*  **Log the outcome** of each delete (`🧹 [Cleanup] ...`, `✅`, `❌`) and catch errors per item, so a failed cleanup is visible in the run output without failing the suite. Retry when the API is flaky, as the Kudos cleanup does.
*  **Do not share mutable fixtures between spec files.** Playwright runs spec files in **parallel workers**, so two specs that add and remove the *same* club, user or record will race and fail intermittently — and may appear to pass for a while depending on scheduling. Pick a club, tournament or invite that the spec owns. For the *Cognito identity* itself the rule is narrower — a read-only user may legitimately be shared; see [Reusing a read-only static user, or adding a new one](#reusing-a-read-only-static-user-or-adding-a-new-one).


## Acceptance tests run in two environments — branch, don't skip

The backend acceptance tests under `TTLeaguePlayersApp.BackEnd.Tests/TTLeaguePlayersApp.BackEnd.APIGateway.AcceptanceTests/` are **one suite with two jobs**: they run locally against `sam local start-api` during development and CI (`run_backend_acceptance_tests.sh`), and they run again unchanged against the deployed staging stack as the **smoke tests** (`run_smoke_tests_staging.sh`). Staging is configured identically to prod, so that second run is the only one that exercises the real AWS configuration.

The two environments do not behave identically, because **SAM local applies no API Gateway authorizer**. Anything that depends on API Gateway configuration — authentication, authorizer overrides per route, gateway responses — simply does not happen locally.

*  **Branch on the environment inside the test; do not skip the test and do not weaken the assertion.** Use `RunningAgainst.ALocalEnvironmentIsTrue()` / `RunningAgainst.ACloudEnvironmentIsTrue()` (`AcceptanceTests/RunningAgainst.cs`), which read the `ENVIRONMENT` variable (`staging`/`prod` are cloud; anything else, default `dev`, is local). Each branch asserts the behaviour that is *correct for that environment*, so both runs are meaningful.
*  **Write the pair of tests, one per environment**, each returning early in the environment it does not describe, with a comment saying why. The existing example is authentication on an unknown protected path in `InvitesAcceptanceTests`:
	*  `GET_Protected_NonExistentPath_Should_Return_401_Unauthorized` — returns early when `ALocalEnvironmentIsTrue()`, because locally an unknown path returns 404 with no auth check; in the cloud the authorizer rejects the request before routing, so it asserts `401`.
	*  `GET_NonExistentPath_Should_Return_404_NotFound` — the mirror image, returning early when `ACloudEnvironmentIsTrue()`.
*  **Assert `401` for authentication in the cloud branch only.** A test that asserts a protected endpoint rejects an unauthenticated caller is meaningless locally — it would pass for the wrong reason (no authorizer, so 404 or 200), or fail for the wrong reason. Put the `401` expectation behind `ACloudEnvironmentIsTrue()`.
*  **Consequence to plan for: security configuration is only verified by the staging smoke-test run.** When a change adds a protected endpoint, or overrides an authorizer for a specific route, a green local run proves nothing about it. The verification happens when the smoke tests run against staging — so treat that run as a required gate for such changes, not an optional extra.

## The two xUnit traits that decide which backend tests run

The C# backend suite is filtered by **two independent traits**. Neither is decoration: each one is read
by a CI script, so getting one wrong silently changes what a pipeline actually verifies.

| Trait | Where it goes | Who reads it | Effect |
|---|---|---|---|
| `[Trait("Cognito", "Live")]` | on the **individual test** | `run_backend_acceptance_tests.sh`, `run_full_stack_builds_tests_pipeline.sh` — `--filter Cognito!=Live` when the `COGNITO` argument is **absent** | **Excludes** the test from the "no live Cognito" run |
| `[Trait("Environment", "Staging")]` | on the **test class** | `run_smoke_tests_staging.sh` — `--filter "Environment=Staging"` | **Includes** the class in the staging smoke run; everything untagged is skipped there |

They answer different questions, so a test can carry one, both or neither.

### `[Trait("Cognito", "Live")]` — "does this test reach real AWS Cognito?"

Add it to **every individual test** that causes a call to real Cognito, whether the test makes that call
itself or the code under test makes it. There are two ways to reach Cognito, and **the second is the one
that gets missed**.

**1 — Directly: the test itself calls the Cognito SDK.** Authenticating to obtain an id token
(`AdminInitiateAuthAsync`), or reading a user's attributes back to assert on them.

> ⚠️ **`InitializeAsync` counts, and it counts for every test in the class.** A class implementing
> `IAsyncLifetime` gets a **new instance per test**, so a `InitializeAsync` that logs in authenticates
> once per test — every test in that class reaches Cognito, even the ones whose body is a pure
> 405/CORS check. `ClubsAndTournamentsAcceptanceTests` is exactly this shape. The same applies to a
> `DisposeAsync` that re-authenticates in order to clean up.

**2 — Indirectly: the request reaches a lambda that calls Cognito.** Only four lambdas hold a real
`CognitoUsers` (built in `ApiGatewayProxyHandler.cs:61`), and each calls it only on a specific path:

| Route | Cognito call | Reached only when |
|---|---|---|
| `POST /invites` | `RetrieveCognitoUserByEmailId` (`CreateInviteLambda.cs:241`) | `invitee_role` is **`CLUB_MANAGER`** — and only after `ValidateRequestStructure` passes |
| `GET /invites/{id}` | `IsUserRegisteredByEmail` (`GetInviteLambda.cs:28`) | the invite **exists** — a 404 throws before the call |
| `PATCH /invites/{id}` | `RetrieveCognitoUserByEmailId` (`AccepteInviteLambda.cs:51`) | the invite exists **and** is not already accepted |
| `POST /kudos` | `AddLatestKudosDateToActiveSeason` (`CreateKudosLambda.cs:60`) | the authenticated success path |

Those conditions are the whole rule — several tests hit these routes and still never reach Cognito, and
tagging them would wrongly remove them from the no-Cognito run:

*  a `400` test on `POST /invites` with `CLUB_MANAGER`, because validation rejects it **before** the branch;
*  a `GET`/`PATCH`/`DELETE` against a non-existent or already-deleted invite, because the not-found path returns first;
*  a "should be protected" test, because the authorizer rejects the request before the lambda runs.

**Tests that use `FakeCognitoClient` never need the trait.** All Lambda unit tests inject it (a subclass
of `AmazonCognitoIdentityProviderClient` overriding `ListUsersAsync` / `AdminUpdateUserAttributesAsync`),
so nothing leaves the process. Neither do tests of the **static** helpers on `CognitoUsers`
(`ExtractManagedClubs`, `FindConflictingLeagueSeasonEntry`, `ExtractUserClaims`, …) — those are pure
functions and construct no client.

**How to check rather than guess.** Run the tests with deliberately invalid AWS credentials; anything
that truly reaches Cognito fails, and the stack trace names the call site:

```
AWS_ACCESS_KEY_ID=AKIAINVALIDINVALID00 AWS_SECRET_ACCESS_KEY=bogus... AWS_EC2_METADATA_DISABLED=true \
ENVIRONMENT=dev dotnet test "TTLeaguePlayersApp.BackEnd.Tests/TTLeaguePlayersApp.BackEnd.Tests.csproj" \
  --filter "Cognito!=Live"
```

A clean result means the no-Cognito mode is honest. Any failure is a test that needs the trait. Use
`--list-tests` to see what a filter selects without executing anything.

**Why it matters.** An untagged Cognito test makes `--filter Cognito!=Live` a lie: the "local, no live
Cognito" run still calls AWS, so it fails for anyone without credentials or connectivity, and it keeps
consuming the Cognito request quota that the whole point of that mode is to protect.

### `[Trait("Environment", "Staging")]` — "is this test meaningful against a deployed stack?"

Put it on the **class**, not on individual tests. Add it when the class exercises a **real,
environment-configured resource** — the DynamoDB tables selected by `ENVIRONMENT`, the HTTP API, or the
config loader itself. Those are the classes whose result actually changes when pointed at staging, and
`run_smoke_tests_staging.sh` runs **only** them.

Tagged today: the four **acceptance** classes (`ClubsAndTournamentsAcceptanceTests`,
`InvitesAcceptanceTests`, `KudosAcceptanceTests`, `TeamRegistrationsAcceptanceTests`), the four
**DataStore integration** classes (`ClubsAndTournamentsDataTableTest`, `InvitesDataTableTest`,
`InvitesDataTableRetrieveCaptainInvitesTest`, `KudosDataTableTest`), and `LoaderTest`.

**Do not add it to tests that run entirely on fakes** — every `*LambdaTests` class, `CognitoUsersTests`,
`FunctionTest`. They pass or fail identically wherever they run, so including them would lengthen the
smoke run while proving nothing about the deployed stack.

A new test class that talks to DynamoDB or to the API needs this trait, or it will **silently never run
against staging** — and per the section above, staging is the only run that exercises the real API
Gateway authorizer.

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

### Mechanism 2 — Invite tests: Group A (reads Cognito at most, never writes it)

The tests of both groups are in `InvitesAcceptanceTests.cs` and they **never** reset any Cognito user.

#### Group A — Backend acceptance tests that never *write* to Cognito
No static-user reuse concern applies to Group A, because nothing they do leaves state behind. Note the
reason carefully: it is **not** that they never reach Cognito. Several of them do — but only to **read**
(`ListUsers`), and a read accumulates nothing.

Tests for CAPTAIN/PLAYER roles that exercise `POST /invites`, `GET /invites/{id}` or
`DELETE /invites/{id}` (create, read, validation, delete — never the accept step) use throwaway users
that are **not part of the static pool**. Which of those actually reach Cognito:

*  `DELETE /invites/{id}` — **never**. `DeleteInviteLambda` is constructed without a `CognitoUsers` at all.
*  `POST /invites` — **only for `CLUB_MANAGER`**, to check for a conflicting managed club. A CAPTAIN or
   PLAYER create never reaches Cognito.
*  `GET /invites/{id}` — **on every invite that exists**, to set `invitee_already_registered` via
   `IsUserRegisteredByEmail` (`GetInviteLambda.cs:28`). This is a read of the pool, not of a specific
   user's attributes, and it happens regardless of the invite's role. A 404 returns before it.
*  `PATCH /invites/{id}` (accept) — the **only** route that *writes* Cognito attributes, which is why
   Group B below is the one with the reuse risk.

A Create Invite test for CLUB_MANAGER roles reads Cognito at create-time and catches
`UserNotFoundException` to carry on when the invitee is not yet registered — but the **call still
happens**, so the test still depends on Cognito being reachable.

> Because these reads are real calls to AWS, every Group A test that performs one still needs
> `[Trait("Cognito", "Live")]` — see *The two xUnit traits that decide which backend tests run* above.
> Group A is about **write**-state reuse; the trait is about **reachability**. Do not use one to reason
> about the other.

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
| 2 | Group A (reads Cognito at most, never writes it)  | Backend acceptance tests only  |
| 3 | Group B.1 (Captain-Player, fixed key "update attributes" test) / Group B.2 (Club Manager: fixed-key "update attributes" test) | Backend acceptance tests only  |
| 4 | Fresh dynamic `test_<epoch>@delete.me` identities | Frontend e2e only |
| 5 | Mocking `GetUser` to neutralize `latest_kudos` | Frontend e2e only  |


## Reusing a read-only static user, or adding a new one

Every new static user costs something real: a line in `register-test-users.sh`, a line in the
`delete-test-users.sh` exclusion list, one more identity against the **Cognito daily create/delete
quota**, and — because the pipeline calls `register-test-users.sh` **without** `force`, which
creates nothing — a **manual** `delete-test-users.sh <env> force` followed by
`register-test-users.sh <env> force` before the new spec can pass anywhere. That manual step is
invisible to the code-dependency graph: skip it and the new spec fails with a login error that
looks exactly like a code defect.

So do not add one reflexively. Ask the two questions below, in order.

### Question 1 — does the new test WRITE to the Cognito user?

A test writes to Cognito only through the accept-invite path (`PATCH /invites/{id}` →
`CognitoUsers.AddActiveSeason` / the managed-clubs update). Logging in, reading
`custom:active_seasons` / `custom:managed_clubs` from the token, and every DynamoDB-backed call
are all **reads**.

*  **The new test writes** → **add a new user**, unless it can target the identity that already
   exists for this purpose (`test_ready_for_accept_invite_api_call@user.test`). Two specs writing
   the same user's attributes in parallel workers race, and — worse — the idempotent accept path
   makes the second one *pass* against the first one's leftovers. That is Group B's false-success
   risk.
*  **The new test only reads** → go to question 2.

### Question 2 — does the new test collide on the DATA, not the identity?

Sharing a read-only identity is safe: concurrent `InitiateAuth` / `GetUser` calls do not race, and
a read leaves nothing behind. What can still race is the **club, team or record the spec asserts
on**, if another spec writes it.

Check what the candidate user's attributes point at, then grep the other specs for those names.

*  **A club or team the user manages is written by another spec** (kudos awarded to one of its
   teams, tournaments added under it, invites created for it) → either **pick a different club on
   the same user**, or add a new user. Prefer the different club: it is free.
*  **Nothing else writes that data** → **reuse the existing user.** Record the sharing in the
   comment block above that user in `register-test-users.sh`, naming *both* specs, so the next
   reader knows the identity is no longer owned by one spec and that making either spec write
   would now couple them.

### Worked example

`test_my_club_teams_manager@user.test` manages **Walworth** (London) and **Highbury** (Islington).
It is referenced in exactly three places — `MyClubTeams.spec.ts` (login only),
`register-test-users.sh`, `delete-test-users.sh` — and no test accepts an invite as it, so it is
read-only (Mechanism 1). A second read-only spec may therefore share it.

But `KudosAwardAndStanding.spec.ts` awards kudos **to `Walworth Tigers`** and deletes them in
teardown. A spec asserting Walworth's kudos standings would race that parallel worker and pass or
fail depending on scheduling. **Highbury** is written by no spec, so the correct answer is *reuse
the user, assert on Highbury* — not *create a new user*.

### The one thing this criteria cannot protect

Read-only is a property of **current usage**, not of the user. Nothing in the code enforces it, and
`delete-test-users.sh` deliberately spares these identities from the non-`force` cleanup, so state
accumulates for as long as it exists. The moment any spec makes a shared user mutable, every spec
sharing it inherits the Group B risk at once. That is why the sharing must be written down in the
script's comment block rather than left to be rediscovered.

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
- Note this is **not** limited to the tests that log in. A class whose `IAsyncLifetime.InitializeAsync`
  authenticates makes *every* test in it hit Cognito, and a test can reach Cognito purely through the
  lambda it invokes. Both need `[Trait("Cognito", "Live")]`.

**Other Backend C# unit tests (no real Cognito, use fakes — not affected by static-user reuse):**
The remaining tests under
- `TTLeaguePlayersApp.BackEnd.Tests/` — the `*LambdaTests` classes inject `FakeCognitoClient`, and
  `CognitoUsersTests` exercises only the static, pure helpers on `CognitoUsers`.

**Frontend unit tests (Vitest, no real Cognito — not affected by static-user reuse):**
- `TTLeaguePlayersApp.FrontEnd/test/unit/`

**Frontend e2e tests (Playwright, hit real Cognito, use the static pool):**
- `TTLeaguePlayersApp.FrontEnd/test/e2e/`


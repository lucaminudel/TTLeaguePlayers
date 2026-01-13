# Automated Testing Guidelines


## Core Principles
*  **No Implementation Changes:** Never modify the implementation code of the system under test (SUT). Only write or modify test code.
*  **DRY Test Data:** Use the **Builder Pattern** for test data creation to avoid duplication and keep tests readable.
*  **State Cleanup:** When integration testing involves stateful systems (Files, Databases, Auth Services), ensure the state is reverted or cleaned up in the **teardown/cleanup** phase of the test fixture.

## Mocking and Stubbing
*  **Choose your test style:**
	* Use **Stubs** for **State Testing** (verifying the final state or return value).
	* Use **Mocks** for **Interaction Testing** (verifying that specific methods were called).
	* Avoid mixing state and interaction assertions in a single test case.
*  **Contract Verification:** For every mocked interface/API, there must be a corresponding integration test to ensure the mock's behaviour aligns with the real-world system.
*  **Dependency Injection:** Prefer injecting mocks and stubs via the **Constructor**. Avoid framework-specific "magic" or reflection-based overrides unless the SUT architecture strictly requires it.

  
## E2E Testing DRY code
**Action Encapsulation:** To prevent code duplication in the e2e tests for actions repeated in multiple test cases (Login,  NavigateTo..., registerNewUser, etc), organise those actions with a **Fluent Interface** and reuse that code.

**Specialised Flow Abstractions:** The fluent interface creates high-level methods for complex, repeatable scenarios at the business level with actions related to the **business logic**. Those methods are currently organised like the pages, as the current pages mimic the key business concepts. **Lean Page Objects:** keep the Page Objects, that make up the fluent interface, lightweight, with only the key actions and basic verifications for stability. Where other checks are left in the spec.

**Fluent Interface Actions:** These actions in the fluent interface include internal verifications (assertions) to ensure **integrity and stability** and avoid duplication, where the e2e tests will only include one-off verifications specific to that test.
Look at examples the [e2e test file Registration](file:///Users/lucaminudel/Code/TTLeaguePlayers/TTLeaguePlayersApp.FrontEnd/test/e2e/page-objects/RegisterPage.ts) and the main part of the fluent interface used there, the [RegisterPage](file:///Users/lucaminudel/Code/TTLeaguePlayers/TTLeaguePlayersApp.FrontEnd/test/e2e/page-objects/RegisterPage.ts).

*  **General Structure:** Follow a hierarchical chain starting from a `User` actor:
	* Example: `User.Login().NavigateToDashboard().CreateNewInvoice(data);`
	* Every fluent interface action should return the specific page object (where the user currently is, based on the action executed), and from there, the actions available to the user at that point should be exposed by the fluent interface (`User. ... .CreateNewInvoice(data).<actions available from this object>`) 
*  **Navigation actions and Stability** Navigation methods must ensure the target page is fully loaded and stable before returning, for that they will normally include internal verifications on the expected content and state of the page:
	*  **Header Verification**: Always verify the main page header (usually an `h2`) to confirm the correct page was reached.
	*  **Loading States**: Explicitly wait for any page-level loading messages or spinners to become invisible (e.g., `join-loading-message`).
	*  **Optional Verification**: Accept optional parameters in navigation methods to verify the state of the page (e.g., an expected email pre-filled from an invite) before returning the page object.
	*  **Tentative Navigation**: Some tests will validate behaviour in error cases, for example when a navigation will fail or be redirected, for those add "tentative navigation methods" that are like the other navigation methods but without the verification of the expected content and state of the page as for the normal navigation actions.
	*  **Examples**: Look at Navigation examples in [User file](file:///Users/lucaminudel/Code/TTLeaguePlayers/TTLeaguePlayersApp.FrontEnd/test/e2e/page-objects/User.t)
*  **Other actions:**
	*  **Successful actions and Stability**: Default successful actions include verification of the success of the action, for example as the action `registerPage.registerNewUserWithInvite()` does
	*  **Tentative actions**: Tentative actions used for error case tests will not include the verification of the success of the action but only the action itself, as for example the action `registerPage.tentativeRegisterNewUserWithInvite()` does
	*  **No click actions**: To verify the data entry validation, no-click actions are like the tentative actions but without the final click to allow the test inspect the data entry client-side validation errors, as for example the action `registerPage.registerNewUserWithInviteNoClick()` does
	*  **Examples**: Look at the examples just mentioned in [Registration](file:///Users/lucaminudel/Code/TTLeaguePlayers/TTLeaguePlayersApp.FrontEnd/test/e2e/page-objects/RegisterPage.ts).
*  **What not to include:**	
	**Assertion methods**: Don't create assertion methods like `expectEmailValue(val)` or `expectNoErrorMessages` or `expectSuccessfulRegistration`. Instead, perform these assertions directly in the spec file using standard Playwright locators, preferably using data-testids (avoid using fragile CSS selectors or deep XPaths). Assertions on error message content, success notifications, or displayed data - other than those in the Navigation and Successful actions stability verifications - should stay in the spec.

*  **State Persistence (Test Context):** When the UI visualise outuput  that is needed for later steps in that test (e.g., a generated Username or Invoice ID), store this in a central **Test Context** object
*  **Test Context Access:** This data should be accessible via a fluent interface, for example, data from a newly registered user or a newly created invoice could be
	*  assigned like this
		* `var newInvoice = User...CreateNewInvoice(...)`
		* `App.NewInvoice.RememberInvoiceNumber(newInvoice.Number)` 
	*  accessed later like this: `App.NewInvoice.InvoiceNumber`

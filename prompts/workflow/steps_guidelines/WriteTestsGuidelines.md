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
*  **Action Encapsulation:** To prevent code duplication for common actions (Login,  FillForm, etc), and navigation (NavigateToInvoicesPage) use a **Fluent Interface**.
*  **Structure:** Follow a hierarchical chain starting from a `User` actor:
	* Example: `User.Login().NavigateToDashboard().FillInvoiceForm(data).Confirm();`
	* Every fluent interface action should return the specific page object (where the user currently is, based on the action executed), and from each page, the actions available from the fluent interface at that point (`User. ... .FillInvoiceForm(data).<actions available from this object>`) are those available on that page
*  **State Persistence (Test Context):** When the UI visualise outuput  that is needed for later steps in that test (e.g., a generated Username or Invoice ID), store this in a central **Test Context** object
*  **Test Context Access:** This data should be accessible via a fluent interface, for example, data from a newly registered user or a newly created invoice could be
	*  assigned like this
		* `var newInvoice = User...FillNewInvoice(...).Create()`
		* `App.NewInvoice.RememberInvoiceNumber(newInvoice.Number)` 
	*  accessed later like this: `App.NewInvoice.InvoiceNumber`

# TDD Implementation step Guidelines (writing code to make a red test pass)

## Fixing Failing Tests (Red to Green)
*  **Test Integrity:** Never modify the test code to make it pass. Only modify the implementation code of the system under test (SUT) to meet the test's expectations.
	* If you detect a syntax error or a logical flaw in the test itself, stop and notify the user.
*  **Incremental Implementation:** For multi-step tests (e.g., unit or integration tests with multiple assertions, E2E flows with multiple actions):
	1. Identify the *first* failing assertion.
	2. Write the minimum implementation code required to pass that specific assertion.
	3. Proceed to the next failing step only after the previous one is passing.
	4. Repeat 1-2-3 until all the assertions are passing and therefore the test passes completely (Green).

## Refactoring (Green to Clean)
*  **Optimization:** Once the test passes completely (Green), analyze the just generated implementation code for:
	* Code duplication (DRY principle).
	* Complexity reduction (KISS principle).
	* Naming clarity.
*  **Procedure:**
	1. Identify specific refactoring opportunities.
	2. Propose the refactoring steps to the user.
	3. Ensure that after any refactoring, the test suite is re-run to confirm no regressions were introduced.
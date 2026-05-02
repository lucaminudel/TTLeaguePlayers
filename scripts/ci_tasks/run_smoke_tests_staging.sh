#!/bin/bash

# ==============================================================================
# Staging Smoke Tests
# ==============================================================================
ENVIRONMENT="staging"
PROJECT_ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )/../.." && pwd )"
TEST_PROJECT="TTLeaguePlayersApp.BackEnd.Tests/TTLeaguePlayersApp.BackEnd.Tests.csproj"
FRONTEND_DIR="$PROJECT_ROOT/TTLeaguePlayersApp.FrontEnd"

echo "🚀 Starting Staging Smoke Tests"
echo ""

# ==============================================================================
# CLEANUP TRAP
# ==============================================================================
cleanup() {
    echo ""
    echo "🧹 Cleaning up..."
    $PROJECT_ROOT/scripts/cognito/tests_helpers/delete-test-users.sh $ENVIRONMENT
}
trap cleanup EXIT

# ==============================================================================
# SETUP
# ==============================================================================
cd "$PROJECT_ROOT"

echo "🔹 Remember to:"
echo "    1) clean-up the Dynamo Db Tabes"
echo "    2) force delete and re-create the Cognito test users"
echo "🔹 Also check staging env config file for the CreateInviteAutomaticallySendInviteEmail setting (true vs false)."
echo "    "

echo "Press Enter to continue..."
read

echo "    "
echo "🔹 Setting up Cognito test users... "
echo "    "
$PROJECT_ROOT/scripts/cognito/tests_helpers/register-test-users.sh $ENVIRONMENT

# ==============================================================================
# BACKEND TESTS
# ==============================================================================
echo ""
echo "🔹 [1/2] Running backend smoke tests..."
export ENVIRONMENT="$ENVIRONMENT"

dotnet test "$TEST_PROJECT" \
    --filter "Environment=Staging" \
    --configuration Release \
    --logger "console;verbosity=normal"

TEST_EXIT_CODE=$?

if [ "$TEST_EXIT_CODE" -ne 0 ]; then
    echo ""
    echo "❌ Staging smoke tests failed with exit code $TEST_EXIT_CODE"
    exit "$TEST_EXIT_CODE"
fi

echo ""
echo "✅ Backend smoke tests passed!"

# ==============================================================================
# FRONTEND E2E TESTS
# ==============================================================================
echo ""
echo "🔹 [2/2] Running frontend E2E tests (Playwright)..."
cd "$FRONTEND_DIR"

export PW_TEST_HTML_REPORT_OPEN=never
export EXECUTE_LIVE_COGNITO_TESTS=true

npm run "C+ e2e-tests-web:run staging-env"

E2E_EXIT_CODE=$?

if [ "$E2E_EXIT_CODE" -ne 0 ]; then
    echo ""
    echo "❌ Frontend E2E tests failed with exit code $E2E_EXIT_CODE"
    exit "$E2E_EXIT_CODE"
fi

echo ""
echo "✅ Frontend E2E tests passed!"

# ==============================================================================
# SUCCESS
# ==============================================================================
echo ""
echo "🎉 All staging smoke tests passed!"
exit 0

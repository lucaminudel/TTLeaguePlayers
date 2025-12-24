#!/bin/bash

# ==============================================================================
# CONFIGURATION WITH DEFAULTS
# ==============================================================================
# Use arguments provided
PORT=${1}
CONFIG_ENV=${2}
# ==============================================================================
TEST_PROJECT="TTLeaguePlayersApp.BackEnd.Tests/TTLeaguePlayersApp.BackEnd.Tests.csproj"


# Ensure we are in the project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR/.."

# Cleanup function to kill SAM on exit
cleanup() {
    echo ""
    echo "🧹 Cleaning up..."
    if [ ! -z "$SAM_PID" ]; then
        echo "Stopping SAM Local (PID: $SAM_PID)..."
        kill "$SAM_PID" 2>/dev/null
    fi
}

# Trap signals for cleanup
trap cleanup EXIT

# Start SAM Local API in the background, redirecting logs to a file to keep the terminal clean
SAM_LOG_FILE="scripts/sam_local_test.log"
echo "📝 Redirecting SAM logs to $SAM_LOG_FILE (check this file if tests fail to connect)"
sam local start-api --config-env "$CONFIG_ENV" --port "$PORT" > "$SAM_LOG_FILE" 2>&1 &
SAM_PID=$!

# Wait for SAM to be ready
echo "⏳ Waiting for SAM Local to be ready on port $PORT..."
MAX_RETRIES=30
RETRY_COUNT=0
until curl -s "http://127.0.0.1:$PORT/" > /dev/null || [ "$RETRY_COUNT" -eq "$MAX_RETRIES" ]; do
    sleep 1
    RETRY_COUNT=$((RETRY_COUNT+1))
    printf "."
done

if [ "$RETRY_COUNT" -eq "$MAX_RETRIES" ]; then
    echo "❌ SAM Local failed to start in time."
    exit 1
fi

echo ""
echo "✅ SAM Local is ready!"

echo "🧪 Building and Running Tests..."
# ENVIRONMENT is local to this script's process and its children
export ENVIRONMENT="$CONFIG_ENV"
dotnet test "$TEST_PROJECT" --configuration Debug --logger "console;verbosity=normal"

TEST_EXIT_CODE=$?

if [ "$TEST_EXIT_CODE" -eq 0 ]; then
    echo "🎉 Tests passed!"
else
    echo "❌ Tests failed with exit code $TEST_EXIT_CODE"
fi

exit "$TEST_EXIT_CODE"

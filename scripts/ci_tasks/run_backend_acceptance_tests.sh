#!/bin/bash

# ==============================================================================
# CONFIGURATION WITH DEFAULTS
# ==============================================================================
# Use arguments provided
PORT=${1}
CONFIG_ENV=${2}
# ==============================================================================
TEST_PROJECT="TTLeaguePlayersApp.BackEnd.Tests/TTLeaguePlayersApp.BackEnd.Tests.csproj"
BUILD_DIR=".aws-sam-test"


# Ensure we are in the project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR/../.."

# Cleanup function to kill SAM on exit
cleanup() {
    echo ""
    echo "🧹 Cleaning up..."
    # Only kill SAM if we started it (SAM_PID is set)
    if [ ! -z "$SAM_PID" ]; then
        echo "Stopping SAM Local (PID: $SAM_PID)..."
        kill "$SAM_PID" 2>/dev/null || true
        # Give SAM a moment to clean up containers
        sleep 2
    fi

    # Aggressive Cleanup: Stop any lingering Lambda containers for this project mount
    LINGERING_CONTAINERS=$(docker ps -q --filter "volume=$SCRIPT_DIR/../$BUILD_DIR")
    if [ ! -z "$LINGERING_CONTAINERS" ]; then
        echo "Stopping lingering Docker containers..."
        docker stop $LINGERING_CONTAINERS 2>/dev/null || true
    fi
}

# Trap signals for cleanup
trap cleanup EXIT

# Build the project to ensure we are testing the latest code
echo "🏗️ Building SAM project..."
mkdir -p "$BUILD_DIR"
sam build --config-env "$CONFIG_ENV" --cached --build-dir "$BUILD_DIR"
if [ $? -ne 0 ]; then
    echo "❌ SAM build failed."
    exit 1
fi

# ROBUST SYNC CHECK:
echo "⏳ Verifying Docker filesystem sync..."
MAX_SYNC_RETRIES=20
sync_count=0
ABS_BUILD_DIR="$(pwd)/$BUILD_DIR"
until docker run --rm -v "$ABS_BUILD_DIR:/test-mount" alpine ls /test-mount > /dev/null 2>&1 || [ "$sync_count" -eq "$MAX_SYNC_RETRIES" ]; do
    sleep 1
    sync_count=$((sync_count+1))
    printf "."
done
echo ""

if [ "$sync_count" -eq "$MAX_SYNC_RETRIES" ]; then
    echo "❌ Docker failed to sync the build directory."
    exit 1
fi
echo "✅ Docker sync is ready."

# Check if SAM is already running
SAM_ALREADY_RUNNING=false
if lsof -i ":$PORT" >/dev/null; then
    echo "⚠️  Port $PORT is already in use. Assuming SAM is running externally."
    SAM_ALREADY_RUNNING=true
else
    # Start SAM Local API in the background, redirecting logs to a file to keep the terminal clean
    SAM_LOG_FILE="scripts/ci_tasks/sam_local_test.log"
    echo "📝 Redirecting SAM logs to $SAM_LOG_FILE (check this file if tests fail to connect)"
    ABS_TEMPLATE="$(pwd)/$BUILD_DIR/template.yaml"
    sam local start-api --config-env "$CONFIG_ENV" --port "$PORT" -t "$ABS_TEMPLATE" > "$SAM_LOG_FILE" 2>&1 &
    SAM_PID=$!
fi

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

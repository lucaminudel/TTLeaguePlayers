#!/bin/bash
set -e

# ==============================================================================
# CONFIGURATION (Strictly for Test Environment)
# ==============================================================================
ENVIRONMENT="test"
API_PORT="3003"
WEB_PORT="4173"

if [ -z "${1}" ]; then
    EXECUTE_LIVE_COGNITO_TESTS=false
else    
    EXECUTE_LIVE_COGNITO_TESTS=true
fi

PROJECT_ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )/../.." && pwd )"
BACKEND_TEST_PROJECT="TTLeaguePlayersApp.BackEnd.Tests/TTLeaguePlayersApp.BackEnd.Tests.csproj"
FRONTEND_DIR="$PROJECT_ROOT/TTLeaguePlayersApp.FrontEnd"
BUILD_DIR=".aws-sam-test"

# Colors for output
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo "🚀 Starting Full Stack Test Pipeline (Environment: $ENVIRONMENT)"
echo "   API Port: $API_PORT"
echo "   Web Port: $WEB_PORT"
echo "   Execute Cognito Tests: $EXECUTE_LIVE_COGNITO_TESTS"
echo ""

# ==============================================================================
# CLEANUP TRAP
# ==============================================================================
cleanup() {
    echo ""
    echo "🧹 Cleaning up..."
    
    if [ "$EXECUTE_LIVE_COGNITO_TESTS" = "true" ]; then
        # Cognito test users cleanup
        $PROJECT_ROOT/scripts/cognito/tests_helpers/delete-test-users.sh $ENVIRONMENT
    else
        echo "No Live Cognito cleanup..."
    fi

    if [ ! -z "$SAM_PID" ]; then
        echo "   Stopping SAM Local (PID: $SAM_PID)..."
        kill "$SAM_PID" 2>/dev/null || true
        # Give SAM a moment to clean up containers
        sleep 2
    fi

    # Aggressive Cleanup: Stop any lingering Lambda containers for this project
    # We look for containers mounting our specific build directory
    LINGERING_CONTAINERS=$(docker ps -q --filter "volume=$PROJECT_ROOT/$BUILD_DIR")
    if [ ! -z "$LINGERING_CONTAINERS" ]; then
        echo "   Stopping lingering Docker containers..."
        docker stop $LINGERING_CONTAINERS 2>/dev/null || true
    fi

    if [ ! -z "$WEB_PID" ]; then
        echo "   Stopping Web Server (PID: $WEB_PID)..."
        kill "$WEB_PID" 2>/dev/null || true
    fi
}
trap cleanup EXIT

# ==============================================================================
# 1. BUILD PHASE
# ==============================================================================
echo -e "${CYAN}# ------------------------------------------------------------------------------------------------------------${NC}"
echo "🔹 [1/8] Backend: Build..."
echo -e "${CYAN}# ------------------------------------------------------------------------------------------------------------${NC}"
echo ""
cd "$PROJECT_ROOT"
dotnet build "$BACKEND_TEST_PROJECT" --configuration Debug
if [ $? -ne 0 ]; then
    echo "   ❌ Backend: Build failed."
    exit 1
fi

echo ""
echo -e "${CYAN}# ------------------------------------------------------------------------------------------------------------${NC}"
echo "🔹 [2/8] Frontend: Build & Lint..."
echo -e "${CYAN}# ------------------------------------------------------------------------------------------------------------${NC}"
echo ""

cd "$FRONTEND_DIR"
# build-web:test-env includes copy-config and lint
npm run build-web:test-env

rc=$?
echo "   Debug: Exit code was $rc"

if [ $rc -ne 0 ]; then
    echo "   ❌ Frontend: Build & Lint failed."
    exit 1
fi

echo ""
echo -e "${CYAN}# ------------------------------------------------------------------------------------------------------------${NC}"
echo "🔹 [3/8] Backend: local SAM Building..."
echo -e "${CYAN}# ------------------------------------------------------------------------------------------------------------${NC}"
echo ""

cd "$PROJECT_ROOT"

# Ensure directory exists before building
mkdir -p "$BUILD_DIR"

sam build --config-env "$ENVIRONMENT" --cached --build-dir "$BUILD_DIR"

# ROBUST SYNC CHECK:
# Instead of just sleeping, we wait until Docker can actually see the folder.
# This prevents the "mkdir /host_mnt/...: no such file or directory" error.
echo "   ⏳ Verifying Docker filesystem sync..."
MAX_SYNC_RETRIES=20
sync_count=0
# Pass the absolute path to ensure mount works correctly in the check
ABS_BUILD_DIR="$(pwd)/$BUILD_DIR"
until docker run --rm -v "$ABS_BUILD_DIR:/test-mount" alpine ls /test-mount > /dev/null 2>&1 || [ $sync_count -eq $MAX_SYNC_RETRIES ]; do
    sleep 1
    sync_count=$((sync_count+1))
    printf "."
done
echo ""

if [ $sync_count -eq $MAX_SYNC_RETRIES ]; then
    echo "   ❌ Docker failed to sync the build directory in time. Check Docker Desktop settings."
    exit 1
fi
echo "   ✅ Docker sync is ready."

# ==============================================================================
# 2. BACKEND TEST PHASE
# ==============================================================================

echo ""
echo -e "${CYAN}# ------------------------------------------------------------------------------------------------------------${NC}"
echo "🔹 [4/8] Starting SAM Local API..."
echo -e "${CYAN}# ------------------------------------------------------------------------------------------------------------${NC}"
echo ""

cd "$PROJECT_ROOT"
# Check if port is already in use
if lsof -i ":$API_PORT" >/dev/null; then
    echo "   ⚠️  Port $API_PORT is in use. Assuming external SAM instance."
    # We do NOT start SAM, and we do NOT set SAM_PID (so cleanup won't kill it)
else
    LOG_FILE="scripts/ci_tasks/sam_local_fullstack.log"
    echo "   📝 Logs: $LOG_FILE"
    sam local start-api --config-env "$ENVIRONMENT" --port "$API_PORT"  > "$LOG_FILE" 2>&1 &
    SAM_PID=$!
    
    # Wait for SAM
    echo "   ⏳ Waiting for API on port $API_PORT..."
    MAX_RETRIES=30
    count=0
    until curl -s "http://127.0.0.1:$API_PORT/" > /dev/null || [ $count -eq $MAX_RETRIES ]; do
        sleep 1
        count=$((count+1))
        printf "."
    done
    echo ""
    if [ $count -eq $MAX_RETRIES ]; then
        echo "   ❌ SAM failed to start."
        exit 1
    fi
    echo "   ✅ API is ready."
fi

echo ""
echo -e "${CYAN}# ------------------------------------------------------------------------------------------------------------${NC}"
echo "🔹 [5/8] Backend: Unit - Integration - Acceptance Tests..."
echo -e "${CYAN}# ------------------------------------------------------------------------------------------------------------${NC}"
echo ""

if [ "$EXECUTE_LIVE_COGNITO_TESTS" = "true" ]; then
    # Cognito test users setup, for C# Acceptance Teste and  Playwright E2E Tests
    $PROJECT_ROOT/scripts/cognito/tests_helpers/register-test-users.sh $ENVIRONMENT
else
    echo "No Live Cognito setup..."
fi


# Export environment for the C# tests to read (Process.GetEnvironmentVariable)
export ENVIRONMENT="$ENVIRONMENT"

if [ "$EXECUTE_LIVE_COGNITO_TESTS" = "true" ]; then
    FILTER=""
else
    echo "Excluding Live Cognito tests..."
    FILTER="--filter Cognito!=Live"
fi
dotnet test "$BACKEND_TEST_PROJECT" $FILTER --configuration Debug --no-build --logger "console;verbosity=minimal" 

rc=$?
echo "   Debug: Exit code was $rc"

if [ $rc -ne 0 ]; then
    echo "   ❌ Backend: Acceptance Tests failed."
    exit 1
fi

# ==============================================================================
# 3. FRONTEND TEST PHASE
# ==============================================================================
echo ""
cd "$FRONTEND_DIR"

echo -e "${CYAN}# ------------------------------------------------------------------------------------------------------------${NC}"
echo "🔹 [6/8] Frontend: Unit Tests..."
echo -e "${CYAN}# ------------------------------------------------------------------------------------------------------------${NC}"
npm run unit-tests-web:run

rc=$?
echo "   Debug: Exit code was $rc"

if [ $rc -ne 0 ]; then
    echo "   ❌ Frontend: Unit Tests failed."
    exit 1
fi

echo -e "${CYAN}# ------------------------------------------------------------------------------------------------------------${NC}"
echo "🔹 [7/8] Frontend: Starting Web Server..."
echo -e "${CYAN}# ------------------------------------------------------------------------------------------------------------${NC}"
# Start the preview server for the built artifacts
# Note: "npm run run-web:test-env" usually runs "vite" (dev server). 
# For a "reliable build check", running "vite preview" on the build output is often better,
# BUT the user requested "start the web server for test (as in task.json)".
# task.json "run-web:test-env" -> "npm run copy-config && cross-env ENVIRONMENT=test vite --port 4173"
# This is a dev server. We will stick to the user's request to use the script from package.json.
npm run run-web:test-env -- --host > /dev/null 2>&1 &
WEB_PID=$!

# Wait for Web Server
echo "   ⏳ Waiting for Web Server on port $WEB_PORT..."
MAX_RETRIES=30
count=0
until curl -s "http://localhost:$WEB_PORT/" > /dev/null || [ $count -eq $MAX_RETRIES ]; do
    sleep 1
    count=$((count+1))
    printf "."
done
echo ""
if [ $count -eq $MAX_RETRIES ]; then
    echo "   ❌ Web server failed to start."
    exit 1
fi
echo "   ✅ Web server is ready."

echo -e "${CYAN}# ------------------------------------------------------------------------------------------------------------${NC}"
echo "🔹 [8/8] Frontend: Running E2E Tests (Playwright)..."
echo -e "${CYAN}# ------------------------------------------------------------------------------------------------------------${NC}"

# The package.json script "e2e-tests-web:run test-env" sets PORT=4173
export PW_TEST_HTML_REPORT_OPEN=never
export EXECUTE_LIVE_COGNITO_TESTS
npm run "e2e-tests-web:run test-env"

rc=$?
echo "   Debug: Exit code was $rc"

if [ $rc -ne 0 ]; then
    echo "   ❌ Frontend: E2E Tests (Playwright) failed."
    exit 1
fi

echo ""
echo "# ============================================================================================================"
echo "# ============================================================================================================"
echo "🎉 ALL TESTS PASSED SUCCESSFULLY!"
echo "# ============================================================================================================"
echo "# ============================================================================================================"

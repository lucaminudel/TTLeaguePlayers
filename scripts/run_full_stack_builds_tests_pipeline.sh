#!/bin/bash
set -e

# ==============================================================================
# CONFIGURATION (Strictly for Test Environment)
# ==============================================================================
ENVIRONMENT="test"
API_PORT="3003"
WEB_PORT="4173"

PROJECT_ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
BACKEND_TEST_PROJECT="TTLeaguePlayersApp.BackEnd.Tests/TTLeaguePlayersApp.BackEnd.Tests.csproj"
FRONTEND_DIR="$PROJECT_ROOT/TTLeaguePlayersApp.FrontEnd"
BUILD_DIR=".aws-sam-test"

# Colors for output
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo "🚀 Starting Full Stack Test Pipeline (Environment: $ENVIRONMENT)"
echo "   API Port: $API_PORT"
echo "   Web Port: $WEB_PORT"
echo ""

# ==============================================================================
# CLEANUP TRAP
# ==============================================================================
cleanup() {
    echo ""
    echo "🧹 Cleaning up..."
    
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
# 1. BACKEND PHASE
# ==============================================================================
echo -e "${CYAN}# ------------------------------------------------------------------------------------------------------------${NC}"
echo "🔹 [1/7] Building Backend (SAM)..."
echo -e "${CYAN}# ------------------------------------------------------------------------------------------------------------${NC}"
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

echo -e "${CYAN}# ------------------------------------------------------------------------------------------------------------${NC}"
echo "🔹 [2/7] Starting SAM Local API..."
echo -e "${CYAN}# ------------------------------------------------------------------------------------------------------------${NC}"
# Check if port is already in use
if lsof -i ":$API_PORT" >/dev/null; then
    echo "   ⚠️  Port $API_PORT is in use. Assuming external SAM instance."
    # We do NOT start SAM, and we do NOT set SAM_PID (so cleanup won't kill it)
else
    LOG_FILE="scripts/sam_local_fullstack.log"
    echo "   📝 Logs: $LOG_FILE"
    # Use absolute path for template to help Docker find the mount source
    ABS_TEMPLATE="$(pwd)/$BUILD_DIR/template.yaml"
    sam local start-api --config-env "$ENVIRONMENT" --port "$API_PORT" -t "$ABS_TEMPLATE" > "$LOG_FILE" 2>&1 &
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

echo -e "${CYAN}# ------------------------------------------------------------------------------------------------------------${NC}"
echo "🔹 [3/7] Running Backend Build + Acceptance Tests..."
echo -e "${CYAN}# ------------------------------------------------------------------------------------------------------------${NC}"
# Export environment for the C# tests to read (Process.GetEnvironmentVariable)
export ENVIRONMENT="$ENVIRONMENT"
dotnet test "$BACKEND_TEST_PROJECT" --configuration Debug --logger "console;verbosity=minimal"

# ==============================================================================
# 2. FRONTEND PHASE
# ==============================================================================
echo ""
echo -e "${CYAN}# ------------------------------------------------------------------------------------------------------------${NC}"
echo "🔹 [4/7] Frontend: Build & Lint..."
echo -e "${CYAN}# ------------------------------------------------------------------------------------------------------------${NC}"
cd "$FRONTEND_DIR"
# build-web:test-env includes copy-config
npm run build-web:test-env
npm run lint

echo -e "${CYAN}# ------------------------------------------------------------------------------------------------------------${NC}"
echo "🔹 [5/7] Frontend: Unit Tests..."
echo -e "${CYAN}# ------------------------------------------------------------------------------------------------------------${NC}"
npm run unit-tests-web:run

echo -e "${CYAN}# ------------------------------------------------------------------------------------------------------------${NC}"
echo "🔹 [6/7] Frontend: Starting Web Server..."
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
echo "🔹 [7/7] Frontend: Running E2E Tests (Playwright)..."
echo -e "${CYAN}# ------------------------------------------------------------------------------------------------------------${NC}"
# The package.json script "e2e-tests-web:run test-env" sets PORT=4173
npm run "e2e-tests-web:run test-env"

echo ""
echo "# ============================================================================================================"
echo "# ============================================================================================================"
echo "🎉 ALL TESTS PASSED SUCCESSFULLY!"
echo "# ============================================================================================================"
echo "# ============================================================================================================"

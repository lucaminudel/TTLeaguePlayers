#!/usr/bin/env bash
set -euo pipefail

# VS Code coreclr pipeTransport wrapper.
# It auto-detects the SAM Lambda container currently exposing the debug port
# and then runs the debugger command inside it.
#
# VS Code will call this script like:
#   sam_docker_exec_pipe.sh "/tmp/.../vsdbg --interpreter=vscode"
# (sometimes as a single arg string), so we treat all args as a command line.

DEBUG_PORT="${SAM_DEBUG_PORT:-5858}"
DEBUGGER_ARCH="${SAM_DEBUGGER_ARCH:-}"

# Find container exposing the debug port.
# publish filter matches host published ports.
CID_LIST=$(docker ps -q --filter "publish=${DEBUG_PORT}" | tr '\n' ' ' | xargs || true)

if [[ -z "${CID_LIST}" ]]; then
  echo "No running Docker container found publishing port ${DEBUG_PORT}." >&2
  echo "Hint: start SAM with --debug-port ${DEBUG_PORT} and invoke an endpoint to create the container." >&2
  exit 2
fi

# If multiple, pick the first deterministically.
CID=$(echo "${CID_LIST}" | awk '{print $1}')

# Compose command to run inside container.
# CoreCLR sometimes passes debuggerPath+args as one string, so use shell -lc.
CMD="$*"
if [[ -z "${CMD}" ]]; then
  echo "No debugger command provided to pipe wrapper." >&2
  exit 3
fi

exec docker exec -i "${CID}" /bin/sh -lc "${CMD}"

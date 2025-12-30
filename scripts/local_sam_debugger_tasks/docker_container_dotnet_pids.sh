#!/usr/bin/env bash
set -euo pipefail

DEBUG_PORT="${SAM_DEBUG_PORT:-5858}"

CID=$(docker ps -q --filter "publish=${DEBUG_PORT}" | head -n 1 || true)
if [[ -z "${CID}" ]]; then
  echo "No running Docker container found publishing port ${DEBUG_PORT}." >&2
  echo "Hint: invoke the API once so SAM creates the container and waits for debugger." >&2
  exit 2
fi

echo "Container: ${CID}"
echo

docker exec -w / "${CID}" /bin/sh -lc '
  for proc in /proc/[0-9]*; do
    pid="${proc##*/}"

    cmd="$(tr "\0" " " < "${proc}/cmdline" 2>/dev/null || true)"
    [ -n "$cmd" ] || continue

    echo "$cmd" | grep -q dotnet || continue

    # Filter out this scripts own shell process (it contains our heredoc text)
    echo "$cmd" | grep -q "/bin/sh -lc" && continue

    marker=""
    echo "$cmd" | grep -q "Amazon.Lambda.RuntimeSupport" && marker=" <== likely handler"
    echo "$cmd" | grep -q "TTLeaguePlayersApp.BackEnd" && marker=" <== likely handler"

    echo "PID=${pid}${marker}"
    echo "  ${cmd}"
    echo
  done
'

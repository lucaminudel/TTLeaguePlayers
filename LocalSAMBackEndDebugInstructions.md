# Local SAM BackEnd Debug Instructions

## One-time machine setup (do once per Mac)

### 1) Install the correct vsdbg for local SAM on M1 (Linux arm64)

Manual (one-time):
 curl -sSL https://aka.ms/getvsdbgsh | bash /dev/stdin -v latest -l ~/.vsdbg_linux_arm64 -r linux-arm64

Why: SAM runs a Linux arm64 container; macOS vsdbg or linux-x64 will not work.
Status: manual, not scripted in repo.

## Repo configuration (commit once; already done in this repo)

### 2) template.yaml environment-specific parameters

template.yaml parameters (via samconfig.tolm per enviroment, see below) for dev environment:

 • LambdaArchitecture (dev uses arm64)
 • DotnetBuildConfiguration (dev uses Debug)

Status: in template.yaml (committed change).

### 3) samconfig.toml per-environment overrides

 • dev: LambdaArchitecture=arm64, DotnetBuildConfiguration=Debug
 • test/staging/prod: x86_64 + Release

Status: in samconfig.toml (committed change).

### 4) VS Code attach configuration + helper scripts

 • .vscode/launch.json contains attach configs that use:
    • /tmp/lambci_debug_files/vsdbg
    • /bin/sh -lc so docker doesn’t treat "vsdbg --interpreter=vscode" as one filename
 • Scripts:
    • scripts/local_sam_debug/docker_exec_pipe.sh (pipe wrapper: actually runs vsdbg in the container)
    • scripts/local_sam_debug/docker_container_dotnet_pids.sh (helper: prints dotnet PID + cmdline, marks “likely
      handler”)

Status: in repo (automated by scripts + launch config).



## Repeat only when Docker images/containers are deleted (occasional)

### 5) If you delete Docker images, SAM may need to repull/rebuild

Typically automatic (SAM/Docker will pull), but may be slow. If you want to pre-pull manually:

 docker pull public.ecr.aws/lambda/dotnet:8-arm64
 docker pull public.ecr.aws/lambda/dotnet:8-rapid-arm64


Status: manual optional. Not required unless you cleaned images and pulls are slow.

### 6) If you delete/recreate containers, you must re-trigger an invocation

Because the debug container doesn’t exist until the Lambda is invoked at least once.

Status: manual step (curl). Not “scripted”, but easy.

## Every debugging session workflow (day-to-day)

### A) Build (repeat after code changes)

Manual CLI (recommended):

 sam build --config-env dev

Notes:

 • You do not need sam build --debug routinely.
 • --debug is just SAM verbose logging.
 • The build configuration (Debug vs Release) comes from DotnetBuildConfiguration parameter for dev.

Status: currently manual, but you can add a VS Code task for it if you want.

### B) Start SAM locally in debug/attach mode

You can start it via VS Code Task (already added):

 • VS Code → Terminal → Run Task…
    • sam-local-dev (attach debugger)

That runs (automated in .vscode/tasks.json):

 • port 3000
 • debug-port 5858
 • debugger-path ~/.vsdbg_linux_arm64
 • --debug
 • --warm-containers LAZY
 • SAM_CLI_CONTAINER_CONNECTION_TIMEOUT=120

Status: automated in VS Code task. **IMPORTANT, STOP ANY OTHER DOCKER CONTAINER ALREADY RUNNING ON PORT 3000 BEFORE THIS**

### C) Trigger the Lambda once so it pauses waiting for debugger

Manual:

 curl http://127.0.0.1:3000/invites/ --max-time 5 || true


Expected: request hangs/times out because SAM prints “Waiting for the debugger to attach…”.

Status: manual.

### D) Discover the correct dotnet PID (because it can change each run)

Manual, but scripted helper:

 ./scripts/local_sam_debug/docker_container_dotnet_pids.sh

Pick the PID that is marked “likely handler” and whose cmdline includes: Amazon.Lambda.RuntimeSupport.dll ...
TTLeaguePlayersApp.BackEnd::...::Dispatch

Status: scripted helper, you run it manually.

### E) Attach debugger from VS Code

In VS Code:

 • Run the debug configuration that uses docker_exec_pipe.sh (your “SAM CLI - Dev: Attach debugger (to local docker
   exec)” style config)
 • Paste the PID from step D when prompted

Status: IDE action.

### F) Invoke again to hit breakpoints

Manual:

 curl http://127.0.0.1:3000/invites/

Now breakpoints should hit.

Status: manual.
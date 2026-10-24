---
name: coding-task-inception
description: Turn a coding task brief into a researched, questioned, confirmed and persisted implementation plan before any code is written. Use when the user says "Coding Task Inception".
model: opus
effort: high
allowed-tools: Bash(cat:*), Bash(ls:*), Bash(head:*), Bash(tail:*), Bash(wc:*), Bash(grep:*), Bash(sed -n:*), Bash(git show:*), Bash(git log:*), Bash(git status:*), Bash(git diff:*), SendUserFile
---
# Coding Task Inception

## Session name — at the start

At skill entry, name the current chat `Inception — <existing topic>`. Remove any leading
`Discovery`, `Inception`, `Execution` or `Review` phase prefix followed by `—`, `–`, `-` or `:`
(case-insensitive), then add this skill's prefix once. Preserve the rest of the title; never stack
phase prefixes. If no topic remains, use a short topic from the user's task and refine it once clear.

- **Codex:** read the current chat title from host metadata (use `list_threads` if needed), then
  call `set_thread_title` with the new title. Omit `threadId` to rename the current chat only.
- **Claude Code:** use the current `${CLAUDE_SESSION_ID}`, not the most recently modified session.
  With the installed Claude Agent SDK, read `get_session_info(session_id, directory=project_root)`
  and take `custom_title` or `summary`; call
  `rename_session(session_id, new_title, directory=project_root)` and read back to verify.
  The TypeScript equivalents are `getSessionInfo` and `renameSession`. Do not try to execute
  `/rename` as a shell command or edit transcript files directly.

Do not rename another chat or change project membership. If the current session cannot be identified
or the required tool/SDK is unavailable, report the naming limitation briefly and continue the task;
do not install dependencies or add hooks just to rename it.


## Orchestration rules — read first

Before starting Phase 1, read the shared orchestration guidance in full. Use the
reference for your environment below; resolve the relative link against this `SKILL.md`.
Apply the phase-specific rules throughout this workflow.

```!
cat ${CLAUDE_PROJECT_DIR}/.claude/skills/shared/orchestration.md
```

Read the shared orchestration guidance at [../shared/orchestration.md](../shared/orchestration.md).

An nine-phase protocol for the TTLeaguePlayers repo. The output is a **confirmed, persisted plan**,
not code. Write no application code during phases 1–8.

## Phase 1 — Receive the general information

The user supplies background and references. Read every file they name, in full. Hold it; do not
act on it yet.

Read also the Discovery findings report persisted by the previous step, `coding-task-discovery`, at
`~/.claude/projects/-Users-lucaminudel-Code-TTLeaguePlayers/coding-tasks/<slug>/discovery.md`.
List the `coding-tasks/` directory to find the slug rather than guessing it: one match, use it;
several, ask the user which; none, say so. It carries
the framing, the domain concepts, the technical implementation details, the contradictions found,
and the open questions it deliberately left for this phase. If it does not exist, say so and ask
whether to run discovery first or proceed without it.

### Codex-specific retrieval

In Codex, resolve the task state by inspecting `.codex/coding-tasks/` and reusing the matching
`task.md`. Read the Discovery report from `.codex/coding-tasks/<task-slug>/discovery.md`. If several
task directories match, ask the user which one; if none matches, report that Discovery has not been
completed rather than guessing a path.

Always read, whether or not they are named:
- `prompts/codebase_info/ArchitectureAndTechStack.md` — stack, environments, known debt
- The `prompts/codebase_info/*DomainLogic.md` covering the touched area
- `prompts/workflow/instructions/` — verification commands, local SAM debug
- `prompts/workflow/steps_guidelines/` — testing and red-test guidelines

If the user asks a question mid-brief, answer it, but do not start planning.

## Phase 2 — Receive the specification

What to implement, constraints, quality criteria, example files, how to verify. Do not push back
yet; collect everything, then note conflicts for phase 5.

A gap you find between the user's brief and the Discovery findings report is a topic for phase 5.

## Phase 3 — Research

The most valuable phase. Budget real effort here — every plan defect in practice traced back to
research skipped, not to poor planning.

**Verify external data sources live.** If the task scrapes or calls an external site, fetch the
actual pages with `curl` into the scratchpad and parse them before planning. Confirm the user's
expected test data against reality. This routinely surfaces things absent from the brief — relative
vs absolute URLs, extra columns, HTML-entity encoding, pagination.

**Trace every consumer of every file you will change.** Config files under `config/` are read by
both the frontend (`src/config/environment.ts`, injected by Vite) *and* the C# backend
(`TTLeaguePlayersApp.BackEnd/TTLeaguePlayersApp.BackEnd.Configuration.DataStore/Loader.cs`). Confirm
behaviour by reading the code, then still verify by running tests — never assert "this won't break
it" from reasoning alone.

**Follow the call chain to the real consumer.** A method added to an interface is unreachable if a
decorator or wrapper between the factory and the caller does not forward it. Trace from the caller
to the concrete class through every layer before believing a method is reachable — the repo already
contains dead ends of exactly that kind.

**Check whether the design is already written down.** The `codebase_info` docs sometimes specify
intended structure that the code has not grown yet — including inside mermaid diagrams. Read them
before proposing architecture; you may be re-deriving a decision already made.

## Phase 4 — Build the plan

Create sub-tasks with `TaskCreate`, then wire dependencies with `TaskUpdate` `addBlockedBy`. Each
task's description must be self-contained: exact file paths, verified selectors, expected values,
and *why* — a future agent reads the description, not this conversation.

**Analyse parallel execution across the whole dependency graph.** Identify the initial tasks with
no blockers and every later group that can become ready together, not only the first ready set.
Check both dependencies and file ownership: tasks that would write the same file or shared mutable
fixture must be split into disjoint ownership or ordered explicitly. Record the parallel groups,
their prerequisites, and their file boundaries in the plan. Where the graph is a chain, state that
execution is serial and why; do not manufacture parallelism.

Treat review checkpoints and verification tiers as synchronization barriers: record which tasks
must finish before each barrier and which may start after it. Lint, build and test commands run
serially under the main agent, after drafting in the affected files has stopped. Planning parallel
execution does not require spawning implementation agents during Inception.

**Check the order against real-world sequencing, not only code dependencies.** A graph that is
correct about what compiles after what can still be wrong about what must *happen* after what —
deploy ordering, schema before data, a migration before the tests that read the migrated rows, a
write-path change before the backfill that depends on it. Those constraints usually live in a README
or a script header rather than in the code, so re-read the ones you cited in research and walk the
task order against them before presenting.

Sequence verification as **two tiers**, never one:
- a fast inner loop on the dev environment, reusing the already-running local web server and SAM
- one authoritative final run of the full pipeline on the test environment

Offer **review checkpoints** — explicit stop-and-hand-back tasks where the user inspects the shape
before the next layer goes on. Place each one at a state that compiles and runs; if the dependency
order prevents that, say so and propose the split that fixes it rather than parking the user in
front of a half-wired tree.

## Phase 5 — Question the gaps

Use `AskUserQuestion` with a recommendation as the first option and a concrete `preview` snippet
showing what each choice looks like in code. Every question must change what you build — if a
sensible default exists, take it and state it as an assumption instead.

State your remaining assumptions explicitly, so silence counts as agreement.

**Treat the spec's implementation directives as provisional.** The brief may name the interface and
class to modify. If research says otherwise, present the trade-off with costs, flag the divergence
from what they wrote, and get explicit confirmation. Do not silently comply, and do not silently
deviate.

## Phase 6 — Review the plan for completeness
Double-ckeck the plan decisions and sub-tasks making sure they are sufficiently detailed and have all the information required for  the agent to implement the plan-subtasks minimising the interruptions such as additional asks or reviews that need to be presented to the user.

Where you can anticipate a gap and a missing information or a decision or a confirmation required, bridge the gap now with the user so the plan execution will have much much less interruptions

Walk the sub-task list and list every point where the executing agent would have to stop: a
permission gate, an unverified precondition, a detail left to judgement. Close and document each one now.


**Check the execution graph for completeness.** Walk the initial ready set and each later ready
set against the actual blockers, file boundaries and real-world sequencing constraints. Confirm
that every safe parallel opportunity is recorded, each conflicting write is ordered, and every
review or verification barrier blocks the appropriate successors. Check that the graph is acyclic
and that every task can eventually become ready. Explain any intentionally serial group. Resolve
missing ownership or dependencies before presenting the plan.

## Phase 7 — Present, amend, confirm, persist

Present the full plan as a table: number, sub-task, blocked-by. Include the parallel execution
groups, file ownership, and synchronization barriers. Add files created vs modified,
decisions locked in, assumptions, and anything you would flag as accepted risk.

Invite amendment and **wait**. Expect several rounds; fold each amendment into the tasks before
re-presenting.

Persist only after explicit confirmation, to
`~/.claude/projects/-Users-lucaminudel-Code-TTLeaguePlayers/coding-tasks/<slug>/plan.md` — the same
`<slug>` directory the discovery report came from. That location is readable and writable by every
session and agent, which the in-session task list is not. **Do not add a pointer to `MEMORY.md`**;
task artifacts are found by path, not by recall. The file must carry:

- frontmatter with `name`, `description`, `metadata.type: project`
- goal and explicit out-of-scope
- the decision table, with the *why* for each
- research findings, with file:line citations
- the sub-task table with a **Status** column (`to be done` / `in progress` / `done`)
- an execution schedule covering initial and later parallel groups, their prerequisites and file
  ownership, serial groups with reasons, and review/verification synchronization barriers
- per-sub-task detail: paths, commands, expected values
- standing assumptions and accepted risks
- a dated progress log, and instructions that any agent may update it

### Codex-specific persistence

After explicit confirmation, also write the plan to `.codex/coding-tasks/<task-slug>/plan.md`, using
the same Codex task directory that contains `discovery.md`. Keep the Codex path as the cross-session
source of truth for later Execution and Review skills.

## Phase 8 — Retrospect

Before closing or handing off, review how this skill's work went. Present the useful lessons and
any skill improvements made, or explicitly say that no improvement was identified. Keep changes
limited to lessons supported by this session.

Ask the user whether they want to add any other improvement, and wait for their answer. Address
it before closing; an explicit decision to skip the retrospective also permits closure. Record the
outcome briefly in this task's existing report or progress log.

## Phase 9 — Close

Close only after the retrospective above is complete or the user explicitly declines it.

**Tell the user** — you cannot run this yourself; `/compact` is a command they type:

> The plan is persisted at `<path>`. Before starting the Execution you may want to compact this
> session:
> `/compact keep all the relevant info related to the inception findings and plan before moving to the Execution`

Say also that compacting is optional and the hand-off does not depend on it: the plan is on disk,
and that file — not this conversation — is what `coding-task-execution` reads.
---

## Anti-patterns

- Closing or handing off before completing the retrospective or recording the user's explicit decision to skip it.

- Writing application code before phase 6 confirmation.
- Planning against an external data source without fetching it first.
- Inferring process rules from repo guideline docs instead of asking.
- Declaring a change safe for another stack without running that stack's tests.
- Persisting the plan only to the in-session task list, which the next session cannot read.
- Delegating planning decisions or user-facing synthesis. Gathering and read-only verification
  may be delegated within the shared orchestration rules; builds and tests stay with the main agent.

## Standing rules

- **Commands against live cloud and Cognito environment** Running a read-only command against the cloud environment, and Cognito is permitted. Running during this Incpetion a mutating or state changing command against the cloud environment, and Cognito is NOT permitted. It is ok for that to be part of the plan the inception creates.

Plan state-changing operations when required, but do not execute them during inception.

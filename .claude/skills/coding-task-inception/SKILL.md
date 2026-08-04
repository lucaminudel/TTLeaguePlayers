---
name: coding-task-inception
description: Turn a coding task brief into a researched, questioned, confirmed and persisted implementation plan before any code is written. Use when the user says "Coding Task Inception".
---

# Coding Task Inception

A seven-phase protocol for the TTLeaguePlayers repo. The output is a **confirmed, persisted plan**,
not code. Write no application code during phases 1–6.

## Phase 1 — Receive the general information

The user supplies background and references. Read every file they name, in full. Hold it; do not
act on it yet.

Always read, whether or not they are named:
- `prompts/codebase_info/ArchitectureAndTechStack.md` — stack, environments, known debt
- The `prompts/codebase_info/*DomainLogic.md` covering the touched area
- `prompts/workflow/instructions/` — verification commands, local SAM debug
- `prompts/workflow/steps_guidelines/` — testing and red-test guidelines

If the user asks a question mid-brief, answer it, but do not start planning.

## Phase 2 — Receive the specification

What to implement, constraints, quality criteria, example files, how to verify. Do not push back
yet; collect everything, then note conflicts for phase 5.

## Phase 3 — Research

The most valuable phase. Budget real effort here — every plan defect in practice traced back to
research skipped, not to poor planning.

**Verify external data sources live.** If the task scrapes or calls an external site, fetch the
actual pages with `curl` into the scratchpad and parse them before planning. Confirm the user's
expected test data against reality. This routinely surfaces things absent from the brief — relative
vs absolute URLs, extra columns, HTML-entity encoding, pagination.

**Trace every consumer of every file you will change.** Config files under `config/` are read by
both the frontend (`src/config/environment.ts`, injected by Vite) *and* the C# backend
(`TTLeaguePlayersApp.BackEnd.Configuration.DataStore/Loader.cs`). Confirm behaviour by reading the
code, then still verify by running tests — never assert "this won't break it" from reasoning alone.

**Follow the call chain to the real consumer.** A method added to an interface is unreachable if a
decorator between the factory and the caller does not forward it. This repo already contains that
exact dead end: `CLTTLActiveSeason2025Processor.getTeams()` and `getTeamPlayers()` are live code
called by nothing, because `ActiveSeasonProcessorWithLocalStorageCache` implements only
`getTeamFixtures()`.

**Check whether the design is already written down.** The `codebase_info` docs sometimes specify
intended structure that the code has not grown yet — including inside mermaid diagrams. Read them
before proposing architecture; you may be re-deriving a decision already made.

## Phase 4 — Build the plan

Create sub-tasks with `TaskCreate`, then wire dependencies with `TaskUpdate` `addBlockedBy`. Each
task's description must be self-contained: exact file paths, verified selectors, expected values,
and *why* — a future agent reads the description, not this conversation.

Identify the tasks with no dependencies and say which they are; they can start immediately.

Sequence verification as **two tiers**, never one:
- a fast inner loop on the dev environment, reusing the already-running local web server and SAM
- one authoritative final run of the full pipeline on the test environment

Offer **review checkpoints** — explicit stop-and-hand-back tasks where the user inspects the shape
before the next layer goes on. Place each one at a state that compiles and runs; if the dependency
order prevents that, say so and propose the split that fixes it rather than parking the user in
front of a half-wired tree. A natural checkpoint is after the port, the concrete class and the
wiring, but before decorators and caching.

## Phase 5 — Question the gaps

Batch the questions; do not interrogate incrementally. Use `AskUserQuestion` with a recommendation
as the first option and a concrete `preview` snippet showing what each choice looks like in code.
Every question must change what you build — if a sensible default exists, take it and state it as
an assumption instead.

Always ask, because guessing these has been wrong before:

1. **Architecture, when a new capability binds to a different identity tuple than the existing
   interface.** If the current interface is constructed with `(division, team)` and the new
   capability only has `(club)`, that is a signal for a second port, not a wider one. Check which
   Cognito attribute drives it: `custom:active_seasons` and `custom:managed_clubs` are different
   actors, even though both resolve against the same `active_seasons_data_source` entry.
2. **Process rigour.** Do not infer TDD from `FixRedTestGuidelines.md` — it documents how to work
   *when* doing TDD, not that every task must. Ask whether this task wants red/green/refactor or
   code-then-tests.
3. **The verification loop.** Ask which environments the fast loop uses and what the authoritative
   final check is. Proposing the exhaustive-but-slow path wastes the user's time.
4. **Test strategy for external data.** Sources without archived versions or a season in the URL
   need *both* a frozen fixture test pinning exact values and a live test asserting only what
   survives a rollover. Say which assertions go where.

Then state your remaining assumptions explicitly, so silence counts as agreement.

**Treat the spec's implementation directives as provisional.** The brief may name the interface and
class to modify. If research says otherwise, present the trade-off with costs, flag the divergence
from what they wrote, and get explicit confirmation. Do not silently comply, and do not silently
deviate.
SKILL
## Phase 6 — Present, amend, confirm, persist

Present the full plan as a table: number, sub-task, blocked-by. Add files created vs modified,
decisions locked in, assumptions, and anything you would flag as accepted risk.

Invite amendment and **wait**. Expect several rounds; fold each amendment into the tasks before
re-presenting.

Persist only after explicit confirmation, to
`~/.claude/projects/-Users-lucaminudel-Code-TTLeaguePlayers/memory/plan-<slug>.md`, with a pointer
line added to `MEMORY.md`. That location is readable and writable by every session and agent, which
the in-session task list is not. The file must carry:

- frontmatter with `name`, `description`, `metadata.type: project`
- goal and explicit out-of-scope
- the decision table, with the *why* for each
- research findings, with file:line citations
- the sub-task table with a **Status** column (`to be done` / `in progress` / `done`)
- per-sub-task detail: paths, commands, expected values
- standing assumptions and accepted risks
- a dated progress log, and instructions that any agent may update it

## Phase 7 — Retrospect

Once the plan is persisted, review how phases 1–6 actually went and fold anything durable back into
this skill. Corrections the user made are the highest-value input. Ask the user if they want to add any other improvement to this skill

---



## Anti-patterns

- Writing application code before phase 6 confirmation.
- Planning a scraper without fetching the real page first.
- Asking questions one at a time, or asking questions whose answer would not change the work.
- Inferring process rules from repo guideline docs instead of asking.
- Declaring a change safe for another stack without running that stack's tests.
- Persisting the plan only to the in-session task list, which the next session cannot read.
- Spawning subagents; this protocol is done inline unless the user asks otherwise.

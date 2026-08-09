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

Read also the Discovery findings report persisted by the previous step, `coding-task-discovery`, at
`~/.claude/projects/.../memory/discovery-<slug>.md`. It carries
the framing, the domain concepts, the technical implementation details, the contradictions found,
and the open questions it deliberately left for this phase. If it does not exist, say so and ask
whether to run discovery first or proceed without it.

Always read, whether or not they are named:
- `prompts/codebase_info/ArchitectureAndTechStack.md` — stack, environments, known debt
- The `prompts/codebase_info/*DomainLogic.md` covering the touched area
- `prompts/workflow/instructions/` — verification commands, local SAM debug
- `prompts/workflow/steps_guidelines/` — testing and red-test guidelines

If the user asks a question mid-brief, answer it, but do not start planning.

## Phase 2 — Receive the specification

What to implement, constraints, quality criteria, example files, how to verify. Do not push back
yet; collect everything, then note conflicts for phase 5.

**One topic per stop — see Standing rules.** The specification arrives as several strands — scope,
wording, constraints, example files — and collecting them as a numbered list in one message is the
obvious move and the wrong one. Ask for one strand, wait, then ask for the next.

A gap you find between the user's brief and the Discovery findings report is **itself a topic**, not a
preamble to append to a question about something else. Raise it alone.

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

Identify the tasks with no dependencies and say which they are; they can start immediately.

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

**One topic per stop — see Standing rules.** That rule governs prose presentations exactly as much
as `AskUserQuestion` calls. Answering a question, summarising the changes you just applied, and
asking whether to proceed are three topics; putting them in one message breaks it just as surely as
a four-question panel does.

State your remaining assumptions explicitly, so silence counts as agreement.

**Treat the spec's implementation directives as provisional.** The brief may name the interface and
class to modify. If research says otherwise, present the trade-off with costs, flag the divergence
from what they wrote, and get explicit confirmation. Do not silently comply, and do not silently
deviate.


## Phase 6 — Present, amend, confirm, persist

Present the full plan as a table: number, sub-task, blocked-by. Add files created vs modified,
decisions locked in, assumptions, and anything you would flag as accepted risk.

Invite amendment and **wait**. Expect several rounds; fold each amendment into the tasks before
re-presenting.

Persist only after explicit confirmation, to
`~/.claude/projects/.../memory/plan-<slug>.md`, with a pointer
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
- Planning against an external data source without fetching it first.
- Asking questions whose answer would not change the work, or bundling several topics into one stop.
- Inferring process rules from repo guideline docs instead of asking.
- Declaring a change safe for another stack without running that stack's tests.
- Persisting the plan only to the in-session task list, which the next session cannot read.
- Spawning subagents; this protocol is done inline unless the user asks otherwise.


## Standing rules

**Asking the user.** Every time you stop — presenting a topic's findings, asking to run something,
closing out — the user is arriving cold. Give them a short summary with enough context to respond without re-reading the
transcript:

- **What is it about** — a short and clear summary of what is it all about.
- **your findings or relevant data** — a short and clear summary of the findings or data or facts you want to preset, before sharing the details.
- **What is the question or decision or contribution you are asking for** — a short and clear summary of what you expect from the user and the pros and cons and/or consequences of each choise
Keep it short enough to read in under a minute.
In the presentation make a clear visual distinction between the info you present and the questions or next steps expected from the user.
- **Discuss with the user one topic at the time.** 
Make sure to ask quesitons to the the user one topic at the time, and if there are sub-topic one sub-topic at the time, untile the sub-topic or topic is fully clarified.
Do not ask questions about multiple topics or sub-topics at the same time unless it is necessary because there are dependencies or tradeoffs between multiple topics or sub-topics that you want to explore with the user. 

When you present the conclusion on a topic or question, even more if that include reports of gaps, ask the user if they consider the topic completed before presenting info or questions on other topics.
- **Commands against live cloud and Cognito environment** Running a read-only command against the cloud environment, and Cognito is permitted, but **ask permission first**. Running during the incpetion a mutating or state changing command against the cloud environment, and Cognito is NOT permitted. It is ok for that to be part of the plan the inception creates, inform the user in such case.
---
name: coding-task-inception
description: Turn a coding task brief into a researched, questioned, confirmed and persisted implementation plan before any code is written. Use when the user says "Coding Task Inception".
model: opus
effort: high
allowed-tools: Bash(cat:*)
---

# Coding Task Inception

An nine-phase protocol for the TTLeaguePlayers repo. The output is a **confirmed, persisted plan**,
not code. Write no application code during phases 1–8.

---
```!
cat ${CLAUDE_PROJECT_DIR}/.claude/skills/shared/interaction-protocol.md
```

---

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

Always read, whether or not they are named:
- `prompts/codebase_info/ArchitectureAndTechStack.md` — stack, environments, known debt
- The `prompts/codebase_info/*DomainLogic.md` covering the touched area
- `prompts/workflow/instructions/` — verification commands, local SAM debug
- `prompts/workflow/steps_guidelines/` — testing and red-test guidelines

If the user asks a question mid-brief, answer it, but do not start planning.

IMPORTANT!: Apply to every hand-over message to the user the 'One Ask Per Message Rule', 'the One Point Per Message Rule', and the 'Presenting Rule for the One Ask and the One Topic you do send'.

## Phase 2 — Receive the specification

What to implement, constraints, quality criteria, example files, how to verify. Do not push back
yet; collect everything, then note conflicts for phase 5.

A gap you find between the user's brief and the Discovery findings report is **itself a topic**, not a
preamble to append to a question about something else. Raise it alone.

IMPORTANT!: Apply to every hand-over message to the user the 'One Ask Per Message Rule', 'the One Point Per Message Rule', and the 'Presenting Rule for the One Ask and the One Topic you do send'.

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

IMPORTANT!: Apply to every hand-over message to the user the 'One Ask Per Message Rule', 'the One Point Per Message Rule', and the 'Presenting Rule for the One Ask and the One Topic you do send'.

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

IMPORTANT!: Apply to every hand-over message to the user the 'One Ask Per Message Rule', 'the One Point Per Message Rule', and the 'Presenting Rule for the One Ask and the One Topic you do send'.

## Phase 5 — Question the gaps

Use `AskUserQuestion` with a recommendation as the first option and a concrete `preview` snippet
showing what each choice looks like in code. Every question must change what you build — if a
sensible default exists, take it and state it as an assumption instead.

**One question per `AskUserQuestion` call.** The tool accepts up to four; passing more than one is
the most common way this skill breaks the one-ask rule, because the tool makes it look sanctioned.
It is not. Ask the first gap, wait for the answer, apply it, then ask the next.

State your remaining assumptions explicitly, so silence counts as agreement.

**Treat the spec's implementation directives as provisional.** The brief may name the interface and
class to modify. If research says otherwise, present the trade-off with costs, flag the divergence
from what they wrote, and get explicit confirmation. Do not silently comply, and do not silently
deviate.

IMPORTANT!: Apply to every hand-over message to the user the 'One Ask Per Message Rule', 'the One Point Per Message Rule', and the 'Presenting Rule for the One Ask and the One Topic you do send'.

## Phase 6 — Review the plan for completeness
Double-ckeck the plan decisions and sub-tasks making sure they are sufficiently detailed and have all the information required for  the agent to implement the plan-subtasks minimising the interruptions such as additional asks or reviews that need to be presented to the user.

Where you can anticipate a gap and a missing information or a decision or a confirmation required, bridge the gap now with the user so the plan execution will have much much less interruptions


## Phase 7 — Present, amend, confirm, persist

Present the full plan as a table: number, sub-task, blocked-by. Add files created vs modified,
decisions locked in, assumptions, and anything you would flag as accepted risk.

Invite amendment and **wait**. Expect several rounds; fold each amendment into the tasks before
re-presenting.

**"Invite amendment" is the whole ask, and it is the only one in that message.** Do not also ask for
confirmation to persist, do not also ask about a sub-task you are unsure of, and do not close with
"otherwise I'll save it as is" — that last one is tacit approval, which the one-ask rule counts as
an ask. Persisting is a separate, later ask, made only once the amendments have stopped. If a
specific part of the plan needs a decision, that is its own message, before or after the plan
presentation but never inside it.

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
- per-sub-task detail: paths, commands, expected values
- standing assumptions and accepted risks
- a dated progress log, and instructions that any agent may update it

IMPORTANT!: Apply to every hand-over message to the user the 'One Ask Per Message Rule', 'the One Point Per Message Rule', and the 'Presenting Rule for the One Ask and the One Topic you do send'.

## Phase 8 — Retrospect

Once the plan is persisted, review how phases 1–6 actually went and fold anything durable back into
this skill. Corrections the user made are the highest-value input. Ask the user if they want to add any other improvement to this skill


**Where the improvement goes — check before editing anything.** Phase logic (the steps, their
order, what this phase produces) belongs in this file. Anything about the interaction protocol —
the One Ask and One Point rules, the pre-send gate, the shape of a hand-back — belongs in
`.claude/skills/shared/interaction-protocol.md`, which all four skills inject verbatim at load
time.

**Never edit the protocol text as it appears in a rendered skill.** What you see inline was
injected from that one shared file; editing it in place either silently diverges the four skills
or is discarded the next time the file is read. Open the shared file and change it there, once.

## Phase 9 — Close

**Tell the user** — you cannot run this yourself; `/compact` is a command they type:

> The plan is persisted at `<path>`. Before starting the Execution you may want to compact this
> session:
> `/compact keep all the relevant info related to the inception findings and plan before moving to the Execution`

Say also that compacting is optional and the hand-off does not depend on it: the plan is on disk,
and that file — not this conversation — is what `coding-task-execution` reads.
---

## Anti-patterns

- Writing application code before phase 6 confirmation.
- Planning against an external data source without fetching it first.
- Dropping or retracting a point to get a message down to one ask, instead of moving it to the next
  message.
- Inferring process rules from repo guideline docs instead of asking.
- Declaring a change safe for another stack without running that stack's tests.
- Persisting the plan only to the in-session task list, which the next session cannot read.
- Spawning subagents; this protocol is done inline unless the user asks otherwise.

```!
cat ${CLAUDE_PROJECT_DIR}/.claude/skills/shared/orchestration.md
```

## Standing rules

- **Commands against live cloud and Cognito environment** Running a read-only command against the cloud environment, and Cognito is permitted. Running during this Incpetion a mutating or state changing command against the cloud environment, and Cognito is NOT permitted. It is ok for that to be part of the plan the inception creates.

IMPORTANT!: Apply to every hand-over message to the user the 'One Ask Per Message Rule', 'the One Point Per Message Rule', and the 'Presenting Rule for the One Ask and the One Topic you do send'.

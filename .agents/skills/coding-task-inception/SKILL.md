---
name: coding-task-inception
description: Turn a coding task brief into a researched, questioned, confirmed and persisted implementation plan before any code is written. Use when the user says "Coding Task Inception".
model: opus
effort: high
allowed-tools: Bash(cat:*), Bash(ls:*), Bash(head:*), Bash(tail:*), Bash(wc:*), Bash(grep:*), Bash(sed -n:*), Bash(git show:*), Bash(git log:*), Bash(git status:*), Bash(git diff:*), SendUserFile
---
# Coding Task Inception

## Codex-specific model and delegation

Use **Sol 6.1**, Medium for this phase. Select the host's available Sol model; this instruction does not
itself change the running session's model. If model selection is unavailable, report the
limitation rather than claiming a switch. The frontmatter `model` is for Claude Code.
Follow [the shared orchestration rules](../shared/orchestration.md).

### Suggested model — at phase start

Before beginning or resuming this phase, send this one-time commentary message:

Suggested model for this phase, for you to switch: <the model and effor suggested above>.

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

A nine-phase protocol for the TTLeaguePlayers repo. The output is a **confirmed, persisted plan**,
not code. Write no application code during Inception.

## Execution and Review continuation policy

Read [the shared continuation-record guidance](../shared/no-stop-policy-guidance.md).
Create and maintain `<task-slug>/no-stop-policy.md` alongside the task artifacts as decisions
about Execution and Review continuation or handover emerge. Record user answers, upfront
permissions, corrections and their scope centrally; check the whole record for conflicts and
ambiguities after each update and before a related question or decision. Include the effective
workflow diagram in the confirmed handoff. Link central decision IDs from the plan rather than
maintaining a second stop/continue policy there. In Codex use `.codex/coding-tasks/<task-slug>/`.

## Phase 1 — Receive the general information

The user supplies background and references. Read every file they name, in full. Hold it; do not
act on it yet.

Read also the Discovery findings report persisted by the previous step, `coding-task-discovery`, at
`~/.claude/projects/-Users-lucaminudel-Code-TTLeaguePlayers/coding-tasks/<slug>/discovery.md`.
List the `coding-tasks/` directory to find the slug rather than guessing it: one match, use it;
several, ask the user which; none, say so. It carries
the framing, the domain concepts, the technical implementation details, the contradictions found,
and the open questions it deliberately left for this phase. Read its `Requirements, Specifications and Constraints` chapter and combine those items with the requirements, specifications and
constraints gathered during Inception in the plan chapter named below. For an older report without
that chapter, derive its index from the report. If the report does not exist, say so and ask
whether to run discovery first or proceed without it.

### Codex-specific retrieval

In Codex, resolve the task state by inspecting `.codex/coding-tasks/` and reusing the matching
`task.md`. Read the Discovery report from `.codex/coding-tasks/<task-slug>/discovery.md`. If several
task directories match, ask the user which one; if none matches, report that Discovery has not been
completed rather than guessing a path.

Always read, whether or not they are named:
- `prompts/codebase_info/ArchitectureAndTechStack.md` — stack, environments, known debt
- `prompts/codebase_info/CodeDesignGuidelines.md` — cross-cutting design principles
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

### Simplicity review — before building the plan

Separate **user-required outcomes, constraints and guarantees** from **agent-proposed mechanisms**.
Completeness means covering the confirmed scope; it does not justify general-purpose machinery,
future capabilities or extra guarantees the user did not request.

Before turning a consequential design choice into sub-tasks, check:

1. **Use the existing boundary.** Before adding an abstraction, changing a shared interface or
   passing context across layers, find where the required information already exists. Compare
   the smallest viable design using existing return values, errors, callbacks or data owners.
   Place decisions where their inputs are known; preserve original evidence when it crosses layers.
2. **Justify new machinery.** Tie each new mechanism to a current requirement. Keep machinery
   needed only by an optional or later deliverable out of the core, except a small seam justified
   by the current feature. Do not build a framework for hypothetical future callers.
3. **Assess actual change surface.** Identify affected files, shared consumers and behaviours.
   Fewer edited files are not automatically safer if complexity moves into global state or a
   more widely used component. Preserve the user's delivery, review and commit boundaries.
4. **Explain real savings.** For each proposed simplification, state which logic, dependencies
   or tests disappear. Distinguish implementation savings from traffic limits, weaker reliability,
   reduced verification or changed workflow. Do not present those trade-offs as less code without
   evidence, or drop required guarantees merely to make the design smaller.
5. **Assign test responsibilities.** Give each property a primary test layer. Use higher layers
   for additional integration risks and representative journeys; do not repeat the full behaviour
   matrix at every layer unless the repeated coverage establishes something distinct.
6. **Keep the comparison proportional.** Record a brief rationale and any viable smaller
   alternative for consequential choices, including why it was rejected. Local, routine changes
   need no elaborate alternatives exercise or extra user approval.

Prefer the smallest design that satisfies the confirmed requirements and verification obligations.
Resolve unnecessary complexity before presenting it as part of the plan.

## Phase 4 — Build the plan

**Suggest deployable units for large or cross-component plans.** When the plan is large in scope,
implementation effort or time, or touches different parts of the system (backend API, Lambdas,
database, frontend configuration, client API, screens, infrastructure, and so on), assess whether
it can be split into a sequence of distinct units that can each be
implemented, verified and deployed without requiring unfinished later units. Where feasible,
suggest that split to the user. Possible boundaries include backend and frontend changes,
preparatory tidying or refactoring and feature implementation, or separately deliverable parts of
a feature; use these only where the actual dependencies and contracts support them.

For each proposed unit, state its outcome, included sub-tasks, prerequisites, verification and
deployment boundary, and why the system remains usable after it is deployed. Earlier units may
be prerequisites for later ones, but must work with the components that remain deployed at that
point. Explain the benefits and any added effort or compatibility work so the user can assess the
split. If no useful independent deployment boundary exists, explain why. Reassess the split when
scope amendments materially change the plan's size or dependencies.

Create sub-tasks with `TaskCreate`, then wire dependencies with `TaskUpdate` `addBlockedBy`. Each
task's description must be self-contained: exact file paths, verified selectors, expected values,
and *why* — a future agent reads the description, not this conversation.
Apply the scope-impact rule in *Standing rules* to each sub-task and to their combined effect.
Include any applicable callout in the affected sub-task's description and flag it when presenting
the plan.

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

Sequence verification in two stages, using Execution's Tier 1-A/B/C/D definitions for unit work:
- a fast inner loop on the dev environment, reusing the already-running local web server and SAM
- one authoritative final run of the full pipeline on the test environment

Include Tier 1-D localized deterministic mutation testing where applicable to each deployable
unit, after relevant build and unit checks and before its review/commit. Localized runs, test-gap
fixes and triage updates are automatic and require no approval. Record the unit scope and this
continuation policy in `no-stop-policy.md`; if closing a gap requires application-code changes
affecting application behaviour, obtain user approval for the concrete behaviour change before
applying it. A forced whole-codebase mutation run is a rare,
optional post-commit follow-up after Tier 2, taking about three hours by the user's current
estimate; it is not a required completion gate. Record its user authorization separately from
the automatic localized-mutation policy and shared-pipeline permissions.

Offer **review checkpoints** — explicit stop-and-hand-back tasks where the user inspects the shape
before the next layer goes on. Place each one at a state that compiles and runs; if the dependency
order prevents that, say so and propose the split that fixes it rather than parking the user in
front of a half-wired tree.

## Phase 5 — Question the gaps

Use `AskUserQuestion` with a recommendation as the first option and a concrete `preview` snippet
showing what each choice looks like in code. Every question must change what you build — if a
sensible default exists, take it and state it as an assumption instead.

State your remaining assumptions explicitly, so silence counts as agreement.

**Treat implementation locations as provisional unless explicitly constrained.** The brief may
name an interface or class to modify. Unless the user made that location a constraint, choose
and explain routine implementation alternatives within the intended outcome. Request confirmation
only when the alternative materially changes scope, blast radius, impact, delivery boundary or
contracts, requires additional authority, or overrides an explicit user constraint. Reuse existing
decisions and approvals, and record any resulting Execution or Review handover decision in
`no-stop-policy.md`.

## Phase 6 — Review the plan for completeness
Double-ckeck the plan decisions and sub-tasks making sure they are sufficiently detailed and have all the information required for  the agent to implement the plan-subtasks minimising the interruptions such as additional asks or reviews that need to be presented to the user.

Where you can anticipate a gap and a missing information or a decision or a confirmation required, bridge the gap now with the user so the plan execution will have much much less interruptions

Walk every sub-task and the complete Execution-to-Review workflow to identify foreseeable
questions that could require a human answer and cause a later interruption. Inspect the code,
tests, documentation, existing decisions and other available evidence, and perform authorized
checks, to determine whether each question requires human input. When this establishes the
answer, record it without asking the user. When a human answer is still required, ask during
Inception rather than deferring the question until Execution. Record the answers, delegated
judgment, retained gates and upfront permissions in `no-stop-policy.md`, then check the complete
record for gaps, ambiguity and conflicts so Execution can proceed without avoidable interruptions.


**Recheck simplicity as well as completeness.** Repeat the Phase 3 simplicity review against the
actual decisions, sub-tasks, shared-file changes and test responsibilities. Remove mechanisms that
do not serve confirmed requirements, and explain why consequential remaining complexity is needed.
Check that optional work has not leaked into the core and that each claimed simplification removes
real implementation work. Close genuine gaps without inventing extra requirements to eliminate
every possible future interruption.

**Check the execution graph for completeness.** Walk the initial ready set and each later ready
set against the actual blockers, file boundaries and real-world sequencing constraints. Confirm
that every safe parallel opportunity is recorded, each conflicting write is ordered, and every
review or verification barrier blocks the appropriate successors. Check that the graph is acyclic
and that every task can eventually become ready. Explain any intentionally serial group. Resolve
missing ownership or dependencies before presenting the plan.

## Phase 7 — Present, amend, confirm, persist

Before final plan confirmation, ask the user each of the following questions; they may answer or
explicitly skip each one. In the `Requirements, Specifications, Constraints and Outcomes` chapter
of `plan.md`, record the exact wording of each of these four questions and the user’s verbatim answer
to it, or the user’s explicit skip. Preserve multi-question answers verbatim and associate them with
each question they answer. Fold any resulting changes into the plan before confirmation. Do not
invent answers or make a skipped answer a requirement:

1. When this plan is implemented, which user needs or wants will be fulfilled?
2. How will the user know this outcome has been achieved?
3. What other product and business outcomes and impacts will be achieved?
4. How can these be quantified and measured?


Present the full plan as a table: number, sub-task, blocked-by. Include the parallel execution
groups, file ownership, and synchronization barriers. Add files created vs modified,
decisions locked in, assumptions, and anything you would flag as accepted risk.
For large or cross-component plans, present the suggested sequence of deployable units and its rationale, or explain
why a split is not feasible. Fold the user's choice into the plan before confirmation.

Invite amendment and **wait**. Expect several rounds; fold each amendment into the tasks before
re-presenting. Apply the scope-impact rule in *Standing rules* to each scope refinement or change,
and highlight any resulting changes to blast radius, implementation effort, risk or impact before
asking for confirmation. Repeat the simplicity review whenever an amendment adds mechanisms,
shared-interface changes or context propagation, materially changes the risk/effort, or changes
delivery/test boundaries. Reconsider the design instead of automatically adding another layer of
plumbing; update the rationale, affected tasks and dependencies before re-presenting.

Persist only after explicit confirmation, to
`~/.claude/projects/-Users-lucaminudel-Code-TTLeaguePlayers/coding-tasks/<slug>/plan.md` — the same
`<slug>` directory the discovery report came from. That location is readable and writable by every
session and agent, which the in-session task list is not. **Do not add a pointer to `MEMORY.md`**;
task artifacts are found by path, not by recall. The file must carry:

- frontmatter with `name`, `description`, `metadata.type: project`
- goal and explicit out-of-scope
- **`Requirements, Specifications, Constraints and Outcomes`** — a dedicated chapter in `plan.md`
  with one combined, deduplicated index of all requirements, technical and domain specifications
  and constraints as discussed in the Inception and in the  Discovery and documented in `Requirements, Specifications and Constraints` chapter from `discovery.md`.  Use short labels with
  links or section references to the detailed discussion in `plan.md` or `discovery.md`, without
  duplicating it. Distinguish confirmed in-scope items from open, uncertain, superseded and
  out-of-scope items; preserve their status and do not turn observations into requirements.
  Include the four outcome questions verbatim and the user's verbatim answer or explicit skip for
  each in this same chapter. Update the index and answers when the plan is amended, and reconcile them at confirmation.
- the decision table, with the *why* for each
- a concise simplicity assessment for consequential choices: required outcomes versus proposed
  mechanisms, actual change surface, viable smaller alternatives and reasons for the selected design
- research findings, with file:line citations
- the sub-task table with a **Status** column (`to be done` / `in progress` / `done`)
- an execution schedule covering initial and later parallel groups, their prerequisites and file
  ownership, serial groups with reasons, and review/verification synchronization barriers
- for large or cross-component plans, the agreed deployable units and their sequence, outcomes, sub-task membership,
  prerequisites, verification and deployment boundaries, or the reason for keeping one unit
- per-sub-task detail: paths, commands, expected values
- standing assumptions and accepted risks
- scope-impact callouts, with reasons, affected areas and uncertainties, including the consequences
  of scope refinements or changes; surface the significant ones in the plan's opening summary
- a dated progress log, and instructions that any agent may update it

### Codex-specific persistence

After explicit confirmation, also write the plan to `.codex/coding-tasks/<task-slug>/plan.md`, using
the same Codex task directory that contains `discovery.md`. Keep the Codex path as the cross-session
source of truth for later Execution and Review skills.

## Phase 8 — Retrospect

Retrospect (reflect on the work just completed with this coding-task-inception Skill, 
list what worked well, what did not work well, what challenges were met, and suggest improvements 
to the skill) on the **Inception workflow itself** after the plan is confirmed and persisted. Assess
how research, questions, decisions, plan confirmation and hand-off worked. Technical design lessons
alone do not satisfy this retrospective. Present supported improvements to this skill, or say
explicitly that none were identified.

Ask the user specifically whether they want to add or change anything about the **Coding Task
Inception workflow**, and wait for their answer. An answer to another phase's retrospective, or a
generic earlier answer, does not count. Address the answer before closing; an explicit decision to
skip the Inception retrospective also permits closure.

Record a distinct `Inception retrospective` outcome in this task's `plan.md`: workflow lessons,
skill changes made (or none), and the user's Inception-specific answer or explicit skip.

## Phase 9 — Close

Before closing, check that `plan.md` contains the distinct Inception retrospective outcome from
Phase 8, including the user's Inception-specific answer or explicit skip. Complete Phase 8 if it
is missing; another phase's retrospective cannot fill this gate.

**Tell the user** — you cannot run this yourself; `/compact` is a command they type:

> The plan is persisted at `<path>`. Before starting the Execution you may want to compact this
> session:
> `/compact keep all the relevant info related to the inception findings and plan before moving to the Execution`

Say also that compacting is optional and the hand-off does not depend on it: the plan is on disk,
and that file — not this conversation — is what `coding-task-execution` reads.
---

## Anti-patterns

- Treating technical design lessons, another phase's retrospective, or an earlier generic answer
  as the Inception retrospective; closing without its distinct outcome in `plan.md`.

- Writing application code during Inception; implementation belongs to Execution after plan confirmation.
- Planning against an external data source without fetching it first.
- Inferring process rules from repo guideline docs instead of asking.
- Declaring a change safe for another stack without running that stack's tests.
- Persisting the plan only to the in-session task list, which the next session cannot read.
- Delegating planning decisions or user-facing synthesis.

## Standing rules

- **Highlight consequential scope.** For Domain items, Technical items, plan items (sub-tasks),
  and any other scope considered for the task, explicitly flag to the user any item whose
  implementation has a large blast radius, requires significant time or effort, or carries high
  risk or impact. Call out which
  of these applies, why, and the affected users, systems or dependencies, using the available
  evidence. Distinguish confirmed consequences from estimates and unknowns; do not invent precise
  effort estimates. Carry forward Discovery's relevant callouts and reassess them against the
  proposed scope. Highlight these items when first presenting the scope or plan, and whenever
  research, refinement or amendments materially change their significance. Explain how each scope
  change increases, reduces or leaves uncertain these consequences before requesting confirmation,
  and preserve the current assessment in the confirmed plan. A callout alone does not mean the
  user has accepted the risk or authorized implementation.

- **Commands against live cloud and Cognito environment** Running a read-only command against the cloud environment, and Cognito is permitted. Running during this Incpetion a mutating or state changing command against the cloud environment, and Cognito is NOT permitted. It is ok for that to be part of the plan the inception creates.

Plan state-changing operations when required, but do not execute them during inception.

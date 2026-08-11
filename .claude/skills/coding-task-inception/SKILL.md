---
name: coding-task-inception
description: Turn a coding task brief into a researched, questioned, confirmed and persisted implementation plan before any code is written. Use when the user says "Coding Task Inception".
---

# Coding Task Inception

An eight-phase protocol for the TTLeaguePlayers repo. The output is a **confirmed, persisted plan**,
not code. Write no application code during phases 1–8.

---
## One Ask Per Message Rule 

### What an *ask* is

An **ask** is any part of a message that the model cannot proceed past without the user
replying.

**The test:** *would I act differently depending on what the user says to this?* If yes,
it is an ask. If the user could ignore it entirely and nothing about the work would
change, it is not.

**These all count as asks, and each one alone fills the quota for a message:**

| Form | Example |
|---|---|
| A direct question, however small | "does that look right?", "anything else?", "shall I continue?" |
| A choice between options | "A or B?", a list of alternatives with a recommendation |
| A request to confirm, approve or reject | "approve this fix?", "is this the right list?" |
| A request that the user do something | run a command, supply a file, check a value, make a decision |
| **An announcement where silence would count as consent** | "I'll proceed with X unless you object", "otherwise I'll save it as is", "let me know if not" |
| An `AskUserQuestion` call | **one question per call, never two to four — and one call per message** |

**These are not asks** (and a message made only of these carries zero asks): statements of
fact, findings, a status update, a report, a summary of work already done, a link to a
document you produced.

**Size is irrelevant.** Two small asks in one message is the same violation as ten. A
second ask does not become acceptable because it is short, obvious, related to the first,
or phrased without a question mark.

### The rule

**A message may contain at most ONE ask.**

Reports, overviews, findings lists, status updates, plans and document hand-overs carry
**zero** asks — not one. Post them, stop, and put the first decision in its own later
message.

### Why

Every ask is work handed to the user: they have to understand it, weigh it against the
rest of the change, and answer it. Bundling asks does three things, all bad:

1. **It overwhelms.** The user has to hold every unresolved item in their head at once
   just to answer any of them.
2. **It confuses.** With several asks in flight it stops being clear which part of their
   reply answers which ask — and a partial reply leaves the rest silently unresolved,
   usually decided by default rather than by them.
3. **It makes reacting properly impossible.** A user who wants to reshape the third ask
   has to either write an essay addressing all of them or let it go. Letting it go is what
   actually happens — which means a bundled ask quietly extracts agreement to something
   the user would have changed.

That last one is the real cost. Sequencing costs a round-trip. Bundling costs the user's
actual input, which was the whole reason for asking.

### The pre-send gate — run on every message, without exception

1. Re-read the message you are about to send, from the top.
2. **Count the asks.** Count the question marks first. Then count the sentences that need
   a response without one: "let me know if…", "I'll proceed with X unless…", "confirm and
   I'll start".
3. **Count 0** → send it and **stop there**. Do not append a question to save a
   round-trip; the next message carries the ask.
4. **Count 1** → check that everything else in the message is what the user needs *in
   order to answer that one ask*. Cut the rest; it belongs in its own message.
5. **Count 2 or more** → keep the first, move the others to later messages.
   **Never drop an ask to get the count down.** Retracting is not the fix — every ask
   still gets asked, one message at a time.
6. **Last check:** the one ask sits in its own clearly-marked section at the end,
   visually separated from the information above it. **If that section needs a second
   bullet, the message is carrying two asks — split it.**

### The shape of the loop

**Ask → wait → act on the answer → then the next ask.**

Where several asks share the same background, send that background **once, in a message
with no ask in it**, then take the asks one at a time — each carrying enough context to
be answered without re-reading the transcript.

---

## One Point Per Message Rule


### What a *point* is

A **point** is a unit of content the user has to evaluate on its own: a topic, a
sub-topic, a finding, an issue, a bug, an analysis result, an option, a review comment, a
gap, a risk, a trade-off, a correction, a recap item.

**The test:** *could the user accept this one and reject the next?* If yes, they are two
points.

**Points nest, and the rule is scale-free.** A discovery topic contains sub-topics; a
review contains findings; a finding contains its cause and its fix options. Whatever the
level you are working at, the unit at *that* level is the point, and one goes per message.
Going a level deeper does not license bundling the level above.

**Shared context is not a point.** Background that several points rest on — what you were
doing, which files, which command, what the plan said — is context. Send it once, in its
own message with no ask, then let the points follow one per message.

### The rule

**One point per message, and one point at a time.** Three obligations:

1. **Within a message — the five-line threshold.** More than one point in a message
   longer than five screen lines is a batch: split it, send the first point, wait for the
   reply, then the next. Several points may travel together **only** when the whole
   message fits inside five screen lines, because only then can the reader hold all of
   them at once. That is the whole of the length rule — there is no separate allowance
   above five lines, and a long message does not earn extra points by being well
   organised.
2. **Across messages — settle before opening the next.** Do not open the next point while
   the current one is unsettled. Present it, **wait**, and let the user accept, correct,
   or redirect before moving on. When a point is a topic with sub-topics, finish the
   sub-topic before returning to the parent.
3. **A required deliverable is one point, and it travels alone.** When a phase requires a
   list or a document — a topic list, a plan, a findings report, a work summary, a PR
   guide, a triage overview — it is exempt from the five-line threshold: the user reads it
   as a single artefact, in one pass, which is the point of producing it. In exchange it
   must be the message's **entire** content. Nothing travels with it: no second point, no
   ask, no preamble raising something else, no "so, shall I start with the first one?" at
   the bottom. The exemption is what makes the message readable; anything added takes it
   back.

**Closure is explicit.** When you present a conclusion on a point — especially one
reporting gaps — ask whether the user considers it complete **before** presenting anything
about the next point. That closure question is an ask, so under (a) it goes in its own
message, never in the one that opens the next point.

**This rule limits the message, not the ask count.** A three-point message with no
question mark anywhere in it still breaks it. So does a point-by-point review of a list
the user wrote themselves. And rule (a) applies **inside** a single point: one finding
that raises a gap, a value to confirm and a choice of depth is three asks, so three
messages, not one.

### Why

Points are not neutral information — each one is something the user may want to correct,
push back on, reprioritise or reject. Presented as a wall, they behave exactly like
bundled asks:

1. **They overwhelm.** Ten findings at once is not ten times as informative as one; past
   about three the reader stops evaluating and starts skimming.
2. **They confuse.** The user's reaction to point 5 arrives without the model knowing
   whether points 1–4 were accepted or merely not mentioned.
3. **They suppress reaction.** Responding to a wall of points means writing a wall back.
   Most users answer the one or two that stood out and let the rest pass — so the points
   that most needed their judgement are the ones that silently ship unexamined.

The user's correction on a single point is the highest-value thing in the whole protocol.
Batching is the reliable way to lose it.

### Procedure

1. Before sending, **count the points** — separately from counting asks.
2. More than one **and** longer than five screen lines? → split.
3. Send point 1 alone. **Wait.** Settle it. Then point 2.
4. Never delete or retract a point to shorten a message. Move it to the next message.

---

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

Remember to apply the One Ask Per Message Rule and the One Point Per Message Rule.

## Phase 2 — Receive the specification

What to implement, constraints, quality criteria, example files, how to verify. Do not push back
yet; collect everything, then note conflicts for phase 5.

A gap you find between the user's brief and the Discovery findings report is **itself a topic**, not a
preamble to append to a question about something else. Raise it alone.

Remember to apply the One Ask Per Message Rule and the One Point Per Message Rule.

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

Remember to apply the One Ask Per Message Rule and the One Point Per Message Rule.

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

Remember to apply the One Ask Per Message Rule and the One Point Per Message Rule.

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

Remember to apply the One Ask Per Message Rule and the One Point Per Message Rule.

## Phase 6 — Present, amend, confirm, persist

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

Remember to apply the One Ask Per Message Rule and the One Point Per Message Rule.

## Phase 7 — Retrospect

Once the plan is persisted, review how phases 1–6 actually went and fold anything durable back into
this skill. Corrections the user made are the highest-value input. Ask the user if they want to add any other improvement to this skill

Remember to apply the One Ask Per Message Rule and the One Point Per Message Rule.

## Phase 8 — Close

At the end when all is done do a:
/compact keep all the relevant info related to the inception findings and plan before moving to the Execution
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


## Standing rules

- **Commands against live cloud and Cognito environment** Running a read-only command against the cloud environment, and Cognito is permitted, but **ask permission first**. Running during the incpetion a mutating or state changing command against the cloud environment, and Cognito is NOT permitted. It is ok for that to be part of the plan the inception creates, inform the user in such case.
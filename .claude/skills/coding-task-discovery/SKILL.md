---
name: coding-task-discovery
description: Explore the business-domain concepts and technical implementation details behind a coding task, and persist a Discovery findings report that feeds the Coding Task Inception. Use when the user says "Coding Task Discovery", or asks to explore or research a task before planning it.
model: opus
effort: medium
allowed-tools: Bash(cat:*), Bash(ls:*), Bash(head:*), Bash(tail:*), Bash(wc:*), Bash(grep:*), Bash(sed -n:*), Bash(git show:*), Bash(git log:*), Bash(git status:*), Bash(git diff:*), SendUserFile
---

# Coding Task Discovery

## Codex-specific model and delegation

Use **Sol** for this phase. Select the host's available Sol model; this instruction does not
itself change the running session's model. If model selection is unavailable, report the
limitation rather than claiming a switch. The frontmatter `model` is for Claude Code.
Use sub-agents for work that can proceed in parallel, especially information gathering,
research and exploration. Delegate every exploration under
[the shared orchestration rules](../shared/orchestration.md); keep topic agreement, synthesis
and user-facing discussion with the main agent.

## Session name — at the start

At skill entry, name the current chat `Discovery — <existing topic>`. Remove any leading
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
# Claude specific
cat ${CLAUDE_PROJECT_DIR}/.claude/skills/shared/orchestration.md
```

Read the shared orchestration guidance at [../shared/orchestration.md](../shared/orchestration.md).

First of the four. It runs **before** `coding-task-inception` and produces its input.

The output is a **persisted Discovery findings report** — the business-domain concepts and the
technical implementation details the task depends on. Not a plan, not sub-tasks, not code. Planning
belongs to inception; if you find yourself sequencing work, you have left this skill.

Discovery is **read-only**. Read the codebase, fetch live external pages, search the web. Write
nothing into the repo tree except its findings report, task metadata and report scratch notes;
write no application code.

## Phase 1 — Frame the task
Ask for:

1. **The bigger picture** — which end-user feature or outcome does it serve?
2. **What it contributes to** — how does this task contribute to that? What is its part?
3. **A high-level description** of the task itself.
4. **What to explore** — which topics they want covered, which questions they want answered.

Also collect any references they name — files, URLs, tickets, screenshots, prior conversations —
and read every one of them in full before exploring anything.
If they give you only some of the four, ask for the rest rather than inventing it. The framing is
what stops discovery from sprawling: a topic that serves neither the bigger picture nor a stated
question does not belong in the report.

## Phase 2 — Agree the topic list

Turn what they gave you into an explicit, numbered list of topics and questions, and present it
before exploring. Separate:

- **Domain topics** — concepts, rules, actors, lifecycles, vocabulary. What the app means.
- **Technical topics** — structure, call chains, data sources, contracts, environments, testing.
  How the app is built.

Add topics and questions of your own that the framing implies but the user did not name, and mark
them as yours so they can drop them. Note the ones you judge highest-risk — the ones where being
wrong would cost the most later — and propose starting there.
Apply the scope-impact rule in *Standing rules* when presenting this list.

Get agreement on the list before phase 3. The list is not frozen (see *Standing rules*), only
agreed.

## Phase 3 — Explore and discuss

For each topic in turn: explore it, write up the findings, **present them, and wait** for the user
to react before moving to the next. They may accept it, correct it, ask for more depth, or open a
new topic on the spot. Do not batch the whole exploration and present it at the end.

A topic is done when the answers are **detailed enough to act on** — concrete values, exact paths,
named identifiers, real examples — not when they are merely plausible.

### Where to look

**What the user gave you** — first, and in full.

**The codebase** — read it rather than recalling it. Look at the implementation as well as the tests.

**Live external sources** — if the task touches a scraped or called external site, `curl` the real
pages into the scratchpad and parse them. Do not describe an external source from the user's
description of it. This routinely surfaces what no one mentioned: relative vs absolute URLs, extra
columns, HTML-entity encoding, pagination, casing.

**Your own knowledge and the web** — for anything outside the repo: the sport's rules, a league's
season structure, a library's behaviour, a protocol. Cite what you used.

**The repo's own documentation**, when relevant to the topic:

| For | Read |
|---|---|
| Domain topics | the `prompts/codebase_info/*DomainLogic.md` covering the area the task touches |
| Technical topics | `prompts/codebase_info/ArchitectureAndTechStack.md`, `prompts/codebase_info/BackendLoggingAndExceptionGuidelines.md`, `prompts/workflow/steps_guidelines/` |
| Verification and environments | `prompts/workflow/instructions/` |

List those directories rather than working from this table — they gain files.

The `codebase_info` docs sometimes describe intended structure the code has not grown yet, including
inside mermaid diagrams. When doc and code disagree, that gap **is a finding** — record both, and
say which is which.

### What you may run

Read-only exploration, live fetches, web search, and diagnostic commands (`git log`, `ps`, `lsof`,
`aws dynamodb list-tables`, a `curl` against the local API).

Running a read-only command against the cloud environment, and Cognito is permitted. Running a mutating or state changing command against the cloud environment, and Cognito during this Discovery is NOT permitted.

Running an existing test or a build purely to **observe current behaviour** is allowed, but **ask permission 
first** — the local SAM, web server and DynamoDB are shared state the user may be using, and a build
can invalidate a running `sam local start-api`. Never modify a test to make it reveal something;
never write application code.

## Phase 4 — The findings report

Maintained at
`~/.claude/projects/-Users-lucaminudel-Code-TTLeaguePlayers/coding-tasks/<slug>/discovery.md`.
That location is readable and writable by every session and agent, and is where
`coding-task-inception` reads it from. Create the `<slug>/` directory if it does not exist.


**Do not add a pointer to `MEMORY.md`.** That file is the always-loaded memory index and holds
durable facts only; task artifacts are found by path, not by recall. The `<slug>` is coined here,
in Phase 1, from the task framing — state it to the user, and record it in the report's frontmatter
so the later skills resolve the same directory.

Write it **as you go**, appending each topic's findings when you present them — not once at the end.
If the session is interrupted, what is on disk is what survives.

The file carries:

- frontmatter with `name`, `description`, `metadata.type: project`
- **the framing** — the bigger picture, what it contributes toward, the high-level task description
- **the topic list**, numbered, domain and technical separated, each marked explored / open
- **per topic: the question, the finding, and the evidence** — file:line citations, URLs fetched
  with the date, selectors and values seen, commands run and their output. A finding without
  evidence is an opinion.
- **Domain concepts** — a glossary of the terms the task touches, in the app's own vocabulary, with
  the rules and the edge cases attached
- **Technical implementation details** — structure, call chains, data sources, contracts, config
  keys, environments, existing tests covering the area
- **Contradictions and gaps** — where docs disagree with code, where the external source disagrees
  with expectations, and what remains unknown
- **Scope-impact callouts** — the flagged items from *Standing rules*, with their reasons,
  affected areas and uncertainties; surface the significant ones in the report's top summary
- **Open questions for inception** — decisions this discovery deliberately did not make
- a dated log of the discovery sessions, and instructions that any agent may update the file

Keep it factual. Anything shaped like "we should therefore..." is a plan and belongs to inception.

### Codex-specific persistence

In Codex, also persist the report at `.codex/coding-tasks/<task-slug>/discovery.md` in the
repository. Resolve `<task-slug>` by inspecting `.codex/coding-tasks/` and reusing the matching
`task.md`; if no matching task exists, create a short lowercase kebab-case slug and record it in
`task.md`. Use this Codex path for all later reads and writes in this workflow.

## Phase 5 — Exhaust and verify

Only when the topic list is exhausted. Before declaring that, **ask explicitly** whether there are
more topics, sub-topics, questions or follow-ups — the user often has one more once they see the
shape of what you found.

Then:

1. **Verify and double-check the findings.** Go back over the report and re-confirm each one against
   the real source, not against your notes. Cited file:line still says what you claimed; the URL
   still returns what you parsed; the config key still exists. Findings written early in a long
   session are the ones that rot. Correct what is wrong and say what you corrected.
2. **Add a summary at the top** — short: what was explored, and the headline findings. A reader
   should get the shape of it in under a minute without scrolling. Include in this summary the
   framing that came from the Phase 1 answers — the bigger picture, what the task contributes to,
   and the high-level description.
3. **Present the final document** and ask whether it is complete or whether there is more to
   explore. Wait. Expect rounds; fold each one in and re-present.

After the retrospective, tell the user the report is ready and where it is. Do not start
`coding-task-inception` yourself; starting inception is their call.

## Phase 6 — Retrospect

Retrospect on the **Discovery workflow itself** after the findings report is settled. Assess how
the framing, evidence gathering, scope decisions and hand-off worked. Technical findings alone do
not satisfy this retrospective. Present supported improvements to this skill, or say explicitly
that none were identified.

Ask the user specifically whether they want to add or change anything about the **Coding Task
Discovery workflow**, and wait for their answer. An answer to another phase's retrospective, or a
generic earlier answer, does not count. Address the answer before closing; an explicit decision to
skip the Discovery retrospective also permits closure.

Record a distinct `Discovery retrospective` outcome in this task's `discovery.md`: workflow
lessons, skill changes made (or none), and the user's Discovery-specific answer or explicit skip.

## Phase 7 — Close

Before closing, check that `discovery.md` contains the distinct Discovery retrospective outcome
from Phase 6, including the user's Discovery-specific answer or explicit skip. Complete Phase 6 if
it is missing; another phase's retrospective cannot fill this gate.

**Tell the user** — you cannot run this yourself; `/compact` is a command they type:

> Discovery is complete and the report is at `<path>`. Before starting the Inception you may want
> to compact this session:
> `/compact keep all the relevant findings from this discovery before moving to the Inception`

Say also that compacting is optional and the hand-off does not depend on it: the findings report
is on disk, and that file — not this conversation — is what `coding-task-inception` reads.



## Standing rules

**Highlight consequential scope.** For Domain topics, Technical topics, and any other scope
considered for the task, explicitly flag to the user any item whose implementation has a large
blast radius, requires significant time or effort, or carries high risk or impact. Call out which
of these applies, why, and the affected users, systems or dependencies, using the available
evidence. Distinguish confirmed consequences from estimates and unknowns; do not invent precise
effort estimates. Highlight these items when first presenting the topic list and whenever later
findings reveal or materially change their significance, and preserve the callouts in the findings
report. This informs scope decisions; it does not authorize implementation or turn discovery into
a plan.

**The topic list is open, always.** At any point the user may add a topic, add a sub-topic, ask a
new question, or drill into an earlier answer. Take it, add it to the numbered list in the report,
and place it — either explore it now or say where it sits in the order. Never treat an addition as
scope creep, and never quietly drop one.

**Evidence over recall.** Every finding is traceable to something you actually read, fetched or ran
in this session. If you are working from memory of this codebase, go and check.

**Honesty over completeness.** "I could not determine X, and here is what I tried" is a valid
finding and belongs in the report. Filling a gap with a plausible guess is the one failure mode that
survives into the plan and then into the code.

**Git.** Stay on the current branch. No commits, no staging, no stash, no clean. The working tree
ends as the user left it, except for this workflow's report, task metadata and scratch notes.

## Anti-patterns

- Treating technical findings, another phase's retrospective, or an earlier generic answer as the
  Discovery retrospective; closing without its distinct outcome in `discovery.md`.

- Exploring before the framing questions are answered.
- Writing application code, or modifying the repo tree beyond the report, task metadata and scratch notes.
- Producing a plan, sub-tasks or an implementation sequence — that is inception's job.
- Describing an external data source without fetching it.
- Recording a finding without a file:line, URL or command backing it.
- Declaring a topic done at "plausible" rather than at "detailed enough to act on".
- Closing out without asking whether more topics or follow-ups remain.
- Skipping the double-check of findings written earlier in the session.
- Keeping the report only in the conversation, where the next session cannot read it.
- Running builds or tests against the shared local services without asking.

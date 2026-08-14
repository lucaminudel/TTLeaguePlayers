---
name: coding-task-discovery
description: Explore the business-domain concepts and technical implementation details behind a coding task, and persist a Discovery findings report that feeds the Coding Task Inception. Use when the user says "Coding Task Discovery", or asks to explore or research a task before planning it.
model: opus
effort: medium
allowed-tools: Bash(cat:*)
---

# Coding Task Discovery

First of the four. It runs **before** `coding-task-inception` and produces its input.

The output is a **persisted Discovery findings report** — the business-domain concepts and the
technical implementation details the task depends on. Not a plan, not sub-tasks, not code. Planning
belongs to inception; if you find yourself sequencing work, you have left this skill.

Discovery is **read-only**. Read the codebase, fetch live external pages, search the web. Write
nothing into the repo tree except the report's own scratch notes, and no application code at all.

---
```!
cat ${CLAUDE_PROJECT_DIR}/.claude/skills/shared/interaction-protocol.md
```

---

## Phase 1 — Frame the task
**This phase carries the one documented exception to the one-ask rule, and it is narrow.** The four
framing questions below may go out together, in a single message, **only** when you have nothing of
your own to attach to any of them: no question, no choice, no point to raise, no information from
previous work — an earlier session, a prior report, a brief the user already gave you — that bears
on one of the four. Discovery is the first of the four skills, so on a cold start that is usually
the case, and the batch is allowed.
The moment you have something of your own to add to even one of the four, **the exception lapses**.
Then: post the four points as a list so the user can see the shape, with **no ask attached to that
message**, and afterwards work through them one message at a time, folding your own question or
information into the point it belongs to. Never attach your point to a batch of four questions.

Ask for:

1. **The bigger picture** — which end-user feature or outcome does it serve?
2. **What it contributes to** — how does this task contribute to that? What is its part?
3. **A high-level description** of the task itself.
4. **What to explore** — which topics they want covered, which questions they want answered.

Also collect any references they name — files, URLs, tickets, screenshots, prior conversations —
and read every one of them in full before exploring anything.
If they give you only some of the four, ask for the rest rather than inventing it — and once the
first answers are in you are no longer on a cold start, so those follow-ups go **one per message**.
The framing is
what stops discovery from sprawling: a topic that serves neither the bigger picture nor a stated
question does not belong in the report.

IMPORTANT!: Apply to every hand-over message to the user the 'One Ask Per Message Rule', 'the One Point Per Message Rule', and the 'Presenting Rule for the One Ask Per Message and the One Topic Per Message'.

## Phase 2 — Agree the topic list

Turn what they gave you into an explicit, numbered list of topics and questions, and present it
before exploring. Separate:

- **Domain topics** — concepts, rules, actors, lifecycles, vocabulary. What the app means.
- **Technical topics** — structure, call chains, data sources, contracts, environments, testing.
  How the app is built.

Add topics and questions of your own that the framing implies but the user did not name, and mark
them as yours so they can drop them. Note the ones you judge highest-risk — the ones where being
wrong would cost the most later — and propose starting there.

Get agreement on the list before phase 3. The list is not frozen (see *Standing rules*), only
agreed.

**The list is one ask, and the list is the whole message.** Present it and ask the single question
"is this the right list?". Do not also ask which topic to start with, do not also raise a doubt
about topic 4, and do not also ask a framing question you forgot in phase 1 — each of those is its
own later message, after the list is agreed.

IMPORTANT!: Apply to every hand-over message to the user the 'One Ask Per Message Rule', 'the One Point Per Message Rule', and the 'Presenting Rule for the One Ask Per Message and the One Topic Per Message'.

## Phase 3 — Explore and discuss, one topic at a time

For each topic in turn: explore it, write up the findings, **present them, and wait** for the user
to react before moving to the next. They may accept it, correct it, ask for more depth, or open a
new topic on the spot. Do not batch the whole exploration and present it at the end.

A topic is done when the answers are **detailed enough to act on** — concrete values, exact paths,
named identifiers, real examples — not when they are merely plausible.

IMPORTANT!: Apply to every hand-over message to the user the 'One Ask Per Message Rule', 'the One Point Per Message Rule', and the 'Presenting Rule for the One Ask Per Message and the One Topic Per Message'.

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
- **Open questions for inception** — decisions this discovery deliberately did not make
- a dated log of the discovery sessions, and instructions that any agent may update the file

Keep it factual. Anything shaped like "we should therefore..." is a plan and belongs to inception.

IMPORTANT!: Apply to every hand-over message to the user the 'One Ask Per Message Rule', 'the One Point Per Message Rule', and the 'Presenting Rule for the One Ask Per Message and the One Topic Per Message'.

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

These three steps are **three messages, in this order**, not one. Step 1's corrections are a report
with no ask. Step 3 carries the single ask — and only after the "any more topics?" question above
has been asked and answered, since that one comes first and is an ask of its own. If the
re-verification in step 1 turned something up that needs a decision, that decision is its own
message too, settled before you present the final document.

Do not hand off to `coding-task-inception` yourself. Tell the user the report is ready and where it
is; starting inception is their call.

IMPORTANT!: Apply to every hand-over message to the user the 'One Ask Per Message Rule', 'the One Point Per Message Rule', and the 'Presenting Rule for the One Ask Per Message and the One Topic Per Message'.

## Phase 6 — Retrospect

Review how phases 1–5 actually went and fold anything durable back into this skill. Corrections the
user made are the highest-value input — especially topics you should have proposed and did not,
findings you asserted without evidence and had to walk back, and sources you should have checked
earlier. Ask the user if they want to add any other improvement to this skill.

**Where the improvement goes — check before editing anything.** Phase logic (the steps, their
order, what this phase produces) belongs in this file. Anything about the interaction protocol —
the One Ask and One Point rules, the pre-send gate, the shape of a hand-back — belongs in
`.claude/skills/shared/interaction-protocol.md`, which all four skills inject verbatim at load
time.

**Never edit the protocol text as it appears in a rendered skill.** What you see inline was
injected from that one shared file; editing it in place either silently diverges the four skills
or is discarded the next time the file is read. Open the shared file and change it there, once.

## Phase 7 — Close

**Tell the user** — you cannot run this yourself; `/compact` is a command they type:

> Discovery is complete and the report is at `<path>`. Before starting the Inception you may want
> to compact this session:
> `/compact keep all the relevant findings from this discovery before moving to the Inception`

Say also that compacting is optional and the hand-off does not depend on it: the findings report
is on disk, and that file — not this conversation — is what `coding-task-inception` reads.

```!
cat ${CLAUDE_PROJECT_DIR}/.claude/skills/shared/orchestration.md
```

## Standing rules

**The topic list is open, always.** At any point the user may add a topic, add a sub-topic, ask a
new question, or drill into an earlier answer. Take it, add it to the numbered list in the report,
and place it — either explore it now or say where it sits in the order. Never treat an addition as
scope creep, and never quietly drop one.

**Asking the user.** Presenting a topic's findings, asking to run something, closing out — each is
a stop, and every stop follows *Presenting the one ask you do send* in the interaction protocol
above.

**Evidence over recall.** Every finding is traceable to something you actually read, fetched or ran
in this session. If you are working from memory of this codebase, go and check.

**Honesty over completeness.** "I could not determine X, and here is what I tried" is a valid
finding and belongs in the report. Filling a gap with a plausible guess is the one failure mode that
survives into the plan and then into the code.

**Git.** Stay on the current branch. No commits, no staging, no stash, no clean. The working tree
ends exactly as the user left it.

IMPORTANT!: Apply to every hand-over message to the user the 'One Ask Per Message Rule', 'the One Point Per Message Rule', and the 'Presenting Rule for the One Ask Per Message and the One Topic Per Message'.

## Anti-patterns

- Exploring before the framing questions are answered.
- Writing application code, or modifying the repo tree at all.
- Producing a plan, sub-tasks or an implementation sequence — that is inception's job.
- Describing an external data source without fetching it.
- Recording a finding without a file:line, URL or command backing it.
- Declaring a topic done at "plausible" rather than at "detailed enough to act on".
- Closing out without asking whether more topics or follow-ups remain.
- Skipping the double-check of findings written earlier in the session.
- Keeping the report only in the conversation, where the next session cannot read it.
- Running builds or tests against the shared local services without asking.

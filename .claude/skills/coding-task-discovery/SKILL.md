---
name: coding-task-discovery
description: Explore the business-domain concepts and technical implementation details behind a coding task, and persist a Discovery findings report that feeds the Coding Task Inception. Use when the user says "Coding Task Discovery", or asks to explore or research a task before planning it.
---

# Coding Task Discovery

First of the four. It runs **before** `coding-task-inception` and produces its input.

The output is a **persisted Discovery findings report** — the business-domain concepts and the
technical implementation details the task depends on. Not a plan, not sub-tasks, not code. Planning
belongs to inception; if you find yourself sequencing work, you have left this skill.

Discovery is **read-only**. Read the codebase, fetch live external pages, search the web. Write
nothing into the repo tree except the report's own scratch notes, and no application code at all.

## Phase 1 — Frame the task

Ask the user (as one batch, and wait unless for one or more of these points you have questions, choices, points to raise, additional info related to one or more of these points; in such case you can print the list of all the points and then go through one by one including your questions etc.):

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

Get agreement on the list before phase 3. The list is not frozen (see *Standing rules*), only
agreed.

## Phase 3 — Explore and discuss, one topic at a time

For each topic in turn: explore it, write up the findings, **present them, and wait** for the user
to react before moving to the next. They may accept it, correct it, ask for more depth, or open a
new topic on the spot. Do not batch the whole exploration and present it at the end.

A topic is done when the answers are **detailed enough to act on** — concrete values, exact paths,
named identifiers, real examples — not when they are merely plausible.

Make sure to ask quesitons to the the user one topic at the time, and if there are sub-topic one sub-topic at the time, untile the sub-topic or topic is fully clarified.
Do not ask questions about multiple topics or sub-topics at the same time unless it is necessary because there are dependencies or tradeoffs between multiple topics or sub-topics that you want to explore with the user. 

When you present the conclusion on a topic or question, even more if that include reports of gaps, ask the user if they consider the topic completed before presenting info or questions on other topics.

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

Running a read-only command against the cloud environment, and Cognito is permitted, but **ask permission 
first**. Running a mutating or state changing command against the cloud environment, and Cognito is NOT permitted.
Running an existing test or a build purely to **observe current behaviour** is allowed, but **ask permission 
first** — the local SAM, web server and DynamoDB are shared state the user may be using, and a build
can invalidate a running `sam local start-api`. Never modify a test to make it reveal something;
never write application code.

## Phase 4 — The findings report

Maintained at
`~/.claude/.../memory/discovery-<slug>.md`, with a
pointer line added to `MEMORY.md`. That location is readable and writable by every session and
agent, and is where `coding-task-inception` reads it from.

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

## Phase 5 — Close out

Only when the topic list is exhausted. Before declaring that, **ask explicitly** whether there are
more topics, sub-topics, questions or follow-ups — the user often has one more once they see the
shape of what you found.

Then:

1. **Verify and double-check the findings.** Go back over the report and re-confirm each one against
   the real source, not against your notes. Cited file:line still says what you claimed; the URL
   still returns what you parsed; the config key still exists. Findings written early in a long
   session are the ones that rot. Correct what is wrong and say what you corrected.
2. **Add a summary at the top** — short: what was explored, and the headline findings. A reader
   should get the shape of it in under a minute without scrolling. Indluce in this summary the framing coming from the answers of the Phase 1 — Frame the task,
3. **Present the final document** and ask whether it is complete or whether there is more to
   explore. Wait. Expect rounds; fold each one in and re-present.

Do not hand off to `coding-task-inception` yourself. Tell the user the report is ready and where it
is; starting inception is their call.

## Phase 6 — Retrospect

Review how phases 1–5 actually went and fold anything durable back into this skill. Corrections the
user made are the highest-value input — especially topics you should have proposed and did not,
findings you asserted without evidence and had to walk back, and sources you should have checked
earlier. Ask the user if they want to add any other improvement to this skill.

## Standing rules

**The topic list is open, always.** At any point the user may add a topic, add a sub-topic, ask a
new question, or drill into an earlier answer. Take it, add it to the numbered list in the report,
and place it — either explore it now or say where it sits in the order. Never treat an addition as
scope creep, and never quietly drop one.

**Asking the user.** Every time you stop — presenting a topic's findings, asking to run something,
closing out — the user is arriving cold. Give them a short summary with enough context to respond without re-reading the
transcript:

- **What you were doing** — a summary of which topic or question are the subject, and which sources you used.
- **What you found, and how confident you are** — separate what you verified from what you inferred.
- **What you would do next**, and the alternatives, with what each would cost in time and what it
  would buy.

Keep it short enough to read in under a minute.
In the presentation make a clear visual distinction between the info you present and the questions or next steps expected from the user.

**Evidence over recall.** Every finding is traceable to something you actually read, fetched or ran
in this session. If you are working from memory of this codebase, go and check.

**Honesty over completeness.** "I could not determine X, and here is what I tried" is a valid
finding and belongs in the report. Filling a gap with a plausible guess is the one failure mode that
survives into the plan and then into the code.

**Git.** Stay on the current branch. No commits, no staging, no stash, no clean. The working tree
ends exactly as the user left it.

## Anti-patterns

- Exploring before the framing questions are answered.
- Writing application code, or modifying the repo tree at all.
- Producing a plan, sub-tasks or an implementation sequence — that is inception's job.
- Batching all topics and presenting once at the end.
- Describing an external data source without fetching it.
- Recording a finding without a file:line, URL or command backing it.
- Declaring a topic done at "plausible" rather than at "detailed enough to act on".
- Closing out without asking whether more topics or follow-ups remain.
- Skipping the double-check of findings written earlier in the session.
- Keeping the report only in the conversation, where the next session cannot read it.
- Running builds or tests against the shared local services without asking.
- Spawning subagents; this protocol is done inline unless the user asks otherwise.

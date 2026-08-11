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

Remember to apply the One Ask Per Message Rule and the One Point Per Message Rule.

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

Remember to apply the One Ask Per Message Rule and the One Point Per Message Rule.

## Phase 3 — Explore and discuss, one topic at a time

For each topic in turn: explore it, write up the findings, **present them, and wait** for the user
to react before moving to the next. They may accept it, correct it, ask for more depth, or open a
new topic on the spot. Do not batch the whole exploration and present it at the end.

A topic is done when the answers are **detailed enough to act on** — concrete values, exact paths,
named identifiers, real examples — not when they are merely plausible.

Remember to apply the One Ask Per Message Rule and the One Point Per Message Rule.

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

Remember to apply the One Ask Per Message Rule and the One Point Per Message Rule.

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

These three steps are **three messages, in this order**, not one. Step 1's corrections are a report
with no ask. Step 3 carries the single ask — and only after the "any more topics?" question above
has been asked and answered, since that one comes first and is an ask of its own. If the
re-verification in step 1 turned something up that needs a decision, that decision is its own
message too, settled before you present the final document.

Remember to apply the One Ask Per Message Rule and the One Point Per Message Rule.

Do not hand off to `coding-task-inception` yourself. Tell the user the report is ready and where it
is; starting inception is their call.

## Phase 6 — Retrospect

Review how phases 1–5 actually went and fold anything durable back into this skill. Corrections the
user made are the highest-value input — especially topics you should have proposed and did not,
findings you asserted without evidence and had to walk back, and sources you should have checked
earlier. Ask the user if they want to add any other improvement to this skill.

## Phase 7 — Close

At the end when all is done do a:
/compact keep all the relevant findings from this discovery before moving to the Inception

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
- Describing an external data source without fetching it.
- Recording a finding without a file:line, URL or command backing it.
- Declaring a topic done at "plausible" rather than at "detailed enough to act on".
- Closing out without asking whether more topics or follow-ups remain.
- Skipping the double-check of findings written earlier in the session.
- Keeping the report only in the conversation, where the next session cannot read it.
- Running builds or tests against the shared local services without asking.

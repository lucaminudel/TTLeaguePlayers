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
   list or a document — a topic list, a plan, a work summary, a PR guide, a triage
   overview — it is exempt from the five-line threshold: the user reads it
   as a single artefact, in one pass, which is the point of producing it. In exchange it
   must be the message's **entire** content. Nothing travels with it: no second point, no
   ask, no preamble raising something else, no "so, shall I start with the first one?" at
   the bottom. The exemption is what makes the message readable; anything added takes it
   back.

   **The exemption is about structure, not about labels.** It applies to an artefact the
   reader takes in as one thing — a task table, a plan, a triage overview. It does **not**
   apply to a numbered list of independent items merely because a phase requires one. A
   findings report of ten findings is ten points: the fact that the phase calls for "a
   report" does not fuse them into one. Apply the test — *could the user accept this one
   and reject the next?* — to the items **inside** the deliverable, not to the
   deliverable's name.

**Closure is explicit.** When you present a conclusion on a point — especially one
reporting gaps — ask whether the user considers it complete **before** presenting anything
about the next point. That closure question is an ask, so under the **One Ask Per Message
Rule** it goes in its own message, never in the one that opens the next point.

**This rule limits the message, not the ask count.** A three-point message with no
question mark anywhere in it still breaks it. So does a point-by-point review of a list
the user wrote themselves. And the **One Ask Per Message Rule** applies **inside** a single
point: one finding that raises a gap, a value to confirm and a choice of depth is three
asks, so three messages, not one.

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
document you produced, a poing as described before in the 'One Point Per Message Rule'.

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

## Presenting Rule for the One Ask Per Message and the One Topic Per Message

The two rules above govern *how many*. This one governs *what the one you send must contain*.

**Every time you stop, the user is arriving cold** — when you are making an ask or presenting one point.
They have not read the transcript, do not remember the last twenty tool calls, and have not
opened the diff. Lead with a clear short summary as if the user knew noghing about what you are doing and where you are:

- **What is the current overall task and goal and the specific current sub-task** — where are you coming from with this.
- **What you were doing** — which topic, question, phase, files or commands are the subject, and
  which sources you used.
- **The root cause** — why you are stopping. Not the symptom: the actual reason the problem, need
  or question exists.
- **What you found, and how confident you are** — separate what you **verified** from what you
  **inferred**. A finding and a guess must not arrive looking alike.
- **The options** — every one you can see, and for each: how big a change it is, what it affects
  downstream, and its pros and cons, including the cost of doing nothing. Say which you recommend
  and why.

**Keep it under a minute to read.** The test is whether the user can tell at a glance what it is
about, what they can do, and what each choice costs. A bare "should I proceed?", or a question that
assumes they remember the last twenty tool calls, fails that test.

**Visually separate in clear and obvious way the above information presented to the user from what the ask or comment request/opportunity presented to the user.** 
Make a clear visual distinction between what you are telling them and what you need back. For example put the two section under a   different top-level headers, use a different colour or icon for the final question to the user, etc.
Put  headers of a higher level, use a different colour for the 
That separation is also the **last check of the pre-send gate**: it in its own clearly-marked section at the end. If that section needs a second bullet, the message is carrying two asks — split it.

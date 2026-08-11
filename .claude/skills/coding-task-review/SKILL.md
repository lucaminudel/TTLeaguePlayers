---
name: coding-task-review
description: Adversarially review the uncommitted work produced by the Coding Task Execution skill, fix the high-priority findings, and hand the user a PR-review guide and commit message for the pending changes. Use when the user says "Coding Task Review", or asks to review the work done before committing.
---

# Coding Task Review

Fourth and last of the four. Inputs are the plan and the work summary that
`coding-task-inception` and `coding-task-execution` persisted, plus the uncommitted changes those
produced in the working tree:

- `~/.claude/projects/.../memory/plan-<slug>.md`
- `~/.claude/projects/.../memory/work-summary-<slug>.md`

If neither exists, stop and say so — there is nothing to review against. If only one exists, say
which is missing and what you therefore cannot check, then proceed.

The output is **a reviewed, green, committable working tree and a guide for reviewing it** — not a
commit. You never commit.

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
## Phase 0 — Start from green

A review of a red build reports the build, not the code. So before reading a single diff, establish
that the last complete verification passed.

Look for the tier-2 run in the plan's progress log and the work summary's final entry: the command
`./scripts/ci_tasks/run_full_stack_builds_tests_pipeline.sh COGNITO`, on the **test** environment,
with live Cognito, and its recorded outcome. Do not accept a tier-1 dev run as a substitute.

- **Not run, or run before the last change landed** — ask the user to run it. Do not launch it
  yourself; it is long-running and touches the shared test environment.
- **Run and failed** — present the failures with the actual output quoted, framed as *Asking the
  user* under Standing rules describes, then **ask the user what
  to do**. They will reply with instructions specific to that failure: fix it yourself, they will
  fix it, it is a known flake to ignore, restart a stale service, and so on. Do not decide on your
  own initiative whose problem it is, and do not start diagnosing or fixing before they answer.
  Once they have instructed you, follow that instruction, get to green, and only then enter phase 1.
- **Run and passed** — record the date and the outcome line, and continue.

Remember to apply the One Ask Per Message Rule and the One Point Per Message Rule.

## Phase 1 — Read the diff and reconstruct intent

Scope is **the changes the plan and work summary account for**. Everything else pending in the tree
is listed, not reviewed.

```bash
git status --short
```

```bash
git diff HEAD -- <plan-related paths>
```

Untracked files that the plan created will not appear in `git diff HEAD` — read them in full
directly. Check for them explicitly rather than assuming the diff is complete.

Then partition, and say so out loud before reviewing:

| Bucket | Treatment |
|---|---|
| Files the plan/work summary account for | reviewed, line by line |
| Files pending in the tree that they do not | named in a list, flagged as riding along in the same commit, not reviewed |

Now reconstruct intent. For each reviewed file, read the work summary's claim about *why* it
changed, and the plan's sub-task that owns it. A diff you cannot map to a sub-task is itself a
finding — either the work summary is incomplete or the change was unplanned.

Read the file's *surroundings*, not just its diff. Most consistency findings come from the
neighbouring code that did not change.

Remember to apply the One Ask Per Message Rule and the One Point Per Message Rule.

## Phase 2 — Review, adversarially

Do this **inline, yourself, in this session**. No subagents.

The difficulty is that you likely wrote this code, and your default posture is to confirm it. So
invert it deliberately: for each change, the question is not "is this reasonable?" but **"what
input, ordering, or environment makes this wrong?"** Try to produce a concrete failing case. A
finding without one is a smell, not a finding.
Re-read the standards before judging against them, rather than from memory:

- `prompts/workflow/steps_guidelines/WriteTestsGuidelines.md`
- `prompts/workflow/steps_guidelines/FixRedTestGuidelines.md`
- the `prompts/codebase_info/*DomainLogic.md` for the area touched

### The lenses

**Code quality, simplicity, consistency.** Does it look like the code around it — naming, file
layout, error style, comment density? Is there a simpler shape that does the same job? Abstractions
introduced for one caller are suspect. So is any new pattern that duplicates one already in the
repo under a different name.

**Dependencies and direction.** Does anything new point the wrong? Look for cycles.

**Claims made in comments are findings to verify, not context to absorb.** Any comment asserting
that something is impossible, unreachable, always/never true, or that "nothing in this codebase does
X" is a factual claim — check it against the code before accepting it, and treat a false one as a
finding even when the behaviour is right. Two of these appeared in a single review: one caught, one
missed because the comment said "unreachable" and that was taken at face value. The danger is not the
wrong comment; it is that the comment stops you looking, and it is usually load-bearing — the stated
justification for the very decision under review.


**Bugs.** For what this change actually touches:
- **Decorators and wrappers that silently drop methods.** A method added to an interface is dead
  code if a wrapper between factory and caller does not forward it. Trace the call chain from the
  caller to the concrete class, through every wrapper, before believing a method is reachable.
- **Cache keys**, where caching is involved: two entities sharing a key, or a key that omits part of
  what makes the payload unique, corrupts data across users and contexts.
- **Parsing of external content**, where any is involved: relative vs absolute URLs, entity
  encoding, casing, and `null`/missing-element paths in every lookup chain.
- Error paths: what does the user see when the fetch 404s, the element is absent, the config key is
  empty?

**Test quality and coverage.** Against `WriteTestsGuidelines.md`: builders over inline literals,
stubs vs mocks used as the guidelines define them, teardown that actually cleans up, and **no
mutable fixture shared between spec files** — Playwright runs spec files in parallel workers. Then
the coverage question: for each behaviour added, is there a test that fails if you break it? Delete
a line mentally and ask which test goes red. Assertions on "did not throw" cover almost nothing.
- Where the change reads an external source, check that the split between frozen-fixture tests and
  live tests is right: exact values pinned against the fixture, only what survives the source
  changing asserted live.
- **Playwright specs run in Node and have no DOM.** Any `DOMParser` use in an e2e spec fails with
  `ReferenceError: DOMParser is not defined`; parser assertions belong in Vitest, which only works
  because `vite.config.ts` sets `environment: 'jsdom'`.

**Security.** For what this change added:
- External or user-supplied strings reaching the DOM — any `innerHTML`, `dangerouslySetInnerHTML`,
  or unescaped interpolation is a real finding.
- **Personal data in committed test fixtures.** Captured pages and recorded payloads carry personal
  data. Check every fixture in the diff for residuals — names, phone numbers, emails, addresses —
  and check the WHOLE fixture, not just the block the tests read: scrubbing is done by hand and gets
  missed exactly where nothing asserts on it.
  **This is the one lens that must look outside the diff.** Once a residual is found, grep the whole
  repo for it: captured pages get copied between the unit and e2e trees, and the other copy is often
  already committed. Say so plainly if it is — scrubbing the working tree does not remove it from
  history, and only the user can decide on a rewrite.
- Secrets, tokens or private URLs added to `config/*.env.json` — these ship to the browser via
  Vite's verbatim injection and are public by construction.
- What gets written to `localStorage`, and whether it should be.
- New external hosts fetched, and whether a CORS proxy is being used to reach them.

You are encourage to use your commands: 
  /simplify 
  /code-review 
  /security-review 

Remember to apply the One Ask Per Message Rule and the One Point Per Message Rule.

## Phase 3 — Triage, then stop

Rank every finding. **High-priority** means it would break behaviour, lose or expose data, hide a
regression, or make a reviewer reject the PR. Everything else is not high-priority, however
appealing it looks.

Verify every finding against the real files before reporting it. Drop anything you cannot
reproduce; do not report it as a "possible issue".

**The exact message sequence. Do not compress it.**

**Message 1 — the overview, with NO ask in it.** Two lists:

1. **High-priority findings**, each with: file:line, what is wrong, the concrete failing case, and
   the proposed fix. Followed by a fix plan — ordered, with the verification each fix needs.
2. **Noted, not actioned** — everything lower. Named, one line each, no fix plan.

End it by saying nothing is being changed yet, and **stop**. No question — not even "shall I fix
finding 1?", not "does the ordering look right?", not "anything you'd add?". Attaching a question to
the bottom of the overview reads as one wall of findings *plus* a decision, which is exactly the
bundling this phase forbids: the reader has to hold ten unresolved items in their head to answer
one. It is not a smaller violation because only one question mark was used; the overview is already
a lot to absorb. The two lists exist so the user can see the whole picture before deciding anything
— that part is a single presentation. Deciding is not.

**Message 2 — finding 1, and only finding 1.** Present it as *Asking the user* under Standing rules
describes: where it came from, why it is wrong, the failing case, and for the fix its size, its
blast radius and the alternative of leaving it. One ask: what to do about this finding. Then wait.

**Then: settle it, fix it, verify it — and only then move to finding 2**, in its own message, same
shape. Never "approve findings 1, 2 and 3?", and never a recommendation that bundles them: each has
its own failing case, its own fix, its own cost, and the user may reshape one and reject another.

Change nothing until the user approves a fix. If they amend the plan, fold the amendment in and
re-present that one finding.

Every later message in this phase obeys the same gate. When a fix turns out wider than it looked,
report that alone and stop — do not also ask what to do about the next finding. When a fix goes
green, say so and move on; that report carries no ask.

The temptation to bundle is strongest here because the analysis is finished and it all feels like
one deliverable. It is not one deliverable to the person answering — and a bundled question quietly
pushes them to accept a fix they would have improved. In practice they often will: expect the user's
alternative to beat your proposal, particularly on operational cost, and treat that as the normal
outcome rather than a correction.

Remember to apply the One Ask Per Message Rule and the One Point Per Message Rule.

## Phase 4 — Fix

Execute the approved plan only. Nothing from list 2 gets touched, and no cleanup gets folded in
along the way — the diff must not grow during its own review.

Verify with the commands and the two-tier discipline in the `coding-task-execution` skill, Phase 5.
In short:

| Fix touched | Run |
|---|---|
| Frontend source | `npm run "build-web:dev-env"` plus the specs covering the changed files |
| `config/*.env.json` | the backend suite — `LoaderTest` is a Theory over all four environments |
| Test or fixture only | just that suite |
| Backend C# | `sam build --config-env dev` **then** the backend suite |
| Anything, once all fixes are in | the whole of tier 1; then ask the user to re-run tier 2 |

A fix that does not go green is not done. If a fix turns out to be wrong or wider than it looked,
stop and say so rather than expanding it silently.

Re-running the full pipeline after the fixes is the user's call and the user's command — ask, state
why it is needed, and wait. That request is its own message: it does not travel with the summary of
the fixes just applied, and it does not travel with the PR guide.

Remember to apply the One Ask Per Message Rule and the One Point Per Message Rule.

## Phase 5 — The PR-review guide

Write it for a human about to read the diff cold. Make it as for a software engineer that have no previous knowledge of this coding task so provide short and clear explanations. Include a **summary that makes the change
understandable on its own** — the reviewer should be given a clear and short summary of what the change is for and what it does and what to look for *before* opening a single file, and should never have to reverse-engineer a file's purpose from its
diff. Assume no memory of the plan, the execution session, or this codebase's conventions.

**It goes in its own document.** Write it, with the phase 2–4 findings, to
`~/.claude/projects/.../memory/review-<slug>.md` — a
new file, **not** appended to `work-summary-<slug>.md`. Give it the usual frontmatter (`name`,
`description`, `metadata.type: project`) and add a pointer line to `MEMORY.md`.

When the review document is completed, presentthe link to the review file.

The two documents have different readers and different lifetimes. The work summary is the *execution*
record — per sub-task, written as the work happened, and it only grows. The review guide is written
once, for a person about to read the diff cold, and it is the thing they open first. Appending the
guide to a 50-page execution log buries the document that was meant to be the entry point, and makes
the reader scroll past sub-task notes they have no reason to read.

**Do not paste the whole guide into the chat.** Post a condensed version — what the change does, the
verification status, the findings, and the reading order — and then, **as the last thing in the
final message, present the link to the document you created.** The link is the deliverable; the chat
summary exists so the user can decide whether to open it now or when they sit down to review.

**That message is a hand-over and carries no ask.** It ends with the link, not with "does this look
right?" and not with the commit message. Phases 5, 6 and 7 are three separate messages in that
order: the guide, then the proposed commit message, then the retrospect question.

The document carries:

- **What this change does** — a short paragraph, in the terms of the app rather than of the code:
  the user-visible or behavioural outcome, and the shape of the solution. Enough that the rest of
  the guide lands.
- **Verification status** — the tier-2 run and outcome, dated.
- **Findings** — high-priority ones with their resolution; noted-not-actioned ones as a list. Keep
  dismissed findings and *why* they were dismissed; that is what a later session needs most.
- **What to review, in what order** — the reading order that makes the change comprehensible, not
  alphabetical. Start with the port or the contract, then the implementation, then the wiring, then
  the tests. Say which files are mechanical (a field added in six call sites) so the reviewer can
  skim them.
- **Per file: context, change, and what to look for** — for every reviewed file, enough that the
  diff is readable without hunting for surrounding code:
  - what that file is and where it sits in the design, for a reviewer who has not opened it before;
  - what changed in it and *why*, tied to its sub-task;
  - what specifically to look for while reading it — the risk in this change, the invariant it must
    hold, the neighbouring code it has to stay consistent with, or "mechanical, skim" when there is
    genuinely nothing.
- **What to check** — the specific things a human should verify that tests do not: values against
  the live external source, config values per environment, judgement calls, anything the work
  summary flagged as needing human review, and every assumption baked into code.
- **Riding along** — the pending files from phase 1 that were out of scope, so nothing gets
  committed unnoticed.

Keep it readable in one sitting. Context and direction, never a restatement of the lines that
changed — if the reviewer could get it from the diff alone, leave it out.

Remember to apply the One Ask Per Message Rule and the One Point Per Message Rule.

## Phase 6 — Suggest the commit message

Propose the text; **do not commit and do not stage**. Cover the whole set of pending changes,
including the ones that rode along.

Body explains *why*, since the diff already shows *what*. Note user-facing behaviour changes,
config-file structure changes, and anything a future bisect would want to find. Do not sign it as
Claude unless the user asks.

Remember to apply the One Ask Per Message Rule and the One Point Per Message Rule.

## Phase 7 — Retrospect

Review how phases 0–6 actually went and fold anything durable back into this skill. Corrections the
user made are the highest-value input — especially findings you missed that they caught, and
findings you raised that turned out to be noise. Ask the user if they want to add any other
improvement to this skill.

Remember to apply the One Ask Per Message Rule and the One Point Per Message Rule.

## Standing rules


**Asking the user.** Every time you stop — a red pipeline in phase 0, the fix plan in phase 3, a fix
that turns out wider than it looked, asking for the tier-2 re-run — the user is arriving cold. Give
them enough context to decide without reading the transcript or opening the diff. Lead with a short
summary:

- **What you were doing** — a summary of which phase and which files, findings or commands are involved.
- **The root cause** — why you are stopping. Not just the symptom: the actual reason the problem,
  need or question exists.
- **The options** — each one you can see, and for each: how big a change it is, what it affects
  downstream, and its pros and cons. Say which you recommend and why.

Keep it short enough to read in under a minute. The test is whether the user can tell, at a glance,
what it is about, what they can do, and what each choice costs. A bare "should I proceed?" or a
question that assumes they remember the last twenty tool calls fails that test.

In the presentation make a clear visual distinction between the info you present and the questions or next steps expected from the user.

That visual separation is also the **last check of the pre-send gate**: put the one ask in its own
clearly-marked section at the end. If that section needs a second bullet, the message is carrying
two asks — split it.

**Git.** Stay on the current branch. No commits, no staging, no stash, no revert, no clean. The
working tree stays exactly as the user left it, plus the approved fixes.

**Scope.** The plan defines what is reviewed and the approved fix plan defines what is changed.
Review is not the moment to improve unrelated code.

**Honesty over reassurance.** A review that finds nothing is a review that was not performed. If a
change genuinely is clean, say what you checked and why it holds — do not pad the list to look
thorough, and do not soften a real finding into a suggestion.

## Anti-patterns

- Reviewing on top of a red or unverified build.
- Spawning subagents; this protocol is done inline unless the user asks otherwise.
- Reporting findings you have not verified against the real files.
- Confirming your own earlier work instead of attacking it.
- Fixing lower-priority findings, or folding in cleanups, during the fix phase.
- Starting fixes before the user approves the fix plan.
- Launching the tier-2 pipeline without asking.
- Committing or staging anything.- 
- Ending the two-list overview with a question. The overview carries no ask at all.
- Moving to the next finding before the current one is decided, fixed and verified.
- Writing a PR guide that restates the diff instead of directing attention within it.
- Listing a file in the PR guide without saying what it is, why it changed, and what to look for in
  it.
- Appending the PR guide to the work summary instead of giving it its own `review-<slug>.md`.
- Pasting the whole guide into the chat, or ending the final message with anything other than the
  link to it.
- Handing back a question, a red pipeline or a fix plan without the context, cause and options the
  user needs to answer it.
- Commands against live cloud and Cognito environment: Running a read-only command against the cloud environment, and Cognito is permitted, but **ask permission first**. Running during the review a mutating or state changing command against the cloud environment, and Cognito is NOT permitted. 

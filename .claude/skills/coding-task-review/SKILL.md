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

## The one-ask rule

**Read this before sending any message in this skill. It outranks every other instruction in this
file:** where a phase looks like it calls for two asks in one message, the phase is wrong and this
rule wins. This skill has **no exception** to it — the batched framing questions belong to
`coding-task-discovery`'s Phase 1, not here.

**A message may contain at most ONE ask.** An *ask* is anything the user has to respond to:

- a question of any size, including "does that look right?", "anything else?", "shall I continue?";
- a choice between options, or a request to confirm, approve or reject;
- a request that they run a command, supply a file, check a value, or make a decision;
- a statement of what you are about to do next where silence would count as tacit approval;
- an `AskUserQuestion` call — **one question per call, never two to four** — and one such call per
  message.

Two small asks in one message is the same violation as ten.

**The pre-send gate. Run it on every message, without exception:**

1. Re-read the message you are about to send, from the top.
2. Count the asks. Count the question marks first, then the sentences that need a response without
   one — "let me know if…", "I'll proceed with X unless…", "confirm and I'll start".
3. **Count 0** — a report, a findings list, a status update, a document hand-over. Send it and
   **stop there.** Do not append a question to save a round-trip; the next message carries the ask.
4. **Count 1** — check that everything else in the message is what the user needs *in order to
   answer that one ask*. Cut the rest; it belongs in its own message.
5. **Count 2 or more** — keep the first, move the others to later messages. **Never drop an ask to
   get the count down.** Retracting a point is not the fix and the user has rejected it explicitly:
   every point still gets asked, one message at a time.

**Reports and overviews carry no ask at all.** A findings list, a topic write-up, a plan, a status
report, a summary of what you just changed: post it, stop, and put the first decision in its own
later message. Attaching "so, shall I start with the first one?" to the bottom of an overview is the
exact bundling this rule forbids — it makes the reader hold every unresolved item in their head to
answer one question. It is not a smaller violation because only one question mark was used.

**Sequence, never batch.** Ask → wait → act on the answer → then the next ask. Where several asks
share context, present that context once in an ask-free message, then take the items one at a time,
each with enough background to be understood on its own without re-reading the transcript.

**Why:** batched asks arrive without enough context to judge any single one, and a bundled ask
quietly pushes the user into accepting something they would otherwise have reshaped. The user has
corrected this forcefully in more than one session. Saving a round-trip is never worth it to them.

*This block is identical in all four `coding-task-*` skills. If you change it, change all four.*

**This is the skill where the rule is broken most often**, because phase 3 produces a pile of
findings at once and they feel like one deliverable. They are not one deliverable to the person
answering. Phase 3 spells out the sequence; follow it literally.

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

## Phase 6 — Suggest the commit message

Propose the text; **do not commit and do not stage**. Cover the whole set of pending changes,
including the ones that rode along.

Body explains *why*, since the diff already shows *what*. Note user-facing behaviour changes,
config-file structure changes, and anything a future bisect would want to find. Do not sign it as
Claude unless the user asks.

## Phase 7 — Retrospect

Review how phases 0–6 actually went and fold anything durable back into this skill. Corrections the
user made are the highest-value input — especially findings you missed that they caught, and
findings you raised that turned out to be noise. Ask the user if they want to add any other
improvement to this skill.

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

**One ask per message.** See *The one-ask rule* at the top of this file. It applies to every message
in every phase of this skill, with no exception, and the pre-send gate runs before each one.

**Discuss with the user one topic at the time.** 
Make sure to ask quesitons to the the user one topic at the time, and if there are sub-topic one sub-topic at the time, untile the sub-topic or topic is fully clarified.
Do not ask questions about multiple topics or sub-topics at the same time unless it is necessary because there are dependencies or tradeoffs between multiple topics or sub-topics that you want to explore with the user. 

When you present the conclusion on a topic or question, even more if that include reports of gaps, ask the user if they consider the topic completed before presenting info or questions on other topics — and ask that on its own, not in the same message that opens the next topic.

"One topic per message" is the weaker constraint: **a single topic — one finding, say — can still
hold two asks, and then it is two messages.** The one-ask rule decides, not the topic count.


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
- Committing or staging anything.
- Asking the user to approve two or more findings in one question, or recommending them as a block.
- Ending the two-list overview with a question. The overview carries no ask at all.
- Putting more than one ask in any message, however small the second one is — or skipping the
  pre-send gate because the message "obviously" only asks one thing.
- Passing more than one question to a single `AskUserQuestion` call.
- Dropping or retracting a finding to get a message down to one ask, instead of moving it to the
  next message.
- Ending the PR-guide hand-over, or a "fix is green" report, with a question.
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

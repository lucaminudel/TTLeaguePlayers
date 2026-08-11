---
name: coding-task-review
description: Adversarially review the uncommitted work produced by the Coding Task Execution skill, fix the high-priority findings, and hand the user a PR-review guide and commit message for the pending changes. Use when the user says "Coding Task Review", or asks to review the work done before committing.
model: opus
effort: high
allowed-tools: Bash(cat:*)
---

# Coding Task Review

Fourth and last of the four. Inputs are the plan and the work summary that
`coding-task-inception` and `coding-task-execution` persisted, plus the uncommitted changes those
produced in the working tree:

- `~/.claude/projects/-Users-lucaminudel-Code-TTLeaguePlayers/coding-tasks/<slug>/plan.md`
- `~/.claude/projects/-Users-lucaminudel-Code-TTLeaguePlayers/coding-tasks/<slug>/work-summary.md`

List the `coding-tasks/` directory to find the slug rather than guessing it: one match, use it;
several, ask the user which.

If neither exists, stop and say so — there is nothing to review against. If only one exists, say
which is missing and what you therefore cannot check, then proceed.

The output is **a reviewed, green, committable working tree and a guide for reviewing it** — not a
commit. You never commit.

---
```!
cat ${CLAUDE_PROJECT_DIR}/.claude/skills/shared/interaction-protocol.md
```

---
## Phase 0 — Start from green

Ask the user to confirm the state of the code to be reviewed is green: all tests pass so does the full verification pipeline.
  
IMPORTANT!: Apply to every hand-over message to the user the 'One Ask Per Message Rule', 'the One Point Per Message Rule', and the 'Presenting Rule for the One Ask and the One Topic you do send'.


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

IMPORTANT!: Apply to every hand-over message to the user the 'One Ask Per Message Rule', 'the One Point Per Message Rule', and the 'Presenting Rule for the One Ask and the One Topic you do send'.

## Phase 2 — Review, adversarially

**The judgement is yours, inline, in this session.** Deciding what is wrong, what it would break,
what matters and what to tell the user is never delegated — an agent spawned from this session
carries the same blind spot as you and will confirm the same mistakes with more words.

Scoped analysis passes are a different thing and are welcome; see *Cross-check with the review
commands* at the end of this phase. They return **data**, not verdicts. Whatever they return is
verified and triaged by you, exactly like a finding you made yourself.

The difficulty is that you likely wrote this code, and your default posture is to confirm it. So
invert it deliberately: for each change, the question is not "is this reasonable?" but **"what
input, ordering, or environment makes this wrong?"** Try to produce a concrete failing case. A
finding without one is a smell, not a finding.
Re-read the standards before judging against them, rather than from memory:

- `prompts/workflow/steps_guidelines/WriteTestsGuidelines.md`
- `prompts/workflow/steps_guidelines/FixRedTestGuidelines.md`
- the `prompts/codebase_info/*DomainLogic.md` for the area touched

IMPORTANT!: Apply to every hand-over message to the user the 'One Ask Per Message Rule', 'the One Point Per Message Rule', and the 'Presenting Rule for the One Ask and the One Topic you do send'.

### The lenses

**Code quality, simplicity, consistency.** Does it look like the code around it — naming, file
layout, error style, comment density? Is there a simpler shape that does the same job? Abstractions
introduced for one caller are suspect. So is any new pattern that duplicates one already in the
repo under a different name.

**Dependencies and direction.** Does anything new point the wrong way — an inner layer reaching
outward, a domain type importing infrastructure, a shared module depending on a caller? Look for
cycles.

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

### Cross-check with the review commands

**Run them after the lenses above, never before.** Run first and they anchor you: a clean tool
report reads as permission to skip the hard thinking, which is precisely the confirmation bias this
phase exists to defeat. Do your own pass, write your findings down, *then* run these:

| Command | Covers |
|---|---|
| `/code-review` | correctness, simplification, efficiency, test coverage over the working diff |
| `/security-review` | security review of the pending changes on the current branch |

**The delta is the real signal.** Anything they surface that you did not is evidence your own pass
was too soft — say so plainly and look at what you missed and why, rather than quietly adding it to
the list. Anything you found that they did not is not thereby suspect: they do not know this
repo's domain rules, its fixture conventions, or what the plan intended.

Four rules for folding the output in:

1. **Scope.** Both look at the *whole* pending diff; this review's scope is only what the plan and
   work summary account for (Phase 1). A finding against a riding-along file does not enter triage
   — list it under *riding along* and say a tool flagged it, so the decision stays the user's.
2. **Verify before believing.** Tool findings are claims, checked against the real files like any
   other. Drop what you cannot reproduce. A tool's confidence is not evidence.
3. **Deduplicate.** They will re-report things the lenses already caught. One finding per issue,
   cited once, in Phase 3's list.
4. **Do not paste the reports into the chat.** They arrive as a wall of findings, which is the
   batching Phase 3 forbids. Their output feeds the triage; the triage is what the user sees.

Neither command fixes anything, so both are safe to run before the fix plan is approved. `/simplify`
is deliberately not in this list — it *applies* changes, and nothing changes during review until the
user approves a fix plan.

**`/code-review ultra` is not yours to launch.** It is user-triggered and billed. If the change
warrants that depth, say so and let the user decide.


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

**Message 2 — finding 1, and only finding 1.** Present it as the *Presenting Rule for the One Ask
and the One Topic you do send* describes: where it came from, why it is wrong, the failing case,
and for the fix its size, its blast radius and the alternative of leaving it. One ask: what to do
about this finding. Then wait.

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

IMPORTANT!: Apply to every hand-over message to the user the 'One Ask Per Message Rule', 'the One Point Per Message Rule', and the 'Presenting Rule for the One Ask and the One Topic you do send'.

## Phase 4 — Fix

Execute the approved plan only. Nothing from list 2 gets touched, and no cleanup gets folded in
along the way — the diff must not grow during its own review.

Verify with the commands and the **four-tier discipline** — 1-A (dev, no Cognito), 1-B (dev, scoped
Cognito), 1-C (dev, full Cognito, ask first), 2 (test env, full pipeline, ask first) — defined in
*Phase 5 — Verify before marking done* of the `coding-task-execution` skill.

That content is **not** loaded into this session. Read it from disk before relying on it:
`.claude/skills/coding-task-execution/SKILL.md`. Do not reconstruct the commands or the tier gates
from memory, and do not assume a tier is free — 1-B, 1-C and 2 all spend live Cognito and count
against the budget defined there.

A fix that does not go green is not done. If a fix turns out to be wrong or wider than it looked,
stop and say so rather than expanding it silently.

Re-running the full pipeline after the fixes is the user's call and the user's command — ask, state
why it is needed, and wait. That request is its own message: it does not travel with the summary of
the fixes just applied, and it does not travel with the PR guide.

IMPORTANT!: Apply to every hand-over message to the user the 'One Ask Per Message Rule', 'the One Point Per Message Rule', and the 'Presenting Rule for the One Ask and the One Topic you do send'.

## Phase 5 — The PR-review guide

Write it for a human about to read the diff cold. Make it as for a software engineer that have no previous knowledge of this coding task so provide short and clear explanations. Include a **summary that makes the change
understandable on its own** — the reviewer should be given a clear and short summary of what the change is for and what it does and what to look for *before* opening a single file, and should never have to reverse-engineer a file's purpose from its
diff. Assume no memory of the plan, the execution session, or this codebase's conventions.

**It goes in its own document.** Write it, with the phase 2–4 findings, to
`~/.claude/projects/-Users-lucaminudel-Code-TTLeaguePlayers/coding-tasks/<slug>/review.md` — a new
file in the same `<slug>` directory, **not** appended to `work-summary.md`.

**`MEMORY.md` gets at most one line, and only if the task produced something durable** — a decision
or constraint worth carrying into unrelated future work. The review guide itself is not that: it is
found by path. Never index the four task artifacts.

When the review document is completed, present the link to the review file.

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

IMPORTANT!: Apply to every hand-over message to the user the 'One Ask Per Message Rule', 'the One Point Per Message Rule', and the 'Presenting Rule for the One Ask and the One Topic you do send'.

## Phase 6 — Suggest the commit message

Propose the text; **do not commit and do not stage**. Cover the whole set of pending changes,
including the ones that rode along.

Body explains *why*, since the diff already shows *what*. Note user-facing behaviour changes,
config-file structure changes, and anything a future bisect would want to find. Do not sign it as
Claude unless the user asks.

IMPORTANT!: Apply to every hand-over message to the user the 'One Ask Per Message Rule', 'the One Point Per Message Rule', and the 'Presenting Rule for the One Ask and the One Topic you do send'.

## Phase 7 — Retrospect

Review how phases 0–6 actually went and fold anything durable back into this skill. Corrections the
user made are the highest-value input — especially findings you missed that they caught, and
findings you raised that turned out to be noise. Ask the user if they want to add any other
improvement to this skill.


**Where the improvement goes — check before editing anything.** Phase logic (the steps, their
order, what this phase produces) belongs in this file. Anything about the interaction protocol —
the One Ask and One Point rules, the pre-send gate, the shape of a hand-back — belongs in
`.claude/skills/shared/interaction-protocol.md`, which all four skills inject verbatim at load
time.

**Never edit the protocol text as it appears in a rendered skill.** What you see inline was
injected from that one shared file; editing it in place either silently diverges the four skills
or is discarded the next time the file is read. Open the shared file and change it there, once.

## Phase 8 — Close

This is the end of the four-skill sequence: the working tree is reviewed, green and committable,
and the commit message is proposed. **You do not commit** — staging and committing are the user's.

**Tell the user** — you cannot run this yourself; `/compact` is a command they type:

> The review is complete. The PR-review guide is at `<path>`, and the proposed commit message is
> above. Nothing has been staged or committed. 

```!
cat ${CLAUDE_PROJECT_DIR}/.claude/skills/shared/orchestration.md
```

## Standing rules

**Asking the user.** A red pipeline in phase 0, the fix plan in phase 3, a fix that turns out wider
than it looked, asking for the tier-2 re-run — each is a stop, and every stop follows *Presenting
the one ask you do send* in the interaction protocol above.

**Git.** Stay on the current branch. No commits, no staging, no stash, no revert, no clean. The
working tree stays exactly as the user left it, plus the approved fixes.

**Scope.** The plan defines what is reviewed and the approved fix plan defines what is changed.
Review is not the moment to improve unrelated code.

**Honesty over reassurance.** A review that finds nothing is a review that was not performed. If a
change genuinely is clean, say what you checked and why it holds — do not pad the list to look
thorough, and do not soften a real finding into a suggestion.

IMPORTANT!: Apply to every hand-over message to the user the 'One Ask Per Message Rule', 'the One Point Per Message Rule', and the 'Presenting Rule for the One Ask and the One Topic you do send'.


## Anti-patterns

- Reviewing on top of a red or unverified build.
- Spawning subagents; this protocol is done inline unless the user asks otherwise.

- Reporting findings you have not verified against the real files.
- Confirming your own earlier work instead of attacking it.
- Fixing lower-priority findings, or folding in cleanups, during the fix phase.
- Starting fixes before the user approves the fix plan.
- Launching the tier-2 pipeline without asking.
- Committing or staging anything.
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
- Commands against live cloud and Cognito environment: Running a read-only command against the cloud environment, and Cognito is permitted. Running during this Review a mutating or state changing command against the cloud environment, and Cognito is NOT permitted. 

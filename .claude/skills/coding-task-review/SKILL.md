---
name: coding-task-review
description: Adversarially review work produced by Coding Task Execution, including local deployable-unit commits and remaining changes, fix approved findings, and prepare a human review guide. Use when the user says "Coding Task Review", or asks to review the work done before committing.
model: opus
effort: high
allowed-tools: Bash(cat:*)
---

# Coding Task Review

## Codex-specific model and delegation

Use **Sol 5.6**, Medium for this phase, including autonomous unit reviews invoked from Execution. Select the
host's available Sol model; this instruction does not itself change the running session's model.
If model selection is unavailable, report the limitation rather than claiming a switch. The
frontmatter `model` is for Claude Code.
Use sub-agents for work that can proceed in parallel, especially information gathering,
research and exploration. Delegate every exploration under
[the shared orchestration rules](../shared/orchestration.md). The main adversarial pass, final
judgement and human-facing review remain with the main agent; independent read-only review
passes may supplement them under the existing independence rules.

### Suggested model — at phase start

Before beginning or resuming this phase, send this one-time commentary message:

Suggested model for this phase, for you to switch: <the model and effor suggested above>.

## Session name — at the start

At skill entry, name the current chat `Review — <existing topic>`. Remove any leading
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

Before starting Phase 0, read the shared orchestration guidance in full. Use the
reference for your environment below; resolve the relative link against this `SKILL.md`.
Apply the phase-specific rules throughout this workflow.

```!
# Claude specific
cat ${CLAUDE_PROJECT_DIR}/.claude/skills/shared/orchestration.md
```

Read the shared orchestration guidance at [../shared/orchestration.md](../shared/orchestration.md).

Fourth and last of the four. Inputs are the plan and the work summary that
`coding-task-inception` and `coding-task-execution` persisted, plus their local unit commits, when
present, and remaining task changes in the working tree:

- `~/.claude/projects/-Users-lucaminudel-Code-TTLeaguePlayers/coding-tasks/<slug>/plan.md`
- `~/.claude/projects/-Users-lucaminudel-Code-TTLeaguePlayers/coding-tasks/<slug>/work-summary.md`

Read also, when it exists, the Discovery findings report `coding-task-discovery` persisted in the
same directory — `<slug>/discovery.md`. It is not needed to *check* the diff (the plan and the work
summary are what the diff is reviewed against) but it is the richest source of the **intent** the
PR-review guide has to explain in Phase 5: the bigger picture the task serves, the domain glossary,
the live-source evidence, and the decisions that were deliberately left out.

List the `coding-tasks/` directory to find the slug rather than guessing it: one match, use it;
several, ask the user which.

If neither exists, stop and say so — there is nothing to review against. If only one exists, say
which is missing and what you therefore cannot check, then proceed.

### Codex-specific retrieval

In Codex, resolve the task state by inspecting `.codex/coding-tasks/` and reusing the matching
`task.md`. Read the corresponding files from `.codex/coding-tasks/<task-slug>/plan.md`,
`.codex/coding-tasks/<task-slug>/work-summary.md`, and, when present,
`.codex/coding-tasks/<task-slug>/discovery.md`. If several task directories match, ask the user
which one to review.

The output is **a reviewed, green, committable working tree and a guide for reviewing it** — not a
commit, except for the local unit commits explicitly authorized in *Execution unit review mode*.

## Execution unit review mode

When Execution has recorded the user's explicit choice to automatically review, commit locally and continue
between two or more independently deployable units, use this mode after each completed unit,
including the last. It is the autonomous part of Review within Execution; it does not rename the
chat, close Execution, or start the human-driven Review phases at each boundary.

- Read the confirmed plan, unit boundaries, work summary and recorded authorization. Use the
  completed unit's applicable green Tier 1 evidence as the entry condition instead of Phase 0's
  full-pipeline confirmation. Keep whole-plan Tier 2 verification at the end of Execution.
- Apply Phases 1–2's scope reconstruction and adversarial review, including applicable independent
  and command checks. Review the unit's changes and their interactions with earlier units and
  components that remain deployed; do not implement later units or modify unrelated pending work.
  The Codex Security restriction on invocation during Execution remains in force unless the user
  separately authorizes that exception. Record unavailable or unauthorized checks as coverage gaps.
- Verify and rank findings using Phase 3's criteria. In this mode, **high-impact** means the
  high-priority category defined there. The recorded mode choice preauthorizes fixes to those
  verified findings within the agreed scope, replacing the per-fix approval gate for them only.
  Record a concrete failing case, proposed fix and verification before applying each fix, then
  use Phase 4's serial verification discipline and recheck the affected behaviour and interfaces.
  Leave medium and lower-priority findings for the final human-driven review.
- If a fix requires scope changes, an unresolved design decision, additional authorization, or
  cannot be verified, stop with the finding and options. Do not continue past an unresolved
  high-impact finding. Existing Cognito budgets, test approvals and external-action limits apply.
- Persist each unit's scope, evidence, findings, fixes, remaining findings and coverage gaps in
  `review.md` in the task directory, and link that entry from `work-summary.md`. Post concise
  progress and continue under Execution's recorded mode; do not ask for per-unit human triage,
  produce the final PR guide or request the Review retrospective. After review, fixes and checks
  pass, return the unit's review outcome and evidence to Execution's main agent, which makes and
  records the single local unit commit under its Git rule before continuing. This is a workflow
  boundary, not a request for human confirmation or a second commit. Do not push or deploy.
  A failed commit blocks continuation.

After the whole plan and required final verification are complete, run the human-driven Review
workflow once. Reconcile the unit records against the final diff, review cross-unit integration
and changes since those passes, and present unresolved findings for human decisions under the
normal approval rules. Review all unit commits from the recorded starting HEAD through the final
HEAD, plus remaining task changes in the working tree, including untracked files; a pending-only
diff would miss the committed units. Keep unrelated changes outside scope. Use supported review
tool inputs for that scope and report any coverage limitation instead of claiming the unit commits
were scanned by a pending-diff-only check. Preserve the unit evidence and commit hashes in the
final review guide. Interim unit passes
do not satisfy the final Review retrospective or replace the final human review.



## Phase 0 — Start from green

Establish that the reviewed state is green, including the full verification pipeline. Reuse
recorded successful evidence from Execution when it covers this same code state; otherwise ask
the user to confirm. Do not repeat an already satisfied confirmation. Unit review mode uses its
explicit Tier 1 entry condition instead.
  
## Phase 1 — Read the diff and reconstruct intent

Scope is **the changes the plan and work summary account for**. Everything else pending in the tree
is listed, not reviewed.

```bash
git status --short
```

```bash
git diff HEAD -- <plan-related paths>
```

For a final review after local unit commits, use the recorded pre-execution HEAD instead of HEAD
as the baseline. Inspect the commit sequence as well as the cumulative task diff and remaining
working-tree changes; include relevant untracked files. For an interim unit review, use that
unit's starting HEAD so earlier committed units are context, not changes attributed to this unit.

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

**The main adversarial pass and final judgement are yours, inline, in this session.** Perform
and record your own pass before reading supplementary findings. A separate agent can challenge
assumptions, but spawning one does not by itself remove shared blind spots.

When the size or risk of the change warrants it, supplement this pass with independent, scoped,
read-only sub-agent reviews under the shared orchestration independence rules. This also applies
to an initial automatic adversarial review. Give each agent the goal, scope and raw artifacts in a
fresh context, without prior conclusions or the implementation rationale. Ask for concrete failing
cases; do not delegate edits, lint, builds or tests. Small adversarial passes can remain inline;
distinct exploration or evidence-gathering assignments must still be delegated.

These passes and the review commands below return candidate findings, not final verdicts. Verify,
deduplicate and triage every finding yourself; prioritisation, presentation and fix approvals stay
with you. See *Cross-check with the review commands* at the end of this phase.

The difficulty is that you likely wrote this code, and your default posture is to confirm it. So
invert it deliberately: for each change, the question is not "is this reasonable?" but **"what
input, ordering, or environment makes this wrong?"** Try to produce a concrete failing case. A
finding without one is a smell, not a finding.
Re-read the standards before judging against them, rather than from memory:

- `prompts/workflow/steps_guidelines/WriteTestsGuidelines.md`
- `prompts/workflow/steps_guidelines/FixRedTestGuidelines.md`
- `prompts/codebase_info/CodeDesignGuidelines.md`
- the `prompts/codebase_info/*DomainLogic.md` for the area touched

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


### Codex-specific review instructions

Use the concrete Codex route below after recording the manual adversarial pass; the slash commands
above are not shell commands or evidence that a review ran.

**Independent code review.** The local `review-agent` skill is at
`~/.codex/skills/.system/review-agent/SKILL.md`. When an independent pass is warranted under the
shared orchestration rules, delegate a read-only review with a fresh context and explicitly instruct
the subagent to read and use that skill. Supply the task goal, scoped file paths, raw pending diff
and relevant source artifacts, without earlier review conclusions. Include untracked task files
and any unit commits required by Phase 1's baseline; do not substitute an incomplete committed-only
or pending-only diff for the full task scope. Request concrete failing cases
and security evidence. The reviewer returns findings to the main agent and does not edit, delegate
further or run lint/build/test commands. The main agent verifies, deduplicates and triages the
findings. If the skill or delegation is unavailable, record that limitation rather than claiming
an independent review occurred.

**Codex Security diff review.** After the manual adversarial pass, use the installed
`$codex-security:security-diff-scan` skill to review the task's pending changes. Read its `SKILL.md`
from the installed skill path and follow its preflight, threat-model, discovery, validation,
attack-path and report-finalization workflow; do not replace it with a generic reviewer prompt.
Use the full task patch from Phase 1's baseline, including local unit commits where applicable
and relevant staged, unstaged, untracked and deleted files, through the plugin's supported diff
inputs. If it cannot cover that combined scope, state exactly which parts it covers and which it
cannot; do not claim a complete task scan. Keep the scan baseline and patch fixed. If the working tree contains unrelated changes,
use the plugin's supported scoped local-patch workflow to isolate the reviewed task; do not stage,
stash, discard or silently expand scope to include unrelated work. If exact isolation is not
supported, report the scope limitation before proceeding.

Invoke this plugin only within **Coding Task Review** in this four-skill workflow. Do not invoke
it during Discovery, Inception or Execution unless the user explicitly requests an exception.
Use the diff-review mode, not a repository-wide or deep scan, and do not enable cloud, PR, scheduled
or CI scanning. Installing the plugin alone is not authorization to start scans in other phases.
This instruction governs this workflow; it does not change the plugin's global invocation policy.

Keep the security review read-only with respect to source and cloud resources; scan reports and
temporary evidence artifacts are permitted. Do not invoke fix-finding, tracking or publishing
workflows, or apply fixes before Phase 3 approval. Preserve the plugin's preflight approval gates;
ask before required persistent configuration changes. Run any validation commands serially on the
main agent under the existing verification and authorization rules. If preflight or scanning is
blocked, retain its scan context and report the blocker and incomplete coverage; do not describe
manual inspection as a completed plugin scan.

Include authentication and authorization, input handling and injection, sensitive data and secrets,
and external-request trust boundaries in the applicable review passes. Read the completed plugin
report and coverage, verify candidate findings, and merge them into this skill's triage without
duplicating findings from the manual or independent code review. Record the scan ID, exact patch
scope/baseline, report path, completion status and remaining coverage gaps in the review guide.
The `review-agent` remains the general code-review cross-check. The Code Review tool
`pull_requests_checks` only reads existing CI diagnostics; use those as supplementary evidence for
the matching committed revision, not proof that pending local changes were scanned.

**Infrastructure security.** When the task changes infrastructure, inspect the affected
`template.yaml`, `cognito-template.yaml`, `frontend-template.yaml`, deployment scripts and environment
configuration together with relevant references. Check IAM least privilege, public/network exposure,
endpoint and resource authorization, secret handling, encryption and sensitive logging where
applicable. Check the resulting configuration, not only the edited lines. Keep the review within
the task's scope.

**Applicable command checks.** Run relevant checks serially on the main agent, under the Execution
skill's verification and authorization rules:

- For changed SAM templates, run `sam validate --lint --template-file <affected-template>` from the
  repo root. SAM exposes cfn-lint through this option; template linting is not a security audit.
- For frontend dependency changes, run `npm audit --package-lock-only --json` in `TTLeaguePlayersApp.FrontEnd` against
  the lockfile. Do not run `npm audit fix` during review.
- For backend dependency changes, run
  `dotnet list <affected-project.csproj> package --vulnerable --include-transitive --no-restore` from the repo root. Use the existing restore assets; report
  missing assets or feed/network failures rather than interpreting them as no vulnerabilities.
- Use the existing frontend lint/build and backend verification commands from the Execution skill
  when needed; they do not replace security review.

Codex Security supplements the manual, independent and command checks; it does not replace them.
Separate dedicated secret and infrastructure-policy scanners are not configured in this workflow.
Record that limitation. Do not silently install additional scanners, enable services, upload source
to another service, apply fixes, deploy or mutate cloud resources to fill it. A dependency audit
queries vulnerability feeds and does not prove the code or deployment is secure.

**Record evidence.** In the review guide, name each command or independent pass, its target
files/revision, result and material limitations. Distinguish manual inspection, independent agent
analysis, executed checks and existing CI evidence; state what was unavailable, skipped or failed.
Verify and deduplicate candidate findings using the four rules above before triage.


## Phase 3 — Triage, then stop

Rank every finding. **High-priority** means it would break behaviour, lose or expose data, hide a
regression, or make a reviewer reject the PR. Everything else is not high-priority, however
appealing it looks.

Verify every finding against the real files before reporting it. Drop anything you cannot
reproduce; do not report it as a "possible issue".

**The overview.**


1. **High-priority findings**, each with: file:line, what is wrong, the concrete failing case, and
   the proposed fix. Followed by a fix plan — ordered, with the verification each fix needs.
2. **Medium-priority findings**, presented the same as the High-priority findings
3. **Noted, not actioned** — every lower-priority finding, named in a concise list. No fix plan is needed for this initial list. Present the list to the user.

Outside *Execution unit review mode*, change nothing until the user approves a fix. If they amend the plan, fold the amendment in and
re-present it.

## Phase 4 — Fix

Execute only fixes the user approved (including the scoped high-impact authorization in
*Execution unit review mode*), regardless of the finding's initial priority. Leave all
other findings untouched, and do not fold in cleanup along the way — the diff must not grow beyond
the approved fixes during its own review.

Verify with the commands and **four-tier discipline** defined in *Phase 6 — Verify before
marking done* of the [Execution skill](../coding-task-execution/SKILL.md), including its recorded
approvals, clean-dev conditions and cumulative Cognito budget. Those rules govern whether to ask;
do not add a new approval requirement for an already authorized run.

Read that content from disk before relying on it, unless already loaded in this session.
Resolve `../coding-task-execution/SKILL.md` relative to this skill. Do not reconstruct commands or tier gates
from memory, and do not assume a tier is free — 1-B, 1-C and 2 all spend live Cognito and count
against the budget defined there.

A fix that does not go green is not done. If a fix turns out to be wrong or wider than it looked,
stop and say so rather than expanding it silently.

Re-run the full pipeline after fixes only under applicable recorded approval; otherwise explain
why it is needed, ask and wait. A previous run does not itself authorize another run.

## Phase 5 — The PR-review guide

Write it for a human about to read the diff cold. Make it as for a software engineer that have no previous knowledge of this coding task so provide short and clear explanations. Include a **summary that makes the change
understandable on its own** — the reviewer should be given a clear and short summary of what the change is for and what it does and what to look for *before* opening a single file, and should never have to reverse-engineer a file's purpose from its
diff. Assume no memory of the plan, the execution session, or this codebase's conventions.

**It goes in its own document.** Write it, with the phase 2–4 findings, to
`~/.claude/projects/-Users-lucaminudel-Code-TTLeaguePlayers/coding-tasks/<slug>/review.md` — a new
file in the same `<slug>` directory if absent, **not** appended to `work-summary.md`. If unit
reviews already created `review.md`, update that file and preserve their evidence and findings.

### Codex-specific persistence

In Codex, write the review guide to `.codex/coding-tasks/<task-slug>/review.md`, creating it if
absent or updating it while preserving existing unit review records. Do not append it to `work-summary.md`; present the persisted file link
when the review is handed off.

Do not update memory without an explicit user request. Task artifacts are found by path;
do not index them in `MEMORY.md`.

When the review document is completed, present its link as a progress update; continue through
the commit-message suggestion and retrospective before the final hand-off.

The two documents have different readers and different lifetimes. The work summary is the *execution*
record — per sub-task, written as the work happened, and it only grows. The review guide is written
once, for a person about to read the diff cold, and it is the thing they open first. Appending the
guide to a 50-page execution log buries the document that was meant to be the entry point, and makes
the reader scroll past sub-task notes they have no reason to read.

**Do not paste the whole guide into the chat.** At final hand-off, after the retrospective, post a condensed version — what the change does, the
verification status, the findings, and the reading order — and then, **as the last thing in the
final message, present the link to the document you created.** The link is the deliverable; the chat
summary exists so the user can decide whether to open it now or when they sit down to review.

**Explain the intent, not just the diff — and take it from the persisted files, not from memory.**
A reviewer reading cold needs to know *why* this change exists before they can judge whether it is
right. The three earlier skills already wrote that down; the guide's job is to distil it, not to
re-derive it or to leave it out:

| Source | What to draw from it for the guide |
|---|---|
| `discovery.md` | the **bigger picture** (which end-user feature or outcome the task serves) and **what this task contributes** to it; the **domain vocabulary** the reviewer needs (its glossary, in the app's own terms); the **live-source facts** the change rests on (URLs fetched, values seen, dated); the **contradictions and gaps** found |
| `plan.md` | the **goal** and the explicit **out-of-scope**; the **decision table with its whys** — every design choice the reviewer will otherwise question; the **research findings** that justify the shape of the change; assumptions and accepted risks; the "left for later" note |
| `work-summary.md` | per file, **why it changed** and the sub-task that owns it; what was **verified** and how; every item flagged **needs human review** |

For Codex, resolve each source above relative to `.codex/coding-tasks/<task-slug>/` and read the
corresponding persisted file from that directory.

Use them where they help the reader and nowhere else: a one-line feature context beats a pasted
framing section, and a decision's *why* belongs next to the file that embodies it. Cite the domain
docs under `prompts/codebase_info/` when a concept needs more than a sentence, rather than restating
them. If a persisted file is missing, say in the guide which one, and that its part of the intent
is reconstructed from the diff and therefore weaker.

The document carries:

- **What this change does** — a short paragraph, in the terms of the app rather than of the code:
  the feature or outcome it serves (from the discovery framing), the user-visible or behavioural
  outcome, and the shape of the solution. Enough that the rest of the guide lands.
- **Decisions the reviewer would otherwise question** — the plan's decision table, condensed to the
  ones visible in the diff, each with its *why* and, where the diff diverges from the obvious or
  from what a brief might have said, the alternative that was rejected and its cost. Deferred
  scope (the plan's "left for later") goes here too, so the reviewer does not flag as missing what
  was deliberately not built.
- **Verification status** — the tier-2 run and outcome, dated.
- **Findings** — high-priority ones with their resolution; noted-not-actioned ones as a list. Keep
  dismissed findings and *why* they were dismissed; that is what a later session needs most.
- **What to review, in what order** — a short numbered index of the reading order that makes the
  change comprehensible, not alphabetical: the port or the contract first, then the implementation,
  then the wiring. **Tests are not a step of their own.** Each step carries the tests that cover it,
  so the index counts them inside the step they belong to (the user asked for this on 2026-09-24,
  after a guide that parked all nine specs in a final "the tests" step). The only tests that earn a
  step of their own are the ones no single implementation file owns — see the walkthrough below. Say
  which steps are mechanical so the reviewer can skim them, and make each step's stated file count
  match the files the walkthrough actually lists under it.
- **Walkthrough, in reading order** — the per-file content, **organised under the steps of that
  index** (one sub-section per step, the files of that step beneath it), never as a flat file list.
  The user asked for exactly this shape (2026-09-19) because a flat per-file section forces the
  reader to reconstruct the order themselves.

  **Every step that contains implementation code is split into two labelled parts, in this order —
  *Implementation* and *Related tests*** (the user asked for this on 2026-09-24). A reviewer judges a
  behaviour and the proof of that behaviour together. Sending all the specs to a chapter at the end
  means the reviewer either loses their place going back and forth, or never reads them — and the end
  of the guide is exactly where a missing case, a vacuous assertion or a stub that should be a spy
  hides best. So the spec that covers a file sits directly beneath that file, in the same step.

  Under **Implementation**, each file gets the same three labelled parts, so the eye finds them
  without reading prose:
  - **What it is** — what the file is and where it sits in the design, for a reviewer who has not
    opened it before (the discovery report's technical findings and the domain docs are the source);
  - **What changed** — what changed in it and *why*, tied to its sub-task in the work summary and,
    where a plan decision shaped it, to that decision;
  - **Look for** — what specifically to look for while reading it, as a short bullet list: the risk
    in this change, the invariant it must hold, the neighbouring code it has to stay consistent
    with, or "mechanical" when there is genuinely nothing.

  Under **Related tests**, each spec covering this step's files gets three parts of its own:
  - **What it covers** — the behaviours pinned here, and how many cases;
  - **How it was proven** — seen red before the code existed, and which mutation failed which *named*
    case (the work summary's verification notes are the source) — or plainly that it was not proven
    that way, which is itself something to review;
  - **Look for** — the behaviour with no case, the assertion that cannot fail, the mutable fixture
    shared between spec files, the stub doing a spy's job, or "mechanical".

  **Only tests that no single step owns get a step of their own, at the end**: an end-to-end spec that
  spans the whole feature, a shared page object, a fixture several specs read. Say what they cover
  across the change rather than per file, and say which of them has never been executed.

  Do not keep a separate flat "per file" section beside the walkthrough — it doubles the length
  and the two drift apart.
- **What to check** — the specific things a human should verify that tests do not: values against
  the live external source, config values per environment, judgement calls, anything the work
  summary flagged as needing human review, and every assumption baked into code.
- **Riding along** — the pending files from phase 1 that were out of scope, so nothing gets
  committed unnoticed.

Keep it readable in one sitting. Context and direction, never a restatement of the lines that
changed — if the reviewer could get it from the diff alone, leave it out.

## Phase 6 — Suggest the commit message

Propose the text for any remaining task changes; **do not commit and do not stage** during final
Review. If all task changes are already committed, list those unit commits instead of inventing
a pending commit message. List unrelated pending work separately; do not bundle it into a task
commit message without the user's explicit request.

Body explains *why*, since the diff already shows *what*. Note user-facing behaviour changes,
config-file structure changes, and anything a future bisect would want to find. Do not add an
assistant signature unless the user asks.

## Phase 7 — Retrospect

Complete a retrospective (reflect on the work just completed with this coding-task-review Skill, 
list what worked well, what did not work well, what challenges were met, and suggest improvements 
to the skill) of the **Review workflow itself** after the findings, fixes,
verification and review guide are settled. The Execution retrospective is a separate phase and
never satisfies this one, even when both happen in the same chat. Review technical lessons from
the code only as evidence for a workflow improvement; they are not by themselves this
retrospective.

Present what the Review process caught or missed and how its manual pass, independent checks,
finding decisions, verification and hand-off worked. State any supported improvement to this
skill, or explicitly state that none was identified. Then ask the user specifically whether they
want to add or change anything about the **Coding Task Review workflow**, and wait for their
answer. An earlier answer about Execution, or a generic "no additional improvements" given before
this Review-specific question, does not count. Address the answer before closing; an explicit
decision to skip the Review retrospective also permits closure.

Record a distinct `Review retrospective` outcome in this task's `review.md`: the workflow lessons,
skill changes made (or none), and the user's Review-specific answer or explicit skip. Do not mark
this phase complete based on an entry in `work-summary.md` or another phase's progress log.

## Phase 8 — Close

Before closing, check that `review.md` contains the distinct Review retrospective outcome from
Phase 7, including the user's Review-specific answer or explicit skip. If it does not, complete
Phase 7 now; an Execution retrospective cannot fill this gate.

This is the end of the four-skill sequence: the working tree is reviewed, green and committable,
and the commit message is proposed. **You do not commit** — staging and committing are the user's.

**Tell the user** — you cannot run this yourself; `/compact` is a command they type:

> The review is complete. The PR-review guide is at `<path>`. Any remaining task changes and
> their proposed commit message are listed above, for you to stage and commit.

If automatic unit mode made local commits, also list their hashes and outcomes and distinguish
them from any remaining uncommitted fixes; do not claim that nothing was committed.



## Standing rules

**Git.** Stay on the current branch. Only *Execution unit review mode* permits staging and local
unit commits, under Execution's Git rule and the recorded authorization. The final human-driven
review leaves any additional fixes uncommitted. No push, stash, revert, clean or history rewriting.
Preserve the user's unrelated changes.

**Scope.** The plan defines what is reviewed; an approved fix plan or the recorded automatic
unit mode's high-impact authorization defines what is changed.
Review is not the moment to improve unrelated code.

**Honesty over reassurance.** A review that finds nothing is a review that was not performed. If a
change genuinely is clean, say what you checked and why it holds — do not pad the list to look
thorough, and do not soften a real finding into a suggestion.

## Anti-patterns

- Treating technical lessons, an Execution retrospective, or an earlier generic answer as the
  Review retrospective; closing without the distinct Review outcome in `review.md`.

- Reviewing on top of a red or unverified build.
- Replacing the main adversarial pass with delegated conclusions, or giving supplementary reviewers
  earlier verdicts instead of raw artifacts. Independent read-only passes follow the shared rules.

- Reporting findings you have not verified against the real files.
- Confirming your own earlier work instead of attacking it.
- Fixing lower-priority findings, or folding in cleanups, during the fix phase.
- Starting fixes without an approved fix plan or the scoped authorization in *Execution unit review mode*.
- Launching the tier-2 pipeline without applicable recorded approval.
- Committing or staging outside the authorized *Execution unit review mode*.
- Moving to the next finding before the current one is decided, fixed and verified.
- Writing a PR guide that restates the diff instead of directing attention within it.
- Writing a PR guide that explains *what* changed but not *why* — the feature it serves, the
  decisions behind its shape, the scope left out — when `discovery.md`, `plan.md` and
  `work-summary.md` already hold that intent and were not read for it.

For Codex, the corresponding files are `.codex/coding-tasks/<task-slug>/discovery.md`,
`.codex/coding-tasks/<task-slug>/plan.md`, and `.codex/coding-tasks/<task-slug>/work-summary.md`.
- Listing a file in the PR guide without saying what it is, why it changed, and what to look for in
  it.
- Parking every spec in a final "the tests" step of the walkthrough instead of presenting each spec
  under the implementation step it covers, as that step's *Related tests* part. Only tests no single
  step owns — an end-to-end spec, a shared page object, a shared fixture — belong in a step of their
  own.
- A step whose stated file count does not match the files the walkthrough lists beneath it.
- Appending the PR guide to the work summary instead of keeping it in the task's `review.md`.
- Pasting the whole guide into the chat, or ending the final message with anything other than the
  link to it.
- Handing back a question, a red pipeline or a fix plan without the context, cause and options the
  user needs to answer it.
- Mutating live cloud or Cognito during Review, except for explicitly authorized verification
  effects under Execution's test rules. Read-only commands are permitted; deployment and manual
  provisioning are not implied by test approval.

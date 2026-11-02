# Execution and Review continuation record

Maintain one task-specific `no-stop-policy.md` beside `plan.md`, `work-summary.md` and
`review.md`. In Codex its path is `.codex/coding-tasks/<task-slug>/no-stop-policy.md`;
in Claude Code use the same task directory selected by the phase skill.

Inception (planning), Execution and Review must read this guidance and the task's record before
asking about, recording or acting on a stop, handover, checkpoint, unit boundary, automatic review,
commit or upfront permission affecting Execution or Review. Check the record again immediately
before deciding to continue or hand over. Delegated agents follow the same current decisions;
the main agent owns integration of policy updates.

## Authority and maintenance

- Inception creates the record as continuation decisions emerge; finalize its actionable state
  with the confirmed plan. Execution or Review creates it if an older task lacks one, using
  existing conversation and artifact evidence rather than asking the same questions again.
- The latest applicable explicit user instruction supersedes earlier choices and skill defaults.
  Preserve separately retained permissions and the scope of each approval. Continuing does not
  itself authorize commits, pushing, deployment or other external writes.
- Each skill that asks a continuation question, receives a correction or makes a continuation
  decision must update this central record before dependent action. Do not maintain independent
  competing policies in the plan or phase reports: link the central decision IDs there.
- Preserve all decisions and corrections in a chronological log. Distinguish the user who grants
  authority from the agent who records, interprets or applies it. Never present an agent inference
  as user approval. State the evidence and uncertainty when reconstructing older decisions; do
  not invent timestamps or approvals.
- After every update, review the entire effective policy, diagram and decision log for coherence.
  Check scope, supersession, remaining gates, permission limits, review/fix obligations and commit
  ownership against one another and against applicable skill rules. Resolve clear supersession
  autonomously, document the resolution and communicate changes to affected active agents.
- A missing or stale record is documentation work, not a new permission gate. Reconstruct it from
  clear existing evidence and continue. If a material authorization or user choice remains
  ambiguous, hold only the dependent action, ask once for that unresolved decision and continue
  independent authorized work. Do not manufacture approval from silence.

This record is the central task policy for continuation, not a grant of additional authority.
An informational status/work-summary post never requires waiting for feedback. Slow agents,
incomplete tool output and repairable failures are execution states to recover from, not handover
decisions. Follow the applicable orchestration recovery rules and stop only the affected attempt
or dependent action when necessary.

## Required contents of `no-stop-policy.md`

### 1. Effective workflow diagram

Use a Mermaid flowchart for the actual agreed workflow from Execution through final Review.
Show the execution units and autonomous macro steps, automatic verification checkpoints, manual
checkpoints and permission gates, stop/continue at unit boundaries, automatic review and confirmed
high-priority fixes, optional automatic local unit commits, manual Review and the final manual
commit (or no commit). Label decision edges with central decision IDs and commit ownership.
Distinguish a synchronization barrier that waits for checks from a handover that waits for the
user. Show unresolved choices and declined operations explicitly; do not draw them as approved.

### 2. Effective decisions

Use a table with: decision ID/question code; scope/trigger; effective answer code and description;
continue or handover; upfront permission and its limits; supporting log entries.
Cover every unit boundary and checkpoint, automatic/manual Review, fixes, verification including
shared pipelines, commits and other applicable external actions. Group identical decisions only
when their scope is explicit. Include retained gates and exclusions so a continuation waiver
cannot accidentally erase a separate permission requirement.

For the unit-boundary question use `EXECUTION_UNIT_BOUNDARY_MODE` and its defined answer codes:

- `STOP_AND_HAND_OVER`
- `AUTO_REVIEW_FIX_CONTINUE_USER_COMMITS`
- `AUTO_REVIEW_FIX_COMMIT_EACH_UNIT_CONTINUE`

Both continuation answers require automatic review, correction of confirmed high-priority
findings and re-verification. Record these findings and fixes for presentation with the other
findings during manual Review. Only the last answer authorizes automatic local unit commits.

### 3. Decision and correction log

For each entry record: unique entry ID; who decided; who recorded; date/time and timezone when
known; source evidence; decision and scope; entries it supersedes or clarifies; rationale and
effect on the workflow. Preserve corrections and explanations that close ambiguity or conflicts.
Record agent continuation decisions against the existing policy ID; do not turn routine tool
polls into new policy decisions. If only the date of an older decision is known, say so.

### 4. Coherence check

After every update record who checked and when, which effective decisions were reviewed, any
ambiguities/conflicts and their resolutions or remaining affected gates. Check that:

- every path has a clear next action and owner;
- diagram and effective table agree, with no superseded stop still active;
- informational updates introduce no handover;
- retained permissions remain separate from checkpoint waivers;
- commit authority follows the selected answer code;
- confirmed high-priority findings are fixed and verified before autonomous continuation;
- manual Review presents both automatic fixes and remaining findings;
- unrelated authorized work can continue while one action awaits a required answer.

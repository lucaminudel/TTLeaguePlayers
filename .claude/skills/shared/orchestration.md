### Sub-agents and orchestration

For Execution and Review, follow the task's current `no-stop-policy.md` under
[the continuation-record guidance](no-stop-policy-guidance.md). The main agent communicates
updated decisions to affected delegated agents. A dependency/verification barrier is not itself
a user handover; the recorded policy determines whether human input is required.

**The conversation is always the main agent's.** Whatever gathers the raw material, findings,
options and questions are synthesised and presented by the main agent, one point per message. Fan
out for *reading*; never for *presenting* — a sub-agent per topic that reports back in parallel
produces exactly the batch the interaction protocol exists to prevent.

**Choose delegation for its expected benefit.** Delegate a bounded, substantial investigation or
implementation package when independent work can shorten the critical path or provide a useful
independent perspective. Consider context setup, overlapping reads, coordination, integration and
serial verification as well as the work itself. Handle short lookups and small related edits inline;
group related reads or edits instead of creating an agent per file or plan row. The main agent scopes
delegated work, checks its evidence and owns decisions.

Start with one or two sub-agents when useful; use more for several substantial independent packages
whose expected benefit warrants the overhead. This is guidance, not a minimum or cap. Reassess as
work completes instead of filling every available slot. After Execution's Phase 3 gate, parallel
implementation requires dependency-ready work, disjoint file ownership and respect for deployable-unit
boundaries and retained checkpoints. The main agent may work inline, including on a ready group.

For each considered opportunity to spawn a sub-agent, record the decision in the shared
`prompts/workflow/orchestration-summary.md` file used for all tasks, creating it if needed. Record
both positive and negative decisions. Identify the task, date, candidate work and its scope, the
applicable criteria, the concrete evidence used to assess benefits, costs and constraints, and the
resulting decision and rationale. Record any relevant tool or authorization limitation; do not
present an assumption as evidence. Revisit and record the decision when dependencies, available work
or other material circumstances change. A brief entry is sufficient for a simple opportunity.

Record the assignment, agent identifier, scope/file boundary and returned evidence in the current
task artifact. If tools are unavailable or a spawn fails, record the concrete limitation and
report it without handing over to the user; do not claim delegation occurred. Queue work when
slots are occupied when waiting is worthwhile. If delegation is unavailable or fails, retry when useful
or continue permitted work inline; record the limitation and any transfer of ownership, preserving
the task's existing scope and authorization.

A pending agent response or incomplete tool-output window is not a failure or a user-handover
point. Retain the agent or process identifier and check for completion. If progress stalls,
inspect available evidence and attempt recovery. Before taking over edits, stop the previous
writer and inspect partial changes. Follow the existing retry-and-return-to-spawning-agent rules
if recovery fails. Report only verified execution states.

| Phase | Sub-agents |
|---|---|
| Discovery | Delegate substantial independent gathering when useful within the current agreed topic. Present it and wait before exploring the next topic; do not fan out across future topics. The main agent reviews returned material. |
| Inception | Delegate substantial independent gathering and source checks when useful for topics emerged during Inception or agreed during Discovery. Planning decisions and user-facing synthesis stay with the main agent. |
| Execution | Delegate worthwhile independent exploration or implementation under file-partitioning, dependency and unit/checkpoint rules. Never delegate lint, build or test. |
| Review | Delegate substantial independent evidence gathering when useful. The main adversarial pass and final judgement stay inline. Independent scoped read-only review passes may supplement it under the independence rules below, including automatic unit reviews. |

**Which model a sub-agent gets.** Phase model choices belong in the Codex-specific paragraph at
the start of each skill: Execution uses Terra; Discovery, Inception and Review use Sol. These
Codex instructions take precedence over Claude-specific frontmatter model names. They describe
the requested model; they do not automatically reconfigure a running main session. Use the host's
available model identifiers, do not invent identifiers or silently substitute families, and report
selection limitations. Autonomous Review within Execution follows the Review model choice.

A sub-agent inherits the parent's model unless the spawn request selects one. Set it deliberately
when the role calls for a different model; use a fresh context when required by the spawn API:

- **Codex gathering** — use Luna at low effort for a narrow lookup or extraction with explicit
  scope and checkable evidence. Use Terra at low or medium for bounded repository searches or
  call-chain traces; use medium or high effort, or Sol, when completeness, ambiguity, cross-system
  reasoning or consequences of a missed case require deeper judgement. Gathering is not always
  mechanical retrieval. Check returned evidence and escalate or investigate inline if it is incomplete.
- **Codex drafting code** — start with Terra at medium effort for a well-scoped implementation;
  use high effort or Sol for difficult debugging, complex state or broad consequences. Luna may
  handle a small, well-specified edit with clear acceptance criteria when delegation is worthwhile.
- **Codex independent review** — start with Sol at medium or high effort based on complexity and
  risk. Escalate effort or model for difficult, high-impact analysis; do not treat adversarial
  review as simple retrieval. Judge capability by the actual review assignment, not a presumed
  ordering of model families.
- **Claude Code** — use `sonnet` for bounded gathering; choose a more capable available model for
  complex investigation or review. For code drafting, use at least the skill's model.
- **Effort and selection** — use the host's supported names and effort levels; "light" is not
  assumed to mean a particular model or effort. These are starting points, not fixed requirements.
  Consider task quality, total tokens and elapsed time including review and rework. Respect user
  choices and host constraints; do not claim a model or effort switch that did not occur.
- **Final decisions** — what to build, finding priority, approved fixes and user-facing synthesis
  stay with the main agent. Sub-agents may return evidence-backed candidate findings.

**`context: fork` is deliberately not used by any of these four skills.** A forked skill runs
without the conversation history, and all four are conversational — they depend on what the user
said three messages ago. Do not "optimise" any of them into a fork.
This refers to the Claude Code skill setting, not Codex's sub-agent `fork_turns` argument. A
Codex sub-agent that needs an explicit model or independent review context may use
`fork_turns: "none"`; give it a self-contained assignment and the necessary raw artifacts.

#### Independent review passes

The main agent performs and records its own adversarial pass before reading supplementary findings.
A sub-agent can provide a different perspective, but independence is not guaranteed merely by
spawning one. For a supplementary pass, provide a fresh context with the task goal, scope, raw diff
and relevant source artifacts; omit the implementation rationale, intended answer and earlier
review conclusions. Give it a concrete review question and ask for reproducible failing cases.
Choose a model and effort suited to the difficulty and consequences of the review; the gathering
defaults do not apply to adversarial analysis.

These passes may inspect disjoint concerns concurrently, but do not edit files, run lint/build/test
commands, or expand the agreed review scope. They return candidate findings, not final verdicts.
The main agent verifies and deduplicates them, owns prioritisation and user-facing synthesis, and
keeps all fix approvals and verification serial. Small adversarial passes can remain inline;
short evidence-gathering assignments may also remain inline.

#### Where the work lands

**All code changes go in the main working tree, on the branch the user already has checked out.**
Never create a git worktree to do the task's work in, and never move to another branch to do it.
This holds for the main agent and for every sub-agent.

The reason is the hand-back. Outside the explicitly authorized automatic unit mode in Execution
and Review, these skills leave staging and committing to the user. In that mode, the main agent
makes local unit commits in the current checkout after review and verification. A worktree is a
*separate checkout*: changes made there are not in
the user's tree, and with no commit to carry them across there is no clean way to return them. Work
done in a worktree is work the user has to be told about and cannot simply review with `git diff`.

The one exception is a **throw-away local experiment** — spiking a call chain, checking whether an
approach compiles, reproducing a failure in isolation — whose result is *knowledge*, not code that
ships. Delete the worktree when done, and re-implement the outcome in the main tree. If you find
yourself wanting to keep what the experiment produced, it was not an experiment: stop, say so, and
redo it in the main tree.

## Codex-specific orchestration for dependency-driven plans

When a plan contains a sub-task table with `Blocked by` relationships, the main Codex task owns the
dependency graph. Treat the table as a DAG, not as a checklist:

1. Identify currently unblocked sub-tasks and evaluate substantial, disjoint packages for
   delegation within unit/checkpoint barriers. Group small related tasks or handle them inline when
   coordination would outweigh the benefit. Reassess newly ready work as tasks complete.
2. Assign each delegated task an explicit sub-task number, file boundary, acceptance criteria, and
   required evidence. Do not start a task whose blockers are incomplete.
3. Use Codex collaboration tools available in the current environment to dispatch, message, and
   wait for delegated tasks. The main task records completion and unlocks the next ready set.
4. Keep implementation ownership disjoint. Delegated tasks may edit separate files in the current
   checkout; two tasks must not write the same file or shared mutable fixture concurrently.
5. Treat review checkpoints and verification tiers as synchronization barriers. The main task runs
   the required lint, build, unit, integration, and e2e commands serially after their dependencies
   are complete; delegated tasks do not run those checks in parallel.
6. Keep permission and confirmation gates with the main task. Delegation must not cause a sub-task to
   start a local service, use live credentials, mutate Cognito, run a long shared pipeline, or make
   an external change without the required user authorization.
7. If a delegated task fails, report the failure against its sub-task number without handing over
   to the user. Keep dependent work blocked while retrying, repairing the task or finding a
   workaround that meets its acceptance criteria. When those recovery approaches fail, return
   the task to the agent that started the subagent for autonomous permitted execution, as an
   permitted inline execution. Before transferring ownership, stop or confirm
   completion of the former writer, inspect any partial changes and give the receiving agent the
   failure evidence and remaining work. Do not silently skip a failed dependency or treat an
   unverified result as complete. Existing scope, permission and verification constraints apply.

This preserves the plan's intended execution shape: independent discovery or implementation work
can run concurrently, dependency chains remain serial, and the main Codex task remains responsible
for synthesis, verification, and the final hand-off.

### Sub-agents and orchestration

**The conversation is always the main agent's.** Whatever gathers the raw material, findings,
options and questions are synthesised and presented by the main agent, one point per message. Fan
out for *reading*; never for *presenting* — a sub-agent per topic that reports back in parallel
produces exactly the batch the interaction protocol exists to prevent.

**Delegate exploration; use parallelism where the work allows it.** Across all four skills,
every exploration must be assigned to a read-only sub-agent, even when there is only one research
question. An exploration is a bounded search, investigation, call-chain trace or evidence-gathering
assignment; group related reads into useful assignments rather than spawning an agent per file.
Reading the skill, plan or returned evidence, checking a specific claim, and the main adversarial
pass are not separate exploration assignments. The main agent scopes the work, inspects the
returned evidence and owns decisions. Delegate independent gathering/research assignments in
parallel within the current agreed topic and phase gates; do not merely describe possible
parallelism and then do all the exploration inline.

**Execution parallelism is mandatory when feasible.** After Execution's Phase 3 upfront-asks and
confirmation gate is satisfied, at each dependency-ready set dispatch
independent implementation sub-tasks with disjoint file ownership to sub-agents, up to available
capacity. Reassess as tasks complete. Respect deployable-unit boundaries and retained checkpoints;
readiness alone does not permit crossing them. Serial dependencies, conflicting ownership or an
active barrier justify serial execution; convenience or a preference to work inline does not.

Record the assignment, agent identifier, scope/file boundary and returned evidence in the current
task artifact. If tools are unavailable or a spawn fails, record the concrete limitation and
report it; do not claim delegation occurred. Queue work when slots are occupied. If delegation is
unavailable altogether, continue permitted nondelegated work and ask how to handle the blocked
assignments rather than silently replacing mandatory delegation with inline work.

| Phase | Sub-agents |
|---|---|
| Discovery | **Delegate every exploration, gathering only.** Parallelize independent evidence gathering within the current agreed topic. Present it and wait before exploring the next topic; do not fan out across future topics. The main agent reviews all returned material. |
| Inception | **Delegate every exploration and research assignment.** Parallelize independent gathering and read-only source checks for topics emerged during Inception or agreed during Discovery. Planning decisions and user-facing synthesis stay with the main agent. |
| Execution | **Delegate every exploration and all parallel-ready implementation groups**, under file-partitioning, dependency and unit/checkpoint rules. Never delegate lint, build or test. |
| Review | **Delegate every exploration.** Parallelize independent evidence gathering where feasible. Main adversarial pass and final judgement stay inline. Independent scoped read-only review passes may supplement it under the independence rules below, including automatic unit reviews. |

**Which model a sub-agent gets.** Phase model choices belong in the Codex-specific paragraph at
the start of each skill: Execution uses Terra; Discovery, Inception and Review use Sol. These
Codex instructions take precedence over Claude-specific frontmatter model names. They describe
the requested model; they do not automatically reconfigure a running main session. Use the host's
available model identifiers, do not invent identifiers or silently substitute families, and report
selection limitations. Autonomous Review within Execution follows the Review model choice.

A sub-agent inherits the parent's model unless the spawn request selects one. Set it deliberately
when the role calls for a different model; use a fresh context when required by the spawn API:

- **Gathering** — reading files, grepping, following call chains, fetching pages: pass
  Terra in Codex or `sonnet` in Claude Code. This work is retrieval, not judgement, and the volume is high;
  running it on the skill's own model spends the expensive model on `cat`.
- **Drafting code** — Terra in Codex Execution; in Claude Code, never below the skill's model. A cheaper drafting
  agent hands back code the main agent must then rewrite, which costs more than it saved.
- **Review passes** — Sol in Codex, including supplementary adversarial reviewers; do not apply
  the cheaper gathering model rule to review analysis.
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
Use a model at least as capable as the skill's drafting model; the cheaper gathering-model rule
does not apply to adversarial analysis.

These passes may inspect disjoint concerns concurrently, but do not edit files, run lint/build/test
commands, or expand the agreed review scope. They return candidate findings, not final verdicts.
The main agent verifies and deduplicates them, owns prioritisation and user-facing synthesis, and
keeps all fix approvals and verification serial. Small adversarial passes can remain inline;
any distinct exploration or evidence-gathering assignment must still be delegated.

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

1. Identify the currently unblocked sub-tasks and dispatch the parallel-ready, disjoint set to
   sub-agents within available capacity and unit/checkpoint barriers. For example, when sub-tasks
   `1`, `2`, and `5` have no blockers or shared writes, dispatch them in parallel. Repeat for each
   newly ready set; recording parallel opportunities without dispatching them is not sufficient.
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
7. If a delegated task fails, report the failure against its sub-task number, keep dependent tasks
   blocked, and either repair the task or ask the user for direction. Do not silently skip a failed
   dependency or treat an unverified result as complete.

This preserves the plan's intended execution shape: independent discovery or implementation work
can run concurrently, dependency chains remain serial, and the main Codex task remains responsible
for synthesis, verification, and the final hand-off.

### Sub-agents and orchestration

**The conversation is always the main agent's.** Whatever gathers the raw material, findings,
options and questions are synthesised and presented by the main agent, one point per message. Fan
out for *reading*; never for *presenting* — a sub-agent per topic that reports back in parallel
produces exactly the batch the interaction protocol exists to prevent.

| Phase | Sub-agents |
|---|---|
| Discovery | **Permitted for gathering only.** `Explore` agents may collect raw material for a topic the user has **already agreed to** in the topic list. Never fan out across topics the user has not yet seen, and never let an agent's write-up reach the user unreviewed. |
| Inception | **Permitted for gathering and verification.** `Explore` agents may collect raw material or make verifications for a topic **emerged during the Incepton or agreed during the Discovery**. Never fan out across topics the user has not yet seen, and never let an agent's write-up reach the user unreviewed.. |
| Execution | **Permitted for drafting code**, under the file-partitioning and serial-verification rules in *Order the work*. Never for lint, build or test. |
| Review | **Main adversarial pass and final judgement stay inline.** Independent, scoped, read-only review passes may supplement it when the size or risk of the change warrants them, including the initial automatic adversarial review. See the independence rules below. |

**Which model a sub-agent gets.** A sub-agent inherits the parent's model unless the `Agent` call
passes `model`. Set it deliberately:

- **Gathering** — reading files, grepping, following call chains, fetching pages: pass
  `model: "sonnet" or "Terra"`. This work is retrieval, not judgement, and the volume is high;
  running it on the skill's own model spends the expensive model on `cat`.
- **Drafting code** — never *below* the model the skill itself is pinned to. A cheaper drafting
  agent hands back code the main agent must then rewrite, which costs more than it saved.
- **Judgement of any kind** — deciding what a finding means, what to build, whether something is
  wrong: not delegated at all, so the question does not arise.

**`context: fork` is deliberately not used by any of these four skills.** A forked skill runs
without the conversation history, and all four are conversational — they depend on what the user
said three messages ago. Do not "optimise" any of them into a fork.

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
keeps all fix approvals and verification serial. Small reviews can remain entirely inline.
This is the scoped exception to the general rule against delegating judgement above.

#### Where the work lands

**All code changes go in the main working tree, on the branch the user already has checked out.**
Never create a git worktree to do the task's work in, and never move to another branch to do it.
This holds for the main agent and for every sub-agent.

The reason is the hand-back. These skills make no commits — the working tree is left for the user
to stage and commit themselves. A worktree is a *separate checkout*: changes made there are not in
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

1. Identify the currently unblocked sub-tasks and delegate only that ready set. For example, when
   sub-tasks `1`, `2`, and `5` have no blockers, they may start in parallel.
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

### Sub-agents and orchestration

**The conversation is always the main agent's.** Whatever gathers the raw material, findings,
options and questions are synthesised and presented by the main agent, one point per message. Fan
out for *reading*; never for *presenting* — a sub-agent per topic that reports back in parallel
produces exactly the batch the interaction protocol exists to prevent.

| Phase | Sub-agents |
|---|---|
| Discovery | **Permitted for gathering only.** `Explore` agents may collect raw material for a topic the user has **already agreed to** in the topic list. Never fan out across topics the user has not yet seen, and never let an agent's write-up reach the user unreviewed. |
| Inception | **Not used.** Done inline, unless the user asks otherwise. |
| Execution | **Permitted for drafting code**, under the file-partitioning and serial-verification rules in *Order the work*. Never for lint, build or test. |
| Review | **Not used.** Done inline: the point of the phase is to attack work you likely wrote, which cannot be delegated to an agent that shares the same blind spot. |

**Which model a sub-agent gets.** A sub-agent inherits the parent's model unless the `Agent` call
passes `model`. Set it deliberately:

- **Gathering** — reading files, grepping, following call chains, fetching pages: pass
  `model: "haiku" or "sonnet" or "Luna"`. This work is retrieval, not judgement, and the volume is high;
  running it on the skill's own model spends the expensive model on `cat`.
- **Drafting code** — never *below* the model the skill itself is pinned to. A cheaper drafting
  agent hands back code the main agent must then rewrite, which costs more than it saved.
- **Judgement of any kind** — deciding what a finding means, what to build, whether something is
  wrong: not delegated at all, so the question does not arise.

**`context: fork` is deliberately not used by any of these four skills.** A forked skill runs
without the conversation history, and all four are conversational — they depend on what the user
said three messages ago. Do not "optimise" any of them into a fork.

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

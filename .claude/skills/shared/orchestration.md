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
  `model: "haiku"` or `"sonnet"`. This work is retrieval, not judgement, and the volume is high;
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

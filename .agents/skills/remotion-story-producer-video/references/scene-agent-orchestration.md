# Isolated Scene Agent orchestration

This reference owns the mandatory post-freeze Agent protocol.

## Keep root ownership

Keep the root Agent alive as watcher owner and coordinator. It exclusively owns shared inputs, run
state, validation aggregation, result submission, generated registries, staging, and commits. Never
author Scene deliverables in the root task, reuse one child for multiple meaningIds, or silently fall
back to inline Scene work. Stop before Scene authoring if native child-Agent execution is unavailable
or explicitly forbidden.

## Dispatch one owner per meaningId

Create one distinct child Agent for every frozen assignment, using the current native collaboration
surface. Run independent owners concurrently when possible. Give each child only its meaningId,
exclusive source/public paths, current Beat and sealed timing, style, Scene brief, assignment,
adjacent continuity summary, and approved current resources.

Tell every child that other Agents share the worktree and require it to:

- write only its exclusive Scene source/public directories and preserve all other changes;
- avoid historical Scene/media, another child's output, central run state, and shared generated files;
- use assignment-provided safe areas, font minimum, and resources without copying numeric policy into
  instructions;
- keep captions top-level and use the Renderer only for visuals plus optional Scene-local sound;
- avoid staging, commits, result-writing commands, and nested Agents.

Each child produces the assignment-required plans, selections, Renderer, optional local-sound
declarations, and ScenePackage inputs. Keep semantic content inside the guarded frame; use full bleed
only for non-semantic backgrounds.

## Check before immutable submission

Have the child run:

```bash
npm run production:scene:check -- --run <runId> --scene <meaningId>
```

The check may refresh deterministic Scene-owned generated output, but writes no Scene result, event,
or derived run state. Return a safe validation finding to the same owner and rerun the same check; do
not use submit/fail as validation control flow.

After `ready-to-submit`, audit the child's changed paths in the root task and rerun the check. The root
Agent then serially invokes:

```bash
npm run production:scene:submit -- --run <runId> --scene <meaningId>
```

Only for a genuine terminal child failure, invoke:

```bash
npm run production:scene:fail -- --run <runId> --scene <meaningId> --code <CODE> --description "<safe description>"
```

Keep polling the watcher until all results are accepted or the Run is terminal. Record the final
meaningId-to-child-task mapping and check result for handoff.

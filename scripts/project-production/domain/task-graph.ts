import {
  ProducerTaskSpecSchema,
  type ProducerTaskSpec,
  type TaskRevision,
} from "@axmorf/studio/contracts";

export type ProducerTaskNode = Readonly<{
  task: ProducerTaskSpec;
  dependencyTaskRevisions: readonly TaskRevision[];
}>;

export const buildProducerTaskGraph = (
  rawNodes: readonly ProducerTaskNode[],
): readonly ProducerTaskNode[] => {
  const nodes = rawNodes.map((node) => ({
    task: ProducerTaskSpecSchema.parse(node.task),
    dependencyTaskRevisions: [...node.dependencyTaskRevisions],
  }));
  const ids = nodes.map(({ task }) => task.taskRevision);
  if (new Set(ids).size !== ids.length) {
    throw new Error("Producer task graph contains duplicate task identity.");
  }
  const stable = [...nodes].sort((left, right) =>
    left.task.taskRevision.localeCompare(right.task.taskRevision),
  );
  if (
    nodes.some(
      (node, index) =>
        node.task.taskRevision !== stable[index]?.task.taskRevision,
    )
  ) {
    throw new Error(
      "Producer task graph must use stable taskRevision ordering.",
    );
  }
  const known = new Set(ids);
  for (const node of nodes) {
    const dependencies = node.dependencyTaskRevisions;
    if (
      new Set(dependencies).size !== dependencies.length ||
      dependencies.some(
        (dependency, index) => dependency !== [...dependencies].sort()[index],
      )
    ) {
      throw new Error("Producer task dependencies must be sorted and unique.");
    }
    if (dependencies.some((dependency) => !known.has(dependency))) {
      throw new Error("Producer task graph contains an unknown dependency.");
    }
    const boundDependencies = node.task.dependencyArtifacts.map(
      ({ taskRevision }) => taskRevision,
    );
    if (
      boundDependencies.length !== dependencies.length ||
      boundDependencies.some(
        (dependency, index) => dependency !== dependencies[index],
      )
    ) {
      throw new Error(
        "Producer task graph dependencies are not artifact-bound.",
      );
    }
  }
  const visiting = new Set<TaskRevision>();
  const visited = new Set<TaskRevision>();
  const byId = new Map(nodes.map((node) => [node.task.taskRevision, node]));
  const visit = (id: TaskRevision) => {
    if (visiting.has(id))
      throw new Error("Producer task graph contains a cycle.");
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id)?.dependencyTaskRevisions ?? [])
      visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of ids) visit(id);
  return nodes;
};

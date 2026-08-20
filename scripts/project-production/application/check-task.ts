import { readTaskWorkspace } from "../adapters/task-workspace";
import { checkCoverTask } from "./cover-task-check";
import { checkFixedTask, checkSceneTemplateTask } from "./fixed-task-check";
import { checkGlobalVisualTask } from "./global-visual-task-check";
import { checkProducerTaskWorkspace } from "./task-check";
import { checkSceneTask } from "./scene-task-check";

export const checkTaskByKind = async (input: Parameters<typeof checkProducerTaskWorkspace>[0]) => {
  const { task } = await readTaskWorkspace(input);
  if (task.taskKind === "scene-owner") return checkSceneTask(input);
  if (task.taskKind === "scene-template") return checkSceneTemplateTask(input);
  if (task.taskKind === "global-visual-owner") return checkGlobalVisualTask(input);
  if (task.taskKind === "cover-owner") return checkCoverTask(input);
  if (
    task.taskKind === "narration-chunk" ||
    task.taskKind === "narration-seal" ||
    task.taskKind === "semantic-timing" ||
    task.taskKind === "composition-convergence" ||
    task.taskKind === "delivery-build"
  ) {
    return checkFixedTask(input);
  }
  return checkProducerTaskWorkspace(input);
};

import type {
  ProductionRunStateName,
  ProductionStageEvent,
  ProductionStageId,
} from "../../../src/contracts";

const ACTIVE_STATES = new Set<ProductionRunStateName>([
  "initialized",
  "narrative-running",
  "baseline-ready",
  "scene-inputs-frozen",
  "scenes-running",
  "post-scene-running",
]);

const startedTransition = (
  state: ProductionRunStateName,
  stageId: ProductionStageId,
): ProductionRunStateName | null => {
  const key = `${state}:${stageId}`;
  const transitions: Readonly<Record<string, ProductionRunStateName>> = {
    "initialized:production-start": "initialized",
    "initialized:narrative": "narrative-running",
    "baseline-ready:scene-freeze": "baseline-ready",
    "scene-inputs-frozen:scenes": "scenes-running",
    "post-scene-running:post-scene": "post-scene-running",
    "post-scene-running:preview": "post-scene-running",
  };
  return transitions[key] ?? null;
};

const succeededTransition = (
  state: ProductionRunStateName,
  stageId: ProductionStageId,
): ProductionRunStateName | null => {
  const key = `${state}:${stageId}`;
  const transitions: Readonly<Record<string, ProductionRunStateName>> = {
    "initialized:production-start": "initialized",
    "narrative-running:narrative": "baseline-ready",
    "baseline-ready:scene-freeze": "scene-inputs-frozen",
    "scenes-running:scenes": "post-scene-running",
    "post-scene-running:post-scene": "post-scene-running",
  };
  return transitions[key] ?? null;
};

export const transitionProductionRunState = ({
  state,
  event,
}: {
  readonly state: ProductionRunStateName;
  readonly event: ProductionStageEvent;
}): ProductionRunStateName => {
  let next: ProductionRunStateName | null = null;
  switch (event.type) {
    case "stage-started":
      next = startedTransition(state, event.stageId);
      break;
    case "stage-succeeded":
      next = succeededTransition(state, event.stageId);
      break;
    case "stage-failed":
      next = ACTIVE_STATES.has(state) ? "failed" : null;
      break;
    case "scene-result-accepted":
      next = state === "scenes-running" ? "scenes-running" : null;
      break;
    case "preview-ready":
      next = state === "post-scene-running" ? "preview-ready" : null;
      break;
  }
  if (next === null) {
    throw new Error(
      `Illegal production transition: ${state} + ${event.type}/${event.stageId}.`,
    );
  }
  return next;
};

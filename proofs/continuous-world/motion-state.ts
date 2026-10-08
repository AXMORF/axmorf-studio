import {
  mapProducerSemanticFrame,
  projectProducerWorldPoint2D,
  resolveProducerPointMorph2D,
  resolveProducerWorldCamera2D,
  type ProducerPoint2D,
} from "@axmorf/studio/remotion";

export const semanticAnchors = [
  { id: "open", sourceFrame: 0, targetFrame: 0 },
  { id: "choose", sourceFrame: 60, targetFrame: 80 },
  { id: "result", sourceFrame: 120, targetFrame: 150 },
] as const;

const crowded: readonly ProducerPoint2D[] = [
  [-330, 80],
  [-160, -120],
  [10, 95],
  [180, -110],
  [345, 85],
];
const clear: readonly ProducerPoint2D[] = [
  [-330, 80],
  [-160, 30],
  [10, -20],
  [180, -70],
  [345, -120],
];

export const resolveContinuousProofState = (
  sceneFrame: number,
  width: number,
  height: number,
) => {
  const frame = mapProducerSemanticFrame(
    semanticAnchors,
    sceneFrame,
    "target-to-source",
  );
  const camera = resolveProducerWorldCamera2D(
    [
      { frame: 0, position: [-35, 0], zoom: 0.78, rotation: 0 },
      {
        frame: 60,
        position: [0, 0],
        zoom: 0.87,
        rotation: -3,
        easing: "ease-in-out",
      },
      {
        frame: 120,
        position: [120, -50],
        zoom: 1.04,
        rotation: -6,
        easing: "ease-in-out",
      },
    ],
    frame,
  );
  const path = resolveProducerPointMorph2D(crowded, clear, frame, {
    startFrame: 25,
    endFrame: 84,
    easing: "ease-in-out",
  });
  const project = (point: ProducerPoint2D) =>
    projectProducerWorldPoint2D(point, camera, { width, height });
  const progress = Math.max(0, Math.min(1, (frame - 55) / 48));
  const subject: ProducerPoint2D = [
    path[2][0] + (path[3][0] - path[2][0]) * progress,
    path[2][1] + (path[3][1] - path[2][1]) * progress,
  ];
  return { frame, camera, path: path.map(project), subject: project(subject) };
};

import {
  toSceneLocalFrame,
  toShotLocalFrame,
  type SceneLocalFrame,
} from "../../../contracts";

export const resolveSceneLocalFrame = (
  compositionFrame: unknown,
  beatFrameRange: unknown,
): SceneLocalFrame => toSceneLocalFrame(compositionFrame, beatFrameRange);

export const resolveShotLocalFrame = (
  sceneFrame: unknown,
  shotFrameRange: unknown,
): SceneLocalFrame => toShotLocalFrame(sceneFrame, shotFrameRange);

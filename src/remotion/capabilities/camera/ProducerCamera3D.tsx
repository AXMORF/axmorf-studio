import { useThree } from "@react-three/fiber";
import { ThreeCanvas } from "@remotion/three";
import { type CSSProperties, type FC, type ReactNode, useLayoutEffect } from "react";
import { useCurrentFrame } from "remotion";

import { resolveProducerCamera3D } from "./interpolate";
import type { ProducerCamera3DKeyframe, ProducerCamera3DState } from "./types";

export type ProducerCamera3DProps = {
  readonly width: number;
  readonly height: number;
  readonly keyframes: readonly ProducerCamera3DKeyframe[];
  readonly children: ReactNode;
  readonly style?: CSSProperties;
};

const assertCanvasGeometry = (width: number, height: number) => {
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    throw new Error("ProducerCamera3D width and height must be positive.");
  }
};

const ProducerCameraRig: FC<{ readonly state: ProducerCamera3DState }> = ({ state }) => {
  const { camera } = useThree();

  useLayoutEffect(() => {
    camera.position.set(state.position[0], state.position[1], state.position[2]);
    camera.up.set(0, 1, 0);
    camera.lookAt(state.target[0], state.target[1], state.target[2]);
    camera.rotateZ((state.roll * Math.PI) / 180);

    if ("isPerspectiveCamera" in camera && camera.isPerspectiveCamera) {
      const perspectiveCamera = camera as typeof camera & {
        fov: number;
        updateProjectionMatrix: () => void;
      };
      perspectiveCamera.fov = state.fov;
      perspectiveCamera.updateProjectionMatrix();
    }
  }, [camera, state.fov, state.position, state.roll, state.target]);

  return null;
};

export const ProducerCamera3D: FC<ProducerCamera3DProps> = ({
  width,
  height,
  keyframes,
  children,
  style,
}) => {
  const frame = useCurrentFrame();
  assertCanvasGeometry(width, height);
  const state = resolveProducerCamera3D(keyframes, frame);

  return (
    <ThreeCanvas
      camera={{
        fov: state.fov,
        position: [state.position[0], state.position[1], state.position[2]],
      }}
      height={height}
      style={style}
      width={width}
    >
      <ProducerCameraRig state={state} />
      {children}
    </ThreeCanvas>
  );
};

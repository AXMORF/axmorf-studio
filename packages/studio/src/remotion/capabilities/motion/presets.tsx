import { CameraMotionBlur, Trail } from "@remotion/motion-blur";
import type { FC, ReactNode } from "react";

export type ProducerMotionTreatmentId =
  | "camera-natural"
  | "typography-trail"
  | "icon-trail"
  | "particle-trail";

export const producerMotionTreatments = [
  { id: "camera-natural", label: "Camera natural", useWhen: "Frame-driven camera travel" },
  { id: "typography-trail", label: "Typography trail", useWhen: "Fast headline emphasis" },
  { id: "icon-trail", label: "Icon trail", useWhen: "Directional icon movement" },
  { id: "particle-trail", label: "Particle trail", useWhen: "Short particle accents" },
] as const satisfies readonly {
  readonly id: ProducerMotionTreatmentId;
  readonly label: string;
  readonly useWhen: string;
}[];

export const ProducerMotionTreatment: FC<{
  readonly id: ProducerMotionTreatmentId;
  readonly children: ReactNode;
}> = ({ id, children }) => {
  if (!producerMotionTreatments.some((treatment) => treatment.id === id)) {
    throw new Error(`Unknown Producer motion treatment: ${String(id)}.`);
  }
  if (id === "camera-natural") {
    return (
      <CameraMotionBlur samples={8} shutterAngle={180}>
        {children}
      </CameraMotionBlur>
    );
  }

  const config =
    id === "typography-trail"
      ? { layers: 5, lagInFrames: 0.8, trailOpacity: 0.24 }
      : id === "icon-trail"
        ? { layers: 4, lagInFrames: 0.65, trailOpacity: 0.2 }
        : { layers: 6, lagInFrames: 0.5, trailOpacity: 0.14 };

  return <Trail {...config}>{children}</Trail>;
};

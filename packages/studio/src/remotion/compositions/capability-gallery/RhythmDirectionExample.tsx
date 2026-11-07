import { AbsoluteFill, useVideoConfig } from "remotion";
import {
  barCameraShots,
  FilmCaptions,
  FilmSoundEffects,
  FilmSoundtrack,
  ProducerWorldCamera,
  resolveBreathScale,
  useBarCamera,
  useBeatPulse,
  useFilmTiming,
  useImpact,
  useNarrationActive,
  type BarCameraShot,
} from "../../../remotion";

/** Mount at Film root, inside FilmProvider. Supply this film's generated music/sfx. */
export const RhythmDirectionExample = ({
  impactFrames,
}: { readonly impactFrames?: readonly number[] } = {}) => {
  const { width, height } = useVideoConfig();
  const { music } = useFilmTiming();
  const pulse = useBeatPulse();
  const narrating = useNarrationActive();
  const bars = music?.barFrames ?? [];
  const shots: readonly BarCameraShot[] = Array.from(
    { length: bars.length + 1 },
    (_, i) => ({
      center: [width * (0.5 + (i % 3)), height / 2],
      zoom: 1 + (i % 2) * 0.15,
    }),
  );
  const camera = useBarCamera(shots);
  const accents = [
    ...new Set([
      ...(music?.accentFrames ?? []),
      ...(music?.sectionFrames ?? []),
      ...(music?.onsets?.hits ?? []),
      ...(music?.onsets?.sections ?? []),
    ]),
  ].sort((a, b) => a - b);
  const impact = useImpact(impactFrames ?? accents);
  return (
    <AbsoluteFill style={{ backgroundColor: "#0b1020" }}>
      <ProducerWorldCamera
        width={width}
        height={height}
        worldWidth={width * 3}
        worldHeight={height}
        shots={barCameraShots(camera, shots[0])}
        frame={1}
        layers={[
          {
            depth: 1,
            content: (
              <AbsoluteFill
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-around",
                }}
              >
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    style={{
                      width: width * 0.6,
                      height: height * 0.6,
                      borderRadius: "50%",
                      border: "10px solid #7ee3d5",
                      opacity: 0.65 + 0.35 * pulse,
                      transform: `translateX(${impact.shake}px) scale(${resolveBreathScale(pulse, narrating) * impact.scale})`,
                    }}
                  />
                ))}
              </AbsoluteFill>
            ),
          },
        ]}
        overlay={
          <div style={{ color: "#f8fafc", fontSize: 64, padding: 80 }}>
            证据 → 机制 → 结果
          </div>
        }
      />
      <FilmSoundtrack />
      <FilmSoundEffects />
      <FilmCaptions />
    </AbsoluteFill>
  );
};

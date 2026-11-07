import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import {
  barCameraShots,
  FilmCaptions,
  FilmSoundEffects,
  FilmSoundtrack,
  lastAtOrBefore,
  ProducerWorldCamera,
  resolveBreathScale,
  resolveImpactLevel,
  resolveNarrationActive,
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
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const { music, sentences } = useFilmTiming();
  const pulse = useBeatPulse({ decayFrames: 10 });
  const narrating = useNarrationActive();
  const bars = music?.barFrames ?? [];
  const shots: readonly BarCameraShot[] = Array.from(
    { length: bars.length + 1 },
    (_, i) => {
      // Fix each step's amplitude at its bar start; speech edges must not jump the camera.
      const speaking = resolveNarrationActive(
        bars[Math.max(0, i - 1)] ?? 0,
        sentences,
      );
      return {
        center: [
          width * (0.5 + (i % 3) * (speaking ? 0.04 : 0.12)),
          height / 2,
        ],
        zoom: 1 + (i % 2) * (speaking ? 0.025 : 0.07),
      };
    },
  );
  const camera = useBarCamera(shots);
  const accents = (
    impactFrames ??
    [
      ...new Set([
        ...(music?.accentFrames ?? []),
        ...(music?.sectionFrames ?? []),
        ...(music?.onsets?.hits ?? []),
        ...(music?.onsets?.sections ?? []),
      ]),
    ].sort((a, b) => a - b)
  ).map((at) => ({
    frame: at,
    strength:
      music?.onsets?.accents?.find((a) => a.frame === at)?.strength ?? 1,
  }));
  // Start eight frames early: the first ramp sample is zero, leaving seven visible steps.
  const impact = useImpact(accents, { preFrames: 8 });
  const level = resolveImpactLevel(impact.strength);
  const nextAt = accents.find((a) => a.frame > frame)?.frame ?? Infinity;
  const anticipating = nextAt - frame <= 8;
  const elapsed =
    frame -
    (anticipating
      ? nextAt
      : lastAtOrBefore(
          frame,
          accents.map((a) => a.frame),
        ));
  // An exact-frame strike with a 12-frame release, independent of the spring's settled value.
  const strike = elapsed >= 0 && elapsed < 12 ? 1 - elapsed / 12 : 0;
  const flash =
    elapsed >= 0 && elapsed < 4 ? (1 - elapsed / 4) * level.flashOpacity : 0;
  const anticipation =
    anticipating && impact.strength > 0 ? impact.pre / impact.strength : 0;
  const shake =
    impact.strength > 0
      ? (impact.shake / (7 * impact.strength)) * level.shakePixels
      : 0;
  return (
    <AbsoluteFill style={{ backgroundColor: "#0b1020", overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          transform: `translate(${shake}px,${shake * 0.6}px) scale(${1 + level.cameraImpulse * (strike - anticipation * 0.5)})`,
        }}
      >
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
                        background:
                          "radial-gradient(circle at 35% 30%, #427d88, #102338 70%)",
                        opacity: 0.65 + 0.35 * pulse,
                        // L3 deforms the subject as well as overshooting its scale; reading text stays still.
                        transform: `translateX(${-width * level.cameraImpulse * 1.5 * anticipation}px) scale(${resolveBreathScale(pulse, narrating) * (1 + (level.subjectScale - 1) * (strike - anticipation))}) scaleX(${1 + (level.subjectScale - 1) * strike}) scaleY(${1 - (level.subjectScale - 1) * strike})`,
                      }}
                    />
                  ))}
                </AbsoluteFill>
              ),
            },
          ]}
        />
        {Array.from({ length: level.particleCount }, (_, i) => {
          const angle = (i / level.particleCount) * Math.PI * 2;
          const radius = (1 - strike) * width * 0.45;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: width / 2,
                top: height / 2,
                width: 12,
                height: 12,
                backgroundColor: "#7ee3d5",
                opacity: strike,
                transform: `translate(${Math.cos(angle) * radius}px,${Math.sin(angle) * radius}px) rotate(${i * 31}deg)`,
              }}
            />
          );
        })}
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          backgroundColor: "white",
          opacity: flash,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          color: "#f8fafc",
          fontSize: 64,
          padding: 80,
        }}
      >
        证据 → 机制 → 结果
      </div>
      <FilmSoundtrack />
      <FilmSoundEffects />
      <FilmCaptions />
    </AbsoluteFill>
  );
};

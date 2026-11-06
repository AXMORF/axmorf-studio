import { useMemo } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import {
  AxiomMorph,
  CameraMove,
  FilmCaptions,
  FilmSceneTrack,
  FilmSoundEffects,
  FilmSoundtrack,
  measureAxiomText,
  resolveAxiomMorph,
  resolveFilmSceneTrack,
  useFilm,
  type FilmScene,
} from "../../../remotion";

const FONT = {
  fontFamily: "Noto Sans CJK SC, sans-serif",
  fontSize: 100,
  fontWeight: 700,
};
const MORPH = {
  startFrame: 75,
  durationInFrames: 150,
  mode: "reform" as const,
  seed: "axiom-story",
  spread: 260,
};
const CAMERA = {
  startFrame: 75,
  durationInFrames: 150,
  preset: "pan-along-path" as const,
  width: 1920,
  height: 1080,
  worldWidth: 3200,
  worldHeight: 1400,
  path: [
    [960, 700],
    [1580, 620],
    [2240, 700],
  ] as const,
};
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// frame is explicitly the body clock, never the enclosing scene Sequence clock.
const AxiomWorld = ({ frame }: { frame: number }) => {
  const travel = interpolate(frame, [99, 183], [0, 1], clamp);
  const x = 960 + travel * 1280;
  return (
    <CameraMove
      {...CAMERA}
      frame={frame}
      layers={[
        {
          depth: 0.15,
          content: (
            <svg width={4000} height={1600}>
              <defs>
                <radialGradient id="axiom-light">
                  <stop stopColor="#254d64" />
                  <stop offset="1" stopColor="#08131f" />
                </radialGradient>
                <pattern
                  id="axiom-grid"
                  width={120}
                  height={120}
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d="M120 0H0V120"
                    fill="none"
                    stroke="#45718b"
                    strokeWidth={2}
                    opacity={0.2}
                  />
                </pattern>
              </defs>
              <rect width={4000} height={1600} fill="url(#axiom-light)" />
              <rect width={4000} height={1600} fill="url(#axiom-grid)" />
            </svg>
          ),
        },
        {
          depth: 1,
          content: (
            <>
              <svg width={3200} height={1400}>
                <path
                  d="M350 920 Q1600 780 2850 920"
                  fill="none"
                  stroke="#44758a"
                  strokeWidth={8}
                />
                <ellipse
                  cx={x}
                  cy={830}
                  rx={560}
                  ry={45}
                  fill="#000"
                  opacity={0.3}
                />
                {/* Evidence crosses the old claim as fracture begins at f99. */}
                <path
                  d={`M${x - 600} 420 L${x - 100} 570 L${x + 560} 390`}
                  fill="none"
                  stroke="#f3b66d"
                  strokeWidth={12}
                  strokeDasharray={1400}
                  strokeDashoffset={
                    1400 * (1 - interpolate(frame, [75, 99], [0, 1], clamp))
                  }
                />
              </svg>
              <div
                style={{
                  position: "absolute",
                  left: x - 700,
                  top: 600,
                  width: 1400,
                }}
              >
                <AxiomMorph
                  {...MORPH}
                  {...FONT}
                  frame={frame}
                  text="规模决定能力"
                  nextText="证据决定能力"
                  color="#ecf7fa"
                />
              </div>
              <div
                style={{
                  position: "absolute",
                  left: 800,
                  top: 990,
                  fontSize: 38,
                  color: "#f3b66d",
                }}
              >
                旧假设
              </div>
              <div
                style={{
                  position: "absolute",
                  left: 2100,
                  top: 990,
                  fontSize: 38,
                  color: "#62dcda",
                }}
              >
                可检验的结论
              </div>
            </>
          ),
        },
        {
          depth: 1.4,
          content: (
            <svg width={4600} height={1800}>
              <path
                d="M0 1270 L4600 1000 L4600 1800 L0 1800Z"
                fill="#050d17"
                opacity={0.65}
              />
            </svg>
          ),
        },
      ]}
    />
  );
};

export const AxiomStoryExample = () => {
  const film = useFilm();
  const frame = useCurrentFrame();
  const layouts = useMemo(
    () => ({
      text: measureAxiomText("规模决定能力", FONT),
      nextText: measureAxiomText("证据决定能力", FONT),
    }),
    [],
  );
  const morph = resolveAxiomMorph(frame, { ...MORPH, ...layouts });
  const scenes: readonly FilmScene[] = [
    {
      id: "old",
      from: 0,
      chapter: "question",
      render: (f) => <AxiomWorld frame={f} />,
    },
    {
      id: "evidence",
      from: 90,
      chapter: "proof",
      enter: { kind: "mask-wipe", frames: 12, sfx: false },
      render: (f) => <AxiomWorld frame={f + 90} />,
    },
  ];
  const track = resolveFilmSceneTrack(film, scenes);
  return (
    <AbsoluteFill
      style={{ background: "#08131f", fontFamily: FONT.fontFamily }}
    >
      <FilmSceneTrack scenes={scenes} />
      <FilmSoundEffects
        cues={[
          ...track.sfxCues,
          { ...morph.sfxCues[0], for: "s02：证据击碎旧字" },
          // The visual land is f183; f181 snaps to the fixture's accent at f183.
          {
            frame: morph.land - 2,
            sfx: "soft-impact",
            snap: "accent",
            maxShiftFrames: 3,
            minFrame: morph.land - 2,
            maxFrame: morph.land,
            for: "s03：碎片重组为新公理",
          },
          { endFrame: morph.land, sfx: "riser-short", for: "s03：重组前蓄势" },
        ]}
      />
      <FilmSoundtrack
        musicDips={[{ from: 159, to: 183, volume: 0.02 }]}
        ending={{ landFrame: 270 }}
      />
      <FilmCaptions />
    </AbsoluteFill>
  );
};

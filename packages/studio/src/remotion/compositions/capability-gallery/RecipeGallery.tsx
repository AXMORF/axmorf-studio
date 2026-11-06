import { AbsoluteFill, useCurrentFrame } from "remotion";
import type { ReactNode } from "react";
import { recipeCues } from "../../capabilities/recipes/core";
import { FilmProvider, resolveFilmRuntime } from "../../film/context";
import {
  FilmSoundEffects,
  type FilmSoundEffectCue,
} from "../../film/FilmSoundEffects";
import {
  AxiomMorph,
  BarGrow,
  CameraMove,
  NumberRoll,
  ParallaxLayers,
  ParticleField,
  PRODUCER_RECIPE_CATALOG,
  resolveProducerRecipeTiming,
  resolveBarGrow,
  type CameraMoveOptions,
} from "../../capabilities/recipes";

export type RecipeGalleryId = keyof typeof PRODUCER_RECIPE_CATALOG;
export const RECIPE_GALLERY_IDS = Object.keys(
  PRODUCER_RECIPE_CATALOG,
) as RecipeGalleryId[];
export const RECIPE_GALLERY_FRAMES = 108;
const timing = { startFrame: 8, durationInFrames: 84 };
const runtime = resolveFilmRuntime({
  spec: {
    schemaVersion: 1,
    filmId: "recipe-gallery",
    render: { width: 1920, height: 1080, fps: 30 },
    narration: [],
    timeline: { durationInFrames: RECIPE_GALLERY_FRAMES },
    publish: { title: "Motion recipes" },
  },
  timing: null,
  music: null,
});
const font = {
  fontFamily: "Noto Sans CJK SC, sans-serif",
  fontSize: 82,
  fontWeight: 700,
};
const camera: Omit<CameraMoveOptions, "preset"> = {
  ...timing,
  width: 1920,
  height: 1080,
  worldWidth: 3200,
  worldHeight: 1400,
  from: [960, 700],
  to: [2240, 700],
};
const layers = [
  {
    depth: 0.15,
    content: (
      <AbsoluteFill style={{ background: "#101d2d" }}>
        <svg width={3200} height={1400}>
          <defs>
            <pattern
              id="recipe-grid"
              width={160}
              height={160}
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M160 0H0V160"
                fill="none"
                stroke="#244255"
                strokeWidth={2}
              />
            </pattern>
          </defs>
          <rect width={3200} height={1400} fill="url(#recipe-grid)" />
        </svg>
      </AbsoluteFill>
    ),
  },
  {
    depth: 0.5,
    content: (
      <div
        style={{
          position: "absolute",
          left: 420,
          top: 160,
          fontSize: 260,
          color: "#213f50",
          fontWeight: 900,
        }}
      >
        EVIDENCE
      </div>
    ),
  },
  {
    depth: 1,
    content: (
      <>
        {["QUESTION", "MEASURE", "REFORM"].map((label, i) => (
          <div
            key={label}
            style={{
              position: "absolute",
              left: 600 + i * 720,
              top: 520,
              width: 500,
              height: 300,
              border: "3px solid #4bd9dc",
              padding: 40,
              fontSize: 50,
              color: "#efffff",
            }}
          >
            <div style={{ fontSize: 26, color: "#4bd9dc", marginBottom: 30 }}>
              0{i + 1}
            </div>
            {label}
          </div>
        ))}
      </>
    ),
  },
  {
    depth: 1.5,
    content: (
      <div
        style={{
          position: "absolute",
          left: 1450,
          top: 960,
          width: 1000,
          height: 24,
          background: "#e3b472",
        }}
      />
    ),
  },
];
export const RecipeGallery = ({
  recipe,
  cameraPreset = "pan-along-path",
  motionBlur = false,
}: {
  recipe: RecipeGalleryId;
  cameraPreset?: CameraMoveOptions["preset"];
  motionBlur?: boolean;
}) => {
  const frame = useCurrentFrame();
  let t = resolveProducerRecipeTiming(frame, timing);
  let cues: FilmSoundEffectCue[] = recipeCues(
    recipe,
    t,
    PRODUCER_RECIPE_CATALOG[recipe].sfxCues,
  );
  let body: ReactNode;
  switch (recipe) {
    case "AxiomMorph":
      body = (
        <div style={{ width: 1680 }}>
          <div style={{ fontSize: 26, color: "#e3b472", marginBottom: 28 }}>
            REFORM / SHARED GLYPHS TRAVEL
          </div>
          <AxiomMorph
            {...timing}
            {...font}
            text="更多 DATA = 更好?"
            nextText="更好 DATA = 更准"
            mode="reform"
          />
          <div style={{ marginTop: 80, display: "flex" }}>
            {(["assemble", "scatter", "shatter"] as const).map((mode) => (
              <div key={mode} style={{ width: 560 }}>
                <div
                  style={{ fontSize: 24, marginBottom: 20, color: "#8ca4b8" }}
                >
                  {mode.toUpperCase()}
                </div>
                <AxiomMorph
                  {...timing}
                  {...font}
                  fontSize={54}
                  text="公理 AXIOM"
                  mode={mode}
                  seed={mode}
                />
              </div>
            ))}
          </div>
        </div>
      );
      break;
    case "NumberRoll":
      body = (
        <div>
          <div style={{ fontSize: 32, marginBottom: 40, color: "#8ca4b8" }}>
            MEASURE THE COST / DECIMAL + UNIT
          </div>
          <NumberRoll
            {...timing}
            value={12804.75}
            decimals={2}
            prefix="¥ "
            suffix=" / 次"
            fontSize={180}
          />
        </div>
      );
      break;
    case "BarGrow": {
      const options = {
        ...timing,
        values: [28, 47, 65, 86],
        maxValue: 100,
        staggerInFrames: 5,
      };
      const resolved = resolveBarGrow(frame, options);
      t = resolved;
      cues = resolved.sfxCues;
      body = (
        <BarGrow {...options} labels={["BASE", "SIGNAL", "MODEL", "RESULT"]} />
      );
      break;
    }
    case "CameraMove":
      body = (
        <AbsoluteFill>
          <CameraMove
            {...camera}
            preset={cameraPreset}
            motionBlur={motionBlur}
            path={[
              [960, 700],
              [1700, 550],
              [2240, 700],
            ]}
            layers={layers}
          />
        </AbsoluteFill>
      );
      break;
    case "ParticleField":
      body = (
        <ParticleField
          {...timing}
          mode="assemble"
          width={1500}
          height={600}
          count={180}
          path="M300 450 L600 100 L900 450 Z M900 450 L1200 100"
          color="#4bd9dc"
        />
      );
      break;
    case "ParallaxLayers":
      body = (
        <AbsoluteFill>
          <ParallaxLayers {...camera} layers={layers} />
        </AbsoluteFill>
      );
      break;
  }
  return (
    <FilmProvider runtime={runtime}>
      <AbsoluteFill
        style={{
          background: "#0b1420",
          color: "#e7f5ff",
          fontFamily: "Noto Sans CJK SC, sans-serif",
          overflow: "hidden",
        }}
      >
        <AbsoluteFill
          style={{ alignItems: "center", justifyContent: "center" }}
        >
          {body}
        </AbsoluteFill>
        <AbsoluteFill
          style={{
            padding: 70,
            pointerEvents: "none",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 26,
              color: "#4bd9dc",
              letterSpacing: 5,
            }}
          >
            <span>AXMORF / MOTION RECIPES</span>
            <span>{recipe}</span>
          </div>
          <div style={{ fontSize: 26, color: "#8ca4b8" }}>
            {PRODUCER_RECIPE_CATALOG[recipe].title} · {t.phase.toUpperCase()} /
            LAND {recipe === "BarGrow" ? cues.at(-1)!.frame : t.land} · FRAME{" "}
            {frame}
          </div>
        </AbsoluteFill>
        <FilmSoundEffects cues={cues} />
      </AbsoluteFill>
    </FilmProvider>
  );
};

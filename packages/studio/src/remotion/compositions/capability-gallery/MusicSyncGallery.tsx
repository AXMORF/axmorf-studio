import { AbsoluteFill, useCurrentFrame } from "remotion";

import {
  FilmProvider,
  resolveFilmRuntime,
  useFilm,
  useFilmTiming,
} from "../../film/context";
import { FilmSoundEffects } from "../../film/FilmSoundEffects";
import { FilmSoundtrack } from "../../film/FilmSoundtrack";
import { useFilmMusicEnergy } from "../../film/useFilmMusicEnergy";
import { resolveFilmSoundEffectFrames } from "../../../contracts/film-sfx";
import { MUSIC_SYNC_SPEC } from "./music-sync-fixture";

const SoundMotion = ({ low }: { readonly low: number }) => {
  const frame = useCurrentFrame();
  const { spec } = useFilm();
  const { music } = useFilmTiming();
  const lastKick = music?.onsets?.kick.filter((at) => at <= frame).at(-1);
  const flash =
    lastKick === undefined ? 0 : Math.max(0, 1 - (frame - lastKick) / 6);
  const active =
    spec.sound?.effects.flatMap((effect) => {
      const { startFrame, endFrame } = resolveFilmSoundEffectFrames(
        effect,
        300,
      );
      return frame >= startFrame && frame < endFrame
        ? [{ ...effect, startFrame, endFrame }]
        : [];
    }) ?? [];
  const current = active.at(-1);
  const progress = current
    ? (frame - current.startFrame) / (current.endFrame - current.startFrame)
    : 0;
  const beatSection = frame >= 120 && frame < 240;
  return (
    <AbsoluteFill
      style={{
        background: "#0a1320",
        color: "#e6f4ee",
        fontFamily: "sans-serif",
        padding: 90,
      }}
    >
      <div style={{ fontSize: 28, letterSpacing: 6, color: "#91b4bb" }}>
        AXMORF / ORIGINAL SOUND · f{frame}
      </div>
      <div style={{ fontSize: 68, fontWeight: 700, marginTop: 24 }}>
        {frame < 120
          ? "蓄势与动作"
          : frame < 150
            ? "抽空 · 只留 pad"
            : frame < 240
              ? "揭示 · 精确落点"
              : "解决与收尾"}
      </div>
      <div
        style={{
          position: "absolute",
          left: 290 + (current?.kind === "whoosh" ? progress * 450 : 0),
          top: 360,
          width: 370,
          height: 370,
          borderRadius:
            current?.kind === "paper" || current?.kind === "clank" ? 24 : "50%",
          border: "8px solid #7ee3d5",
          transform: `scale(${current?.anchor === "end" ? 1.4 - progress * 0.4 : 1 + Math.sin(progress * Math.PI) * 0.12}) rotate(${current?.kind === "paper" ? progress * 180 : 0}deg)`,
          opacity: current?.kind === "glitch" && frame % 3 === 0 ? 0.2 : 1,
          boxShadow: `0 0 ${30 + low * 120}px rgba(126,227,213,${0.12 + low * 0.6})`,
        }}
      />
      <div style={{ position: "absolute", left: 900, top: 390, fontSize: 44 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 30 }}>
          <div
            style={{
              width: 76,
              height: 76,
              borderRadius: "50%",
              background: "#ffe0a0",
              opacity: 0.15 + flash * 0.85,
              boxShadow: `0 0 ${flash * 70}px #ffe0a0`,
            }}
          />
          <div>
            KICK · {lastKick === undefined ? "等待 onset" : `f${lastKick}`}
          </div>
        </div>
        <div style={{ fontSize: 34, color: "#91b4bb", marginTop: 30 }}>
          灯光起点 = onset · 0 帧偏移
        </div>
        <div style={{ marginTop: 50 }}>LOW · {low.toFixed(3)}</div>
        <div style={{ fontSize: 34, color: "#91b4bb", marginTop: 20 }}>
          辉光只跟连续能量呼吸
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 90,
          right: 90,
          bottom: 140,
          fontSize: 38,
        }}
      >
        {active
          .map(
            (effect) =>
              `${effect.kind} · f${effect.startFrame}–${effect.endFrame}`,
          )
          .join("  /  ") || (beatSection ? "编曲驱动的次级节奏" : "留白")}
      </div>
      <div
        style={{
          position: "absolute",
          left: 90,
          right: 90,
          bottom: 80,
          height: 8,
          background: "#223b48",
        }}
      >
        <div
          style={{
            width: `${(frame / 299) * 100}%`,
            height: "100%",
            background: "#7ee3d5",
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
const WithEnergy = () => {
  const energy = useFilmMusicEnergy();
  return <SoundMotion low={energy?.low ?? 0} />;
};

/** Pass generated music/sfx in --props; no synthesized media or IO during rendering. */
export const MusicSyncGallery = ({
  music = null,
  sfx = null,
}: {
  readonly music?: unknown;
  readonly sfx?: unknown;
}) => {
  const runtime = resolveFilmRuntime({
    spec: MUSIC_SYNC_SPEC,
    timing: null,
    music,
    sfx,
  });
  return (
    <FilmProvider runtime={runtime}>
      {music === null ? <SoundMotion low={0} /> : <WithEnergy />}
      <FilmSoundtrack />
      {sfx !== null ? <FilmSoundEffects /> : null}
    </FilmProvider>
  );
};

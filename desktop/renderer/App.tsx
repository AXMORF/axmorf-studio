import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import type { PreviewPlayerEntry } from "../contracts/preview";
import type { DesktopAppState, DesktopShellApi } from "../contracts/shell";

declare global {
  interface Window {
    axmorfStudio: DesktopShellApi;
  }
}

export const timeToPreviewFrame = ({
  currentTime,
  fps,
  frameCount,
}: Readonly<{
  currentTime: number;
  fps: number;
  frameCount: number;
}>) =>
  Math.min(
    frameCount - 1,
    Math.max(0, Math.floor(Math.max(0, currentTime) * fps)),
  );

export const previewFrameToTime = (frame: number, fps: number) => frame / fps;

export const isFrameInEndExclusiveRange = (
  frame: number,
  startFrame: number,
  endFrame: number,
) => frame >= startFrame && frame < endFrame;

const percent = (frame: number, frameCount: number) =>
  `${(frame / frameCount) * 100}%`;

const segmentStyle = (
  startFrame: number,
  endFrame: number,
  frameCount: number,
): CSSProperties => ({
  left: percent(startFrame, frameCount),
  width: percent(Math.max(1, endFrame - startFrame), frameCount),
});

const formatTime = (frame: number, fps: number) => {
  const seconds = frame / fps;
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${(seconds % 60)
    .toFixed(2)
    .padStart(5, "0")}`;
};

type TimelineProps = Readonly<{
  entry: PreviewPlayerEntry;
  currentFrame: number;
  onSeek: (frame: number) => void;
}>;

const Timeline = ({ entry, currentFrame, onSeek }: TimelineProps) => {
  const { timeline, frameCount, fps } = entry;
  return (
    <section className="timeline-panel" aria-label="只读多轨时间轴">
      <header className="timeline-header">
        <div>
          <span className="section-kicker">Timeline</span>
          <strong>结构视图</strong>
        </div>
        <output aria-label="当前播放位置">
          {formatTime(currentFrame, fps)}
          <span>
            F{currentFrame} / {frameCount - 1}
          </span>
        </output>
      </header>
      <div className="timeline-grid">
        <div className="track-label">Scene</div>
        <div className="track scene-track">
          {timeline.scenes.map((scene, index) => (
            <button
              className={
                isFrameInEndExclusiveRange(
                  currentFrame,
                  scene.startFrame,
                  scene.endFrame,
                )
                  ? "segment scene-segment active"
                  : "segment scene-segment"
              }
              key={scene.meaningId}
              onClick={() => onSeek(scene.startFrame)}
              style={segmentStyle(scene.startFrame, scene.endFrame, frameCount)}
              title={`${scene.label} · ${scene.startFrame}–${scene.endFrame}`}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              {scene.label}
            </button>
          ))}
          <div
            aria-hidden="true"
            className="playhead"
            style={{ left: percent(currentFrame, frameCount) }}
          />
        </div>

        <div className="track-label">Narration</div>
        <div className="track narration-track">
          {timeline.narration.map((segment) => {
            const key =
              segment.kind === "chunk"
                ? segment.chunkId
                : `${segment.afterChunkId}:pause`;
            const label =
              segment.kind === "chunk"
                ? segment.text
                : `停顿 ${segment.pauseMs}ms`;
            return (
              <button
                className={`segment narration-segment ${segment.kind}`}
                key={key}
                onClick={() => onSeek(segment.startFrame)}
                style={segmentStyle(
                  segment.startFrame,
                  segment.endFrame,
                  frameCount,
                )}
                title={label}
              >
                {label}
              </button>
            );
          })}
          <div
            aria-hidden="true"
            className="playhead"
            style={{ left: percent(currentFrame, frameCount) }}
          />
        </div>

        <div className="track-label">Caption</div>
        <div className="track caption-track">
          {timeline.captions.map((caption) => (
            <button
              className="segment caption-segment"
              key={caption.chunkId}
              onClick={() => onSeek(caption.startFrame)}
              style={segmentStyle(
                caption.startFrame,
                caption.endFrame,
                frameCount,
              )}
              title={caption.text}
            >
              {caption.text}
            </button>
          ))}
          <div
            aria-hidden="true"
            className="playhead"
            style={{ left: percent(currentFrame, frameCount) }}
          />
        </div>
      </div>
    </section>
  );
};

const FirstRun = ({
  state,
  onChoose,
  onRetry,
}: Readonly<{
  state: DesktopAppState | null;
  onChoose: () => void;
  onRetry: () => void;
}>) => (
  <main className="first-run-shell">
    <section className="hero-card">
      <p className="section-kicker">Repository adapter · Phase A</p>
      <h1>把当前成片放上剪辑台。</h1>
      <p className="status-copy">
        AXMORF Studio 只读取经过验证的 current Delivery，并把
        Scene、旁白与字幕时序投影到一个只读时间轴。
      </p>
      {state?.status === "workspace-selection-required" ? (
        <div className="workspace-choice">
          <span>唯一 Workspace Root</span>
          <strong>{state.initialWorkspaceRoot}</strong>
          <button onClick={onChoose}>确认或选择 Workspace</button>
        </div>
      ) : null}
      {state?.status === "fatal" ? (
        <div className="fatal-state" role="alert">
          <span>Engine 未能启动</span>
          <code>{state.error}</code>
          <button onClick={onRetry}>重试 Engine</button>
        </div>
      ) : null}
      {state === null ||
      state.status === "initializing" ||
      state.status === "loading-catalog" ? (
        <p className="loading-state">正在读取 Workspace…</p>
      ) : null}
    </section>
  </main>
);

export const App = () => {
  const [state, setState] = useState<DesktopAppState | null>(null);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let active = true;
    void window.axmorfStudio.getAppState().then((next) => {
      if (active) setState(next);
    });
    return () => {
      active = false;
    };
  }, []);

  const selectedEntry = useMemo(
    () =>
      state?.catalog.entries.find(
        ({ storyId }) => storyId === state.selectedStoryId,
      ) ?? null,
    [state],
  );

  useEffect(() => {
    setCurrentFrame(0);
    setPlayerError(null);
  }, [selectedEntry?.storyId, selectedEntry?.deliveryBuildId]);

  const runStateAction = useCallback(
    async (action: () => Promise<DesktopAppState>) => {
      setBusy(true);
      setActionError(null);
      try {
        setState(await action());
      } catch {
        setActionError("操作未完成。请刷新 Catalog 或重试 Engine。");
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const seek = useCallback(
    (frame: number) => {
      if (selectedEntry === null || videoRef.current === null) return;
      const clamped = Math.min(
        selectedEntry.frameCount - 1,
        Math.max(0, frame),
      );
      videoRef.current.currentTime = previewFrameToTime(
        clamped,
        selectedEntry.fps,
      );
      setCurrentFrame(clamped);
    },
    [selectedEntry],
  );

  const syncVideoFrame = useCallback(
    (currentTime: number) => {
      if (selectedEntry === null) return;
      setCurrentFrame(
        timeToPreviewFrame({
          currentTime,
          fps: selectedEntry.fps,
          frameCount: selectedEntry.frameCount,
        }),
      );
    },
    [selectedEntry],
  );

  if (state?.status !== "ready") {
    return (
      <FirstRun
        state={state}
        onChoose={() =>
          void runStateAction(() =>
            window.axmorfStudio.chooseInitialWorkspace(),
          )
        }
        onRetry={() =>
          void runStateAction(() => window.axmorfStudio.retryEngine())
        }
      />
    );
  }

  return (
    <main className="edit-suite">
      <header className="top-bar">
        <div className="wordmark">
          <span aria-hidden="true">AX</span>
          <div>
            <strong>AXMORF Studio</strong>
            <small>Preview workspace</small>
          </div>
        </div>
        <div className="workspace-summary">
          <span>Workspace</span>
          <button
            className="path-button"
            onClick={() => void window.axmorfStudio.showWorkspaceInFinder()}
            title="在 Finder 中显示"
          >
            {state.workspaceRoot}
          </button>
        </div>
        <div className="prototype-badge">Phase A · 只读</div>
      </header>

      <aside className="project-rail">
        <div className="rail-heading">
          <div>
            <span className="section-kicker">Current delivery</span>
            <h2>项目</h2>
          </div>
          <button
            aria-label="刷新 Preview Catalog"
            className="icon-button"
            disabled={busy}
            onClick={() =>
              void runStateAction(() =>
                window.axmorfStudio.refreshPreviewCatalog(),
              )
            }
          >
            ↻
          </button>
        </div>

        {state.catalog.entries.length > 0 ? (
          <label className="project-select">
            <span>选择视频</span>
            <select
              disabled={busy}
              onChange={(event) =>
                void runStateAction(() =>
                  window.axmorfStudio.selectPreview(event.target.value),
                )
              }
              value={state.selectedStoryId ?? ""}
            >
              {state.catalog.entries.map((entry) => (
                <option key={entry.storyId} value={entry.storyId}>
                  {entry.title}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="empty-catalog">
            <strong>没有可播放成片</strong>
            <p>完成并验证 current four-file Delivery 后，再刷新这里。</p>
          </div>
        )}

        {selectedEntry !== null ? (
          <dl className="clip-facts">
            <div>
              <dt>画幅</dt>
              <dd>
                {selectedEntry.width} × {selectedEntry.height}
              </dd>
            </div>
            <div>
              <dt>帧率</dt>
              <dd>{selectedEntry.fps} fps</dd>
            </div>
            <div>
              <dt>Scene</dt>
              <dd>{selectedEntry.timeline.scenes.length}</dd>
            </div>
          </dl>
        ) : null}

        {state.catalog.unavailable.length > 0 ? (
          <section className="unavailable-list" aria-label="不可播放项目">
            <h3>尚不可播放</h3>
            <ul>
              {state.catalog.unavailable.map((entry) => (
                <li key={entry.storyId}>
                  <span>{entry.storyId}</span>
                  <code>{entry.code}</code>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <dl className="runtime-facts">
          <div>
            <dt>Adapter</dt>
            <dd>repository</dd>
          </div>
          <div>
            <dt>Runtime</dt>
            <dd>host-node-prototype</dd>
          </div>
          {[
            ["Production", state.productionAvailable],
            ["Delivery", state.deliveryAvailable],
            ["Distribution", state.distributionReady],
            ["Runtime Pack", state.runtimePackAvailable],
          ].map(([label]) => (
            <div key={String(label)}>
              <dt>{label}</dt>
              <dd className="unavailable">unavailable</dd>
            </div>
          ))}
        </dl>
      </aside>

      <section className="viewer-stage">
        {actionError !== null ? (
          <div className="action-error" role="alert">
            {actionError}
          </div>
        ) : null}
        {selectedEntry === null ? (
          <div className="viewer-empty">
            <span className="empty-frame" aria-hidden="true" />
            <strong>选择一个 current video</strong>
            <p>播放器不会执行 Project TSX，只读取通过校验的最终 MP4。</p>
          </div>
        ) : (
          <>
            <header className="viewer-heading">
              <div>
                <span className="section-kicker">Now previewing</span>
                <h1>{selectedEntry.title}</h1>
              </div>
              <code>{selectedEntry.storyId}</code>
            </header>
            <div className="video-well">
              {/* Desktop Preview plays a verified final MP4 outside a Remotion composition. */}
              {/* eslint-disable-next-line @remotion/warn-native-media-tag */}
              <video
                controls
                key={selectedEntry.videoUrl}
                onError={() =>
                  setPlayerError("视频身份已失效。请刷新 Catalog 后重新选择。")
                }
                onSeeked={(event) =>
                  syncVideoFrame(event.currentTarget.currentTime)
                }
                onTimeUpdate={(event) =>
                  syncVideoFrame(event.currentTarget.currentTime)
                }
                preload="metadata"
                ref={videoRef}
                src={selectedEntry.videoUrl}
              />
              {playerError !== null ? (
                <div className="player-error" role="alert">
                  {playerError}
                </div>
              ) : null}
            </div>
          </>
        )}
      </section>

      {selectedEntry !== null ? (
        <Timeline
          currentFrame={currentFrame}
          entry={selectedEntry}
          onSeek={seek}
        />
      ) : (
        <section className="timeline-panel timeline-empty">
          <span>Scene / Narration / Caption</span>
        </section>
      )}
    </main>
  );
};

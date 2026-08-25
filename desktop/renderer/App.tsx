import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import type { PreviewPlayerEntry } from "../contracts/preview";
import type { DesktopProductionProgress } from "../contracts/production-progress";
import type { DesktopAppState, DesktopShellApi } from "../contracts/shell";
import { SettingsPage } from "./SettingsPage";

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

type PreviewPlayerError = Readonly<{
  videoUrl: string;
  message: string;
}>;

export const currentPreviewPlayerError = ({
  error,
  videoUrl,
}: Readonly<{
  error: PreviewPlayerError | null;
  videoUrl: string | null;
}>) => (error?.videoUrl === videoUrl ? error.message : null);

export const previewPlayerAspectRatio = ({
  width,
  height,
}: Readonly<{ width: number; height: number }>) => `${width} / ${height}`;

export const fitPreviewPlayerSize = ({
  containerWidth,
  containerHeight,
  videoWidth,
  videoHeight,
}: Readonly<{
  containerWidth: number;
  containerHeight: number;
  videoWidth: number;
  videoHeight: number;
}>) => {
  const scale = Math.min(
    containerWidth / videoWidth,
    containerHeight / videoHeight,
  );
  return {
    width: Math.max(0, videoWidth * scale),
    height: Math.max(0, videoHeight * scale),
  } as const;
};

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

export const productionTaskPercent = (progress: DesktopProductionProgress) => {
  if (progress.state === "succeeded") return 100;
  const completed =
    progress.committedTaskCount +
    progress.currentTaskCount +
    progress.failedTaskCount;
  return progress.dirtyAgentTaskCount === 0
    ? progress.state === "converging"
      ? 100
      : 0
    : Math.min(
        100,
        Math.round((completed / progress.dirtyAgentTaskCount) * 100),
      );
};

const productionStateLabel = {
  "waiting-for-agent": "等待 Agent 任务",
  converging: "正在收敛并构建 Delivery",
  succeeded: "制作完成",
  failed: "制作失败",
} as const;

export const ProductionProgressSummary = ({
  progress,
}: Readonly<{ progress: DesktopProductionProgress }>) => {
  const completed = progress.committedTaskCount + progress.currentTaskCount;
  const percentComplete = productionTaskPercent(progress);
  return (
    <section className="production-progress" aria-label="制作进度">
      <header>
        <div>
          <span>Production</span>
          <strong data-state={progress.state}>
            {productionStateLabel[progress.state]}
          </strong>
        </div>
        <output>{percentComplete}%</output>
      </header>
      <div
        aria-label={`Agent 任务 ${completed}/${progress.dirtyAgentTaskCount}`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={percentComplete}
        className="production-progress-track"
        role="progressbar"
      >
        <span style={{ width: `${percentComplete}%` }} />
      </div>
      <dl>
        <div>
          <dt>Agent tasks</dt>
          <dd>
            {completed}/{progress.dirtyAgentTaskCount} · failed{" "}
            {progress.failedTaskCount}
          </dd>
        </div>
        <div>
          <dt>Attempt</dt>
          <dd>{progress.state}</dd>
        </div>
        <div>
          <dt>Terminal</dt>
          <dd>{progress.terminalResult}</dd>
        </div>
        <div>
          <dt>Diagnostic</dt>
          <dd>{progress.diagnosticCode ?? "null"}</dd>
        </div>
      </dl>
      {progress.deliveryBuildId !== null ? (
        <div className="delivery-summary">
          <span>Current Delivery</span>
          <code>{progress.deliveryBuildId}</code>
          {progress.deliveryFilesComplete ? (
            <small>video · cover 4:3 · cover 3:4 · publish</small>
          ) : null}
        </div>
      ) : null}
    </section>
  );
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
  onSettings,
}: Readonly<{
  state: DesktopAppState | null;
  onChoose: () => void;
  onRetry: () => void;
  onSettings: () => void;
}>) => (
  <main className="first-run-shell">
    <section className="hero-card">
      <p className="section-kicker">Workspace production · Phase B</p>
      <h1>从作品到成片，都在一个 Workspace。</h1>
      <p className="status-copy">
        AXMORF Studio 使用内置 Runtime Pack 生产作品；播放器只读取经过验证的
        current four-file Delivery。
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
      state.status === "loading-catalog" ||
      state.status === "migrating-workspace" ? (
        <p className="loading-state">
          {state?.status === "migrating-workspace"
            ? "正在复制、验证并切换 Workspace；旧位置会保留。"
            : "正在读取 Workspace…"}
        </p>
      ) : null}
      <button className="first-run-settings" onClick={onSettings}>
        打开独立配置页面
      </button>
    </section>
  </main>
);

export const App = () => {
  const [state, setState] = useState<DesktopAppState | null>(null);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [playerError, setPlayerError] = useState<PreviewPlayerError | null>(
    null,
  );
  const [playerReloadVersion, setPlayerReloadVersion] = useState(0);
  const [deleteCandidate, setDeleteCandidate] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [view, setView] = useState<"preview" | "settings">("preview");
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoWellRef = useRef<HTMLDivElement>(null);
  const playerRecoveryAttempted = useRef(new Set<string>());
  const [playerSize, setPlayerSize] = useState<Readonly<{
    width: number;
    height: number;
  }> | null>(null);

  useEffect(() => {
    let active = true;
    const refresh = () =>
      void window.axmorfStudio.getAppState().then((next) => {
        if (active) setState(next);
      });
    refresh();
    const timer = window.setInterval(refresh, 1_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const selectedEntry = useMemo(
    () =>
      state?.catalog.entries.find(
        ({ storyId }) => storyId === state.selectedStoryId,
      ) ?? null,
    [state],
  );
  const selectedProject = useMemo(
    () =>
      state?.projects.find(
        ({ storyId }) => storyId === state.selectedStoryId,
      ) ?? null,
    [state],
  );
  const selectedProgress = useMemo(
    () =>
      state?.productionProgress.find(
        ({ storyId }) => storyId === state.selectedStoryId,
      ) ?? null,
    [state],
  );
  const visiblePlayerError = currentPreviewPlayerError({
    error: playerError,
    videoUrl: selectedEntry?.videoUrl ?? null,
  });
  const selectedVideoWidth = selectedEntry?.width ?? null;
  const selectedVideoHeight = selectedEntry?.height ?? null;

  useEffect(() => {
    setCurrentFrame(0);
    setPlayerError(null);
    playerRecoveryAttempted.current.clear();
    setDeleteCandidate(null);
    setDeleteConfirmation("");
  }, [state?.selectedStoryId, selectedEntry?.deliveryBuildId]);

  useEffect(() => {
    const well = videoWellRef.current;
    if (
      well === null ||
      selectedVideoWidth === null ||
      selectedVideoHeight === null
    ) {
      setPlayerSize(null);
      return;
    }
    const update = () => {
      const bounds = well.getBoundingClientRect();
      setPlayerSize(
        fitPreviewPlayerSize({
          containerWidth: bounds.width,
          containerHeight: bounds.height,
          videoWidth: selectedVideoWidth,
          videoHeight: selectedVideoHeight,
        }),
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(well);
    return () => observer.disconnect();
  }, [selectedVideoHeight, selectedVideoWidth]);

  const runStateAction = useCallback(
    async (action: () => Promise<DesktopAppState>) => {
      setBusy(true);
      setActionError(null);
      try {
        setState(await action());
        return true;
      } catch {
        setActionError("操作未完成。请刷新 Catalog 或重试 Engine。");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  useEffect(() => {
    const videoUrl = selectedEntry?.videoUrl;
    if (
      videoUrl === undefined ||
      playerError?.videoUrl !== videoUrl ||
      state?.activeWork !== null ||
      playerRecoveryAttempted.current.has(videoUrl)
    ) {
      return;
    }
    playerRecoveryAttempted.current.add(videoUrl);
    void runStateAction(() => window.axmorfStudio.refreshPreviewCatalog()).then(
      (refreshed) => {
        if (!refreshed) return;
        setPlayerError(null);
        setPlayerReloadVersion((version) => version + 1);
      },
    );
  }, [playerError, runStateAction, selectedEntry?.videoUrl, state?.activeWork]);

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

  useEffect(() => {
    const video = videoRef.current;
    if (selectedEntry === null || video === null) return;
    const sync = () => syncVideoFrame(video.currentTime);
    video.addEventListener("seeking", sync);
    video.addEventListener("seeked", sync);
    video.addEventListener("timeupdate", sync);
    return () => {
      video.removeEventListener("seeking", sync);
      video.removeEventListener("seeked", sync);
      video.removeEventListener("timeupdate", sync);
    };
  }, [selectedEntry, syncVideoFrame]);

  if (view === "settings") {
    return (
      <main className="settings-shell">
        <header className="top-bar settings-top-bar">
          <div className="wordmark">
            <span aria-hidden="true">AX</span>
            <div>
              <strong>AXMORF Studio</strong>
              <small>Desktop configuration</small>
            </div>
          </div>
          <div className="settings-top-context">
            <span>Single encrypted authority</span>
            <strong>{state?.health.provider ?? "loading"}</strong>
          </div>
          <nav className="app-navigation" aria-label="Desktop 页面">
            <button onClick={() => setView("preview")}>Preview</button>
            <button aria-current="page">配置</button>
          </nav>
        </header>
        <SettingsPage appState={state} onAppState={setState} />
      </main>
    );
  }

  if (state?.status !== "ready") {
    return (
      <FirstRun
        state={state}
        onSettings={() => setView("settings")}
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
            title="在文件管理器中显示"
          >
            {state.workspaceRoot}
          </button>
          <button
            className="migration-button"
            disabled={busy || state.activeWork !== null}
            onClick={() =>
              void runStateAction(() => window.axmorfStudio.migrateWorkspace())
            }
            title={
              state.activeWork === null
                ? "迁移整个 Workspace Root"
                : "存在 active work，暂不能迁移"
            }
          >
            迁移 Workspace
          </button>
        </div>
        <nav className="app-navigation" aria-label="Desktop 页面">
          <button aria-current="page">Preview</button>
          <button onClick={() => setView("settings")}>配置</button>
        </nav>
      </header>

      <aside className="project-rail">
        <div className="rail-heading">
          <div>
            <span className="section-kicker">Workspace Projects</span>
            <h2>项目</h2>
          </div>
          <button
            aria-label="刷新 Preview Catalog"
            className="icon-button"
            disabled={busy}
            onClick={() => {
              void runStateAction(() =>
                window.axmorfStudio.refreshPreviewCatalog(),
              ).then((refreshed) => {
                if (!refreshed) return;
                setPlayerError(null);
                setPlayerReloadVersion((version) => version + 1);
              });
            }}
          >
            ↻
          </button>
        </div>

        {state.projects.length > 0 ? (
          <label className="project-select">
            <span>选择项目</span>
            <select
              disabled={busy}
              onChange={(event) =>
                void runStateAction(() =>
                  window.axmorfStudio.selectPreview(event.target.value),
                )
              }
              value={state.selectedStoryId ?? ""}
            >
              {state.projects.map((project) => (
                <option key={project.storyId} value={project.storyId}>
                  {project.title}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="empty-catalog">
            <strong>Workspace 中还没有项目</strong>
            <p>使用 rsp project create 创建第一个 Project。</p>
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

        {selectedProject !== null ? (
          <section className="project-status" aria-label="Project生产状态">
            <div>
              <span>Source</span>
              <strong data-state={selectedProject.source}>
                {selectedProject.source}
              </strong>
            </div>
            <div>
              <span>Delivery</span>
              <strong data-state={selectedProject.delivery}>
                {selectedProject.delivery}
              </strong>
            </div>
            {selectedProject.source === "current" &&
            selectedProject.delivery !== "current" ? (
              <p>Source 已就绪，尚无可播放成片。</p>
            ) : null}
            <div className="project-actions">
              <button
                disabled={
                  busy ||
                  state.activeWork !== null ||
                  !state.deliveryAvailable ||
                  selectedProject.source !== "current" ||
                  selectedProject.delivery === "current"
                }
                onClick={() =>
                  void runStateAction(() =>
                    window.axmorfStudio.buildDelivery(selectedProject.storyId),
                  )
                }
              >
                生成 Delivery
              </button>
              <button
                className="delete-project-button"
                disabled={busy || state.activeWork !== null}
                onClick={() => {
                  setDeleteCandidate(selectedProject.storyId);
                  setDeleteConfirmation("");
                }}
              >
                删除项目
              </button>
            </div>
            {deleteCandidate === selectedProject.storyId ? (
              <div className="delete-project-confirmation" role="group">
                <p>
                  此操作会删除该 Project 的 source、attempt、artifact 与
                  Delivery。 输入完整 Project ID 确认。
                </p>
                <code>{selectedProject.storyId}</code>
                <input
                  aria-label="输入完整 Project ID 确认删除"
                  onChange={(event) =>
                    setDeleteConfirmation(event.target.value)
                  }
                  placeholder={selectedProject.storyId}
                  value={deleteConfirmation}
                />
                <div>
                  <button
                    className="delete-project-button"
                    disabled={
                      busy ||
                      state.activeWork !== null ||
                      deleteConfirmation !== selectedProject.storyId
                    }
                    onClick={() =>
                      void runStateAction(() =>
                        window.axmorfStudio.deleteProject(
                          selectedProject.storyId,
                        ),
                      ).then((deleted) => {
                        if (!deleted) return;
                        setDeleteCandidate(null);
                        setDeleteConfirmation("");
                        setPlayerError(null);
                      })
                    }
                  >
                    确认删除
                  </button>
                  <button
                    onClick={() => {
                      setDeleteCandidate(null);
                      setDeleteConfirmation("");
                    }}
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : null}
            {!state.deliveryAvailable && state.deliveryBlocker !== null ? (
              <p role="status">
                {state.deliveryBlocker.message}
                <code>{state.deliveryBlocker.code}</code>
              </p>
            ) : null}
          </section>
        ) : null}

        {selectedProgress !== null ? (
          <ProductionProgressSummary progress={selectedProgress} />
        ) : state.activeWork !== null &&
          state.activeWork.storyId === selectedProject?.storyId ? (
          <section className="production-progress" aria-label="制作进度">
            <header>
              <div>
                <span>Production</span>
                <strong>{state.activeWork.phase}</strong>
              </div>
            </header>
            <p>正在创建并绑定本次 Execution Attempt…</p>
          </section>
        ) : null}

        {selectedProject?.invalidation.length ? (
          <section className="unavailable-list" aria-label="结构化失效原因">
            <h3>失效原因</h3>
            <ul>
              {selectedProject.invalidation.map((entry) => (
                <li key={entry.code}>
                  <span>{entry.cause}</span>
                  <code>{entry.code}</code>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <dl className="runtime-facts">
          <div>
            <dt>Adapter</dt>
            <dd>workspace</dd>
          </div>
          <div>
            <dt>Runtime</dt>
            <dd>embedded</dd>
          </div>
          <div>
            <dt>Runtime Pack</dt>
            <dd>{state.health.runtime}</dd>
          </div>
          <div>
            <dt>Agent</dt>
            <dd>{state.health.agentIntegration}</dd>
          </div>
          <div>
            <dt>Provider</dt>
            <dd>{state.health.provider}</dd>
          </div>
          <div>
            <dt>Active work</dt>
            <dd>{state.activeWork?.phase ?? "idle"}</dd>
          </div>
        </dl>
      </aside>

      <section className="viewer-stage">
        {actionError !== null || state.error !== null ? (
          <div className="action-error" role="alert">
            {actionError ?? state.error}
          </div>
        ) : null}
        {selectedEntry === null ? (
          <div className="viewer-empty">
            <span className="empty-frame" aria-hidden="true" />
            <strong>
              {selectedProject?.source === "current"
                ? "尚无可播放成片"
                : "选择一个 Workspace Project"}
            </strong>
            <p>
              {selectedProject?.source === "current"
                ? "点击“生成 Delivery”；播放器不会执行 Project TSX。"
                : "Preview Player 只接受 exact current four-file Delivery。"}
            </p>
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
            <div className="video-well" ref={videoWellRef}>
              {/* Desktop Preview plays a verified final MP4 outside a Remotion composition. */}
              {/* eslint-disable-next-line @remotion/warn-native-media-tag */}
              <video
                controls
                height={selectedEntry.height}
                key={`${selectedEntry.videoUrl}:${playerReloadVersion}`}
                onError={() =>
                  setPlayerError({
                    videoUrl: selectedEntry.videoUrl,
                    message:
                      state.activeWork === null
                        ? "视频身份正在自动同步；若仍失败请刷新 Catalog。"
                        : "Delivery 正在更新，完成后会自动重新载入。",
                  })
                }
                preload="auto"
                ref={videoRef}
                src={selectedEntry.videoUrl}
                style={{
                  aspectRatio: previewPlayerAspectRatio(selectedEntry),
                  height: playerSize?.height ?? "100%",
                  width: playerSize?.width ?? "100%",
                }}
                width={selectedEntry.width}
              />
              {visiblePlayerError !== null ? (
                <div className="player-error" role="alert">
                  {visiblePlayerError}
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

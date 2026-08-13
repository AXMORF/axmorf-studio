import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { buildStudioUrl, isLanAccessHostname } from "./network";
import {
  COMMON_RENDER_SIZES,
  getConfigConsistencyError,
  nextUniqueId,
  parseRenderSize,
  projectDeletionErrorMessage,
  removeVoiceProfile,
  renderSizeValue,
  selectProviderAndVoice,
} from "./model";

type TabId = "progress" | "general" | "safe-area" | "collections" | "tts";
type VoiceProfile =
  | {
      id: string;
      name: string;
      mode: "controllable-clone";
      referenceAudioPath: string;
      controlInstruction: string;
    }
  | {
      id: string;
      name: string;
      mode: "high-fidelity-clone";
      promptAudioPath: string;
      promptTextPath: string;
      promptTranscriptConfirmed: true;
    };
type VoxcpmProviderConfig = {
  id: string;
  kind: "voxcpm";
  name: string;
  connection: { baseUrl: string; token?: string; timeoutMs: number };
  modelId: string;
  routes: {
    controllableClone: "/clone";
    highFidelityClone: "/clone_with_prompt";
  };
  parameters: {
    cfgValue: number;
    inferenceTimesteps: number;
    minLen: number;
    maxLen: number;
    normalize: boolean;
    denoise: boolean;
    retryBadcase: boolean;
    retryBadcaseMaxTimes: number;
    retryBadcaseRatioThreshold: number;
  };
  voiceProfiles: VoiceProfile[];
};
type EditableConfig = {
  schemaVersion: 1;
  contractVersion: "producer-config-v1";
  renderDefaults: {
    width: number;
    height: number;
    fps: number;
    locale: string;
  };
  readability: { edgeInsetPx: number };
  audioDefaults?: {
    globalBgm: null | { sourcePath: string; volume: number };
  };
  publishingCollections: Array<{
    id: string;
    name: string;
    description: string;
  }>;
  tts: {
    defaultProviderId: string;
    defaultVoiceProfileId: string;
    speech: { rate: number; targetLoudnessLufs: number };
    providers: VoxcpmProviderConfig[];
  };
  configFingerprint?: string;
};
type EnvironmentDiagnostics = {
  schemaVersion: 1;
  status: "pass" | "attention";
  checks: Array<{
    id: string;
    status: "pass" | "fail";
    summary: string;
    remediation: string | null;
  }>;
};
type ProductionProgressStepStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "attention"
  | "launched";
type ProductionRunProgress = {
  runId: string;
  storyId: string;
  createdAt: string;
  updatedAt: string;
  state: string;
  completedSteps: number;
  totalSteps: number;
  steps: Array<{
    id: string;
    label: string;
    command: string;
    status: ProductionProgressStepStatus;
    detail: string;
    occurredAt: string | null;
  }>;
};
type ProjectProductionProgress = {
  projectId: string;
  status: "idle" | "available" | "error";
  error: string | null;
  run: ProductionRunProgress | null;
};
type ProductionProgress = {
  schemaVersion: 2;
  projects: ProjectProductionProgress[];
};

const tabs: ReadonlyArray<
  Readonly<{ id: TabId; label: string; index: string }>
> = [
  { id: "progress", label: "制作进度", index: "01" },
  { id: "general", label: "通用", index: "02" },
  { id: "safe-area", label: "画面安全区", index: "03" },
  { id: "collections", label: "合集", index: "04" },
  { id: "tts", label: "TTS", index: "05" },
];

const progressStatusLabels: Record<ProductionProgressStepStatus, string> = {
  pending: "等待",
  running: "运行中",
  succeeded: "已完成",
  failed: "失败",
  attention: "需处理",
  launched: "已启动",
};

const progressStateLabels: Record<string, string> = {
  initialized: "Run 已初始化",
  "narrative-running": "正在生成旁白与时序",
  "baseline-ready": "Narrative baseline 已就绪",
  "scene-inputs-frozen": "Scene 任务已冻结",
  "waiting-for-owner-results": "等待制作结果",
  "render-ready-running": "正在生成渲染计划",
  "render-ready": "已进入 render-ready",
  failed: "生产流程失败",
};

const timestampFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const formatTimestamp = (value: string | null) => {
  if (value === null) return "—";
  return timestampFormatter.format(new Date(value));
};

const numberValue = (value: string) => Number(value);

const Field = ({
  label,
  hint,
  children,
}: {
  readonly label: string;
  readonly hint?: string;
  readonly children: ReactNode;
}) => (
  <label className="field">
    <span className="field-label">{label}</span>
    {children}
    {hint === undefined ? null : <span className="field-hint">{hint}</span>}
  </label>
);

const Section = ({
  eyebrow,
  title,
  description,
  children,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
}) => (
  <section className="config-section">
    <div className="section-heading">
      <span>{eyebrow}</span>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </div>
    {children}
  </section>
);

const FieldRow = ({ children }: { readonly children: ReactNode }) => (
  <div className="field-row">{children}</div>
);

const cloneConfig = (config: EditableConfig): EditableConfig =>
  structuredClone(config);

export const App = () => {
  const [activeTab, setActiveTab] = useState<TabId>("progress");
  const [config, setConfig] = useState<EditableConfig | null>(null);
  const [savedFingerprint, setSavedFingerprint] = useState<string | null>(null);
  const [status, setStatus] = useState("正在读取本地配置…");
  const [isSaving, setIsSaving] = useState(false);
  const [diagnostics, setDiagnostics] = useState<EnvironmentDiagnostics | null>(
    null,
  );
  const [diagnosticsStatus, setDiagnosticsStatus] = useState("等待环境诊断…");
  const [productionProgress, setProductionProgress] =
    useState<ProductionProgress | null>(null);
  const [productionProgressStatus, setProductionProgressStatus] =
    useState("正在读取最新生产流程…");
  const [productionProgressError, setProductionProgressError] = useState<
    string | null
  >(null);
  const productionProgressRequest = useRef<AbortController | null>(null);
  const projectDeletionInProgress = useRef(false);
  const studioUrl = useMemo(() => buildStudioUrl(window.location.href), []);
  const lanAccess = isLanAccessHostname(window.location.hostname);

  useEffect(() => {
    let active = true;
    fetch("/api/settings", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.json()).error);
        return (await response.json()) as EditableConfig;
      })
      .then((loaded) => {
        if (!active) return;
        setConfig(loaded);
        setSavedFingerprint(loaded.configFingerprint ?? null);
        setStatus("配置已加载");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setStatus(error instanceof Error ? error.message : "配置读取失败");
      });
    return () => {
      active = false;
    };
  }, []);

  const provider = config?.tts.providers.find(
    ({ id }) => id === config.tts.defaultProviderId,
  );
  const dirty =
    config !== null && config.configFingerprint !== savedFingerprint;
  const consistencyError = useMemo(
    () =>
      config === null ? "配置尚未加载。" : getConfigConsistencyError(config),
    [config],
  );
  const refreshDiagnostics = useCallback(() => {
    setDiagnosticsStatus("正在运行只读 preflight…");
    fetch("/api/diagnostics", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as
          | EnvironmentDiagnostics
          | { error: string };
        if (!response.ok || "error" in body) {
          throw new Error("error" in body ? body.error : "环境诊断失败");
        }
        return body;
      })
      .then((result) => {
        setDiagnostics(result);
        setDiagnosticsStatus(
          result.status === "pass" ? "环境诊断通过" : "环境需要处理",
        );
      })
      .catch((error: unknown) => {
        setDiagnostics(null);
        setDiagnosticsStatus(
          error instanceof Error ? error.message : "环境诊断失败",
        );
      });
  }, []);

  useEffect(() => {
    refreshDiagnostics();
  }, [refreshDiagnostics]);
  const refreshProductionProgress = useCallback(async () => {
    if (projectDeletionInProgress.current) return;
    productionProgressRequest.current?.abort();
    const controller = new AbortController();
    productionProgressRequest.current = controller;
    try {
      const response = await fetch("/api/production-progress", {
        cache: "no-store",
        signal: controller.signal,
      });
      const body = (await response.json()) as
        | ProductionProgress
        | { error: string };
      if (!response.ok || "error" in body) {
        throw new Error("error" in body ? body.error : "生产进度读取失败");
      }
      if (controller.signal.aborted) return;
      setProductionProgress(body);
      setProductionProgressError(null);
      setProductionProgressStatus(
        body.projects.length === 0 ? "暂无 Project" : "Project 进度已更新",
      );
    } catch (error) {
      if (controller.signal.aborted) return;
      const message =
        error instanceof Error ? error.message : "生产进度读取失败";
      setProductionProgress(null);
      setProductionProgressError(message);
      setProductionProgressStatus(message);
    } finally {
      if (productionProgressRequest.current === controller) {
        productionProgressRequest.current = null;
      }
    }
  }, []);

  const deleteProject = useCallback(
    async (projectId: string, confirmation: string) => {
      let failure: unknown = null;
      projectDeletionInProgress.current = true;
      productionProgressRequest.current?.abort();
      setProductionProgressStatus(`正在删除 ${projectId}…`);
      try {
        const response = await fetch("/api/projects/delete", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ projectId, confirmation }),
        });
        const body = (await response.json()) as
          | { deletedProjectId: string }
          | { error: string };
        if (!response.ok || "error" in body) {
          throw new Error("error" in body ? body.error : "Project 删除失败");
        }
        setProductionProgressStatus(`${projectId} 已删除`);
      } catch (caught) {
        failure = caught;
        setProductionProgressStatus(projectDeletionErrorMessage(caught));
      } finally {
        projectDeletionInProgress.current = false;
      }
      await refreshProductionProgress();
      if (failure !== null) {
        setProductionProgressStatus(projectDeletionErrorMessage(failure));
        throw failure;
      }
    },
    [refreshProductionProgress],
  );

  useEffect(() => {
    void refreshProductionProgress();
    const interval = window.setInterval(() => {
      void refreshProductionProgress();
    }, 3_000);
    return () => {
      window.clearInterval(interval);
      productionProgressRequest.current?.abort();
    };
  }, [refreshProductionProgress]);
  const validation = useMemo(
    () => [
      {
        label: "表单一致性",
        value: consistencyError ?? "默认 Provider、声线与 ID 一致。",
        state: consistencyError === null ? "pass" : "fail",
      },
      ...(diagnostics?.checks.map((check) => ({
        label: check.id,
        value:
          check.remediation === null
            ? check.summary
            : `${check.summary} ${check.remediation}`,
        state: check.status,
      })) ?? [
        {
          label: "宿主环境",
          value: diagnosticsStatus,
          state: "waiting",
        },
      ]),
    ],
    [consistencyError, diagnostics, diagnosticsStatus],
  );

  const update = (mutate: (draft: EditableConfig) => void) => {
    if (config === null) return;
    const draft = cloneConfig(config);
    mutate(draft);
    delete draft.configFingerprint;
    setConfig(draft);
    setStatus("有未保存修改");
  };

  const save = async () => {
    if (config === null || consistencyError !== null) {
      setStatus(consistencyError ?? "配置尚未加载。");
      return;
    }
    setIsSaving(true);
    setStatus("正在校验并保存…");
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(config),
      });
      const body = (await response.json()) as
        | EditableConfig
        | { error: string };
      if (!response.ok || "error" in body) {
        throw new Error("error" in body ? body.error : "配置保存失败");
      }
      setConfig(body);
      setSavedFingerprint(body.configFingerprint ?? null);
      setStatus("已校验并保存到 private/producer.config.json");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "配置保存失败");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand-mark">RSP</div>
        <div className="title-block">
          <span>REMOTION STORY PRODUCER</span>
          <h1>制作配置</h1>
        </div>
        <div className="frame-ruler" aria-label="30fps 帧标尺">
          {[0, 30, 60, 90].map((frame) => (
            <span key={frame}>{frame}</span>
          ))}
        </div>
        <div className={`save-state ${dirty ? "dirty" : ""}`}>
          <span />
          {status}
        </div>
        <button
          className="save-button"
          disabled={config === null || isSaving || consistencyError !== null}
          onClick={save}
        >
          {isSaving ? "保存中" : "保存配置"}
        </button>
      </header>

      <aside className="sidebar">
        <div className="sidebar-label">CONFIG / V1</div>
        <nav>
          {tabs.map((tab) => (
            <button
              className={activeTab === tab.id ? "active" : ""}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
            >
              <span>{tab.index}</span>
              {tab.label}
            </button>
          ))}
        </nav>
        <div className="studio-link">
          <span>PREVIEW</span>
          <a href={studioUrl} target="_blank" rel="noreferrer">
            打开 Remotion Studio ↗
          </a>
        </div>
      </aside>

      <main className="workspace">
        {activeTab === "progress" ? (
          <ProductionProgressPanel
            progress={productionProgress}
            status={productionProgressStatus}
            error={productionProgressError}
            refresh={refreshProductionProgress}
            deleteProject={deleteProject}
          />
        ) : config === null ? (
          <div className="empty-state">
            <strong>配置尚未就绪</strong>
            <p>{status}</p>
          </div>
        ) : (
          <>
            {activeTab === "general" ? (
              <General config={config} update={update} />
            ) : null}
            {activeTab === "safe-area" ? (
              <SafeArea config={config} update={update} />
            ) : null}
            {activeTab === "collections" ? (
              <Collections config={config} update={update} />
            ) : null}
            {activeTab === "tts" && provider !== undefined ? (
              <Tts config={config} provider={provider} update={update} />
            ) : null}
          </>
        )}
      </main>

      <aside className="validation-rail">
        <div className="rail-title">
          <span>ENVIRONMENT</span>
          <strong>只读环境诊断</strong>
          <button className="diagnostics-button" onClick={refreshDiagnostics}>
            重新诊断
          </button>
        </div>
        {validation.map((item) => (
          <div className="check-row" key={item.label}>
            <i className={item.state} />
            <div>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          </div>
        ))}
        <div className="security-note">
          <span>{lanAccess ? "TRUSTED LAN" : "LOCAL ONLY"}</span>
          <p>
            {lanAccess
              ? "当前通过局域网地址访问。token 会原样回传，仅应在可信网络使用。"
              : "服务只监听 127.0.0.1。token 会原样回传到此页面。"}
            token 不写日志，也不进入浏览器存储。
          </p>
        </div>
      </aside>
    </div>
  );
};

const ProductionProgressPanel = ({
  progress,
  status,
  error,
  refresh,
  deleteProject,
}: {
  readonly progress: ProductionProgress | null;
  readonly status: string;
  readonly error: string | null;
  readonly refresh: () => Promise<void>;
  readonly deleteProject: (
    projectId: string,
    confirmation: string,
  ) => Promise<void>;
}) => {
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );
  const projects = progress?.projects ?? [];
  const selectedProject =
    projects.find(({ projectId }) => projectId === selectedProjectId) ??
    projects[0] ??
    null;

  const confirmDelete = async (projectId: string) => {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteProject(projectId, deleteConfirmation);
      setPendingDeleteId(null);
      setDeleteConfirmation("");
    } catch (caught) {
      setDeleteError(projectDeletionErrorMessage(caught));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Section
      eyebrow="PROJECT RUNS"
      title="各 Project 最新视频流程"
      description="每个 Project 独立展示最近创建的一个 Production Run。数据来自已校验的 Run events、投影状态与交付启动回执，每 3 秒自动刷新。"
    >
      <div className="progress-toolbar">
        <div>
          <span>每 Project 单例</span>
          <strong>{error ?? status}</strong>
          <small>{projects.length} 个 Project</small>
        </div>
        <button
          className="secondary-button"
          disabled={isDeleting}
          onClick={() => void refresh()}
        >
          刷新进度
        </button>
      </div>
      {deleteError === null ? null : (
        <div className="project-delete-outcome" role="alert">
          <strong>Project 删除结果需确认</strong>
          <p>{deleteError}</p>
        </div>
      )}
      {projects.length === 0 ? (
        <div className="progress-empty">
          <strong>
            {error === null
              ? "还没有可展示的 Project"
              : "Project 生产进度暂不可用"}
          </strong>
          <p>
            {error === null
              ? "创建 Project 或执行 production:start 后，这里会自动出现。"
              : "页面不会用旧快照冒充当前状态，请检查本地 Project 数据。"}
          </p>
        </div>
      ) : (
        <div className="project-progress-layout">
          <nav className="project-list" aria-label="Project 列表">
            <div className="project-list-heading">
              <span>PROJECT LIST</span>
              <strong>{projects.length}</strong>
            </div>
            {projects.map((project) => (
              <button
                className={
                  selectedProject?.projectId === project.projectId
                    ? "active"
                    : ""
                }
                key={project.projectId}
                disabled={isDeleting}
                onClick={() => {
                  setSelectedProjectId(project.projectId);
                  setPendingDeleteId(null);
                  setDeleteConfirmation("");
                  setDeleteError(null);
                }}
              >
                <i className={project.status} />
                <span>
                  <strong>{project.projectId}</strong>
                  <small>
                    {project.run === null
                      ? project.status === "error"
                        ? "状态不可用"
                        : "尚无 Run"
                      : (progressStateLabels[project.run.state] ??
                        project.run.state)}
                  </small>
                </span>
              </button>
            ))}
          </nav>
          {selectedProject === null
            ? null
            : (() => {
                const project = selectedProject;
                const run = project.run;
                const percent =
                  run === null
                    ? 0
                    : Math.round((run.completedSteps / run.totalSteps) * 100);
                const confirming = pendingDeleteId === project.projectId;
                return (
                  <article
                    className="project-progress-card"
                    key={project.projectId}
                  >
                    <div className="project-progress-heading">
                      <div>
                        <span>PROJECT</span>
                        <h3>{project.projectId}</h3>
                        {run === null ? null : <code>{run.runId}</code>}
                      </div>
                      <button
                        className="danger-button"
                        disabled={isDeleting}
                        onClick={() => {
                          setPendingDeleteId(project.projectId);
                          setDeleteConfirmation("");
                          setDeleteError(null);
                        }}
                      >
                        删除 Project
                      </button>
                    </div>
                    {confirming ? (
                      <div className="project-delete-confirmation" role="alert">
                        <strong>
                          这会永久删除该 Project 的代码和全部本地产物。
                        </strong>
                        <p>
                          输入 <code>{project.projectId}</code> 确认。其他
                          Project、私有配置和受保护声线不会被删除。
                        </p>
                        <input
                          aria-label={`输入 ${project.projectId} 确认删除`}
                          autoComplete="off"
                          value={deleteConfirmation}
                          onChange={(event) =>
                            setDeleteConfirmation(event.target.value)
                          }
                        />
                        {deleteError === null ? null : (
                          <p className="delete-error">{deleteError}</p>
                        )}
                        <div>
                          <button
                            className="secondary-button"
                            disabled={isDeleting}
                            onClick={() => {
                              setPendingDeleteId(null);
                              setDeleteConfirmation("");
                              setDeleteError(null);
                            }}
                          >
                            取消
                          </button>
                          <button
                            className="danger-button solid"
                            disabled={
                              isDeleting ||
                              deleteConfirmation !== project.projectId
                            }
                            onClick={() =>
                              void confirmDelete(project.projectId)
                            }
                          >
                            {isDeleting ? "删除中…" : "永久删除"}
                          </button>
                        </div>
                      </div>
                    ) : null}
                    {run === null ? (
                      <div className="project-progress-empty">
                        <strong>
                          {project.status === "error"
                            ? "最新 Run 状态不可用"
                            : "尚无 current Production Run"}
                        </strong>
                        <p>
                          {project.error ??
                            "Project 已存在；执行 production:start 后会展示关键脚本进度。"}
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="progress-summary">
                          <div>
                            <span>当前状态</span>
                            <strong>
                              {progressStateLabels[run.state] ?? run.state}
                            </strong>
                          </div>
                          <div>
                            <span>关键步骤</span>
                            <strong>
                              {run.completedSteps} / {run.totalSteps}
                            </strong>
                          </div>
                          <div>
                            <span>最近更新</span>
                            <strong>{formatTimestamp(run.updatedAt)}</strong>
                          </div>
                        </div>
                        <div
                          className="progress-meter"
                          role="progressbar"
                          aria-label={`${project.projectId} 关键步骤已完成 ${percent}%`}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={percent}
                        >
                          <span style={{ width: `${percent}%` }} />
                        </div>
                        <div className="progress-steps">
                          {run.steps.map((step, index) => (
                            <article
                              className={`progress-step ${step.status}`}
                              key={step.id}
                            >
                              <div className="progress-step-index">
                                {String(index + 1).padStart(2, "0")}
                              </div>
                              <div className="progress-step-copy">
                                <div>
                                  <strong>{step.label}</strong>
                                  <span>
                                    {progressStatusLabels[step.status]}
                                  </span>
                                </div>
                                <p>{step.detail}</p>
                                <code>{step.command}</code>
                              </div>
                              <time dateTime={step.occurredAt ?? undefined}>
                                {formatTimestamp(step.occurredAt)}
                              </time>
                            </article>
                          ))}
                        </div>
                        <div className="progress-footnote">
                          “已启动”只表示 Remotion 进程收到 OS spawn 确认，不表示
                          MP4 已渲染完成。
                        </div>
                      </>
                    )}
                  </article>
                );
              })()}
        </div>
      )}
    </Section>
  );
};

type EditorProps = Readonly<{
  config: EditableConfig;
  update: (mutate: (draft: EditableConfig) => void) => void;
}>;

const General = ({ config, update }: EditorProps) => {
  const selectedSize = renderSizeValue(config.renderDefaults);
  const isCommonSize = COMMON_RENDER_SIZES.some(
    (size) => renderSizeValue(size) === selectedSize,
  );
  const bgm = config.audioDefaults?.globalBgm ?? null;
  return (
    <>
      <Section
        eyebrow="01 / OUTPUT"
        title="通用输出"
        description="这些值是新作品的默认渲染参数；作品创建后由 RenderSpec 冻结。"
      >
        <FieldRow>
          <Field label="画面尺寸" hint="宽 × 高，选择常用输出规格">
            <select
              value={selectedSize}
              onChange={(event) => {
                const size = parseRenderSize(event.target.value);
                update((draft) => {
                  draft.renderDefaults.width = size.width;
                  draft.renderDefaults.height = size.height;
                });
              }}
            >
              {isCommonSize ? null : (
                <option value={selectedSize}>
                  当前自定义 · {config.renderDefaults.width} ×{" "}
                  {config.renderDefaults.height}
                </option>
              )}
              {COMMON_RENDER_SIZES.map((size) => (
                <option
                  key={renderSizeValue(size)}
                  value={renderSizeValue(size)}
                >
                  {size.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="帧率">
            <input
              type="number"
              value={config.renderDefaults.fps}
              onChange={(event) =>
                update((draft) => {
                  draft.renderDefaults.fps = numberValue(event.target.value);
                })
              }
            />
          </Field>
          <Field label="语言">
            <input
              value={config.renderDefaults.locale}
              onChange={(event) =>
                update((draft) => {
                  draft.renderDefaults.locale = event.target.value;
                })
              }
            />
          </Field>
        </FieldRow>
        <div className="spec-strip">
          <span>输出规格</span>
          <strong>
            {config.renderDefaults.width} × {config.renderDefaults.height}
          </strong>
          <strong>{config.renderDefaults.fps} FPS</strong>
          <strong>{config.renderDefaults.locale}</strong>
        </div>
      </Section>
      <Section
        eyebrow="AUDIO / DEFAULT"
        title="全局 BGM"
        description="保存本地 BGM 默认值；文件位置以仓库根目录为起点，不接受绝对路径。"
      >
        <FieldRow>
          <Field
            label="BGM 文件"
            hint="例如 public/audio/default-bgm.mp3；留空表示不配置"
          >
            <input
              value={bgm?.sourcePath ?? ""}
              placeholder="public/audio/default-bgm.mp3"
              onChange={(event) =>
                update((draft) => {
                  const sourcePath = event.target.value;
                  draft.audioDefaults = {
                    globalBgm:
                      sourcePath === ""
                        ? null
                        : {
                            sourcePath,
                            volume:
                              draft.audioDefaults?.globalBgm?.volume ?? 0.15,
                          },
                  };
                })
              }
            />
          </Field>
          <Field label="BGM 音量" hint="线性音量，0 为静音，1 为原始音量">
            <input
              type="number"
              min="0"
              max="1"
              step="0.05"
              disabled={bgm === null}
              value={bgm?.volume ?? 0.15}
              onChange={(event) =>
                update((draft) => {
                  if (
                    draft.audioDefaults?.globalBgm === null ||
                    draft.audioDefaults === undefined
                  ) {
                    return;
                  }
                  draft.audioDefaults.globalBgm.volume = numberValue(
                    event.target.value,
                  );
                })
              }
            />
          </Field>
        </FieldRow>
      </Section>
    </>
  );
};

const SafeArea = ({ config, update }: EditorProps) => {
  const baseEdge = config.readability.edgeInsetPx;
  const scale = Math.max(
    1080,
    Math.min(config.renderDefaults.width, config.renderDefaults.height),
  );
  const scaled = (value: number) => Math.round((value * scale) / 1080);
  const edge = scaled(baseEdge);
  const captionBottom = edge * 2;
  const captionFontSize = scaled(40);
  const captionPadding = scaled(38);
  const captionGap = scaled(30);
  const captionBoxHeight =
    Math.ceil((2 * captionFontSize * 135) / 100) + captionPadding;
  const sceneBottom =
    Math.ceil((captionBottom + captionBoxHeight + captionGap) / 10) * 10;
  return (
    <Section
      eyebrow="02 / READABILITY"
      title="画面安全区"
      description="只配置一个基准边缘留白；字幕与 Scene 底边由固定算法自适应推导。"
    >
      <FieldRow>
        <Field
          label="基准边缘留白"
          hint="以 1080 短边为基准，其他分辨率按比例缩放"
        >
          <input
            type="number"
            value={baseEdge}
            onChange={(event) =>
              update((draft) => {
                draft.readability.edgeInsetPx = numberValue(event.target.value);
              })
            }
          />
        </Field>
      </FieldRow>
      <div className="formula-board">
        <div>
          <span>字幕底边</span>
          <strong>{captionBottom}px</strong>
          <code>{edge}px × 2</code>
        </div>
        <div>
          <span>字幕盒高度</span>
          <strong>{captionBoxHeight}px</strong>
          <code>2 行 × {captionFontSize}px + padding</code>
        </div>
        <div>
          <span>Scene 底边</span>
          <strong>{sceneBottom}px</strong>
          <code>向上取整到 10px</code>
        </div>
      </div>
    </Section>
  );
};

const Collections = ({ config, update }: EditorProps) => {
  const addCollection = () =>
    update((draft) => {
      draft.publishingCollections = [
        ...draft.publishingCollections,
        {
          id: nextUniqueId(
            "collection",
            draft.publishingCollections.map(({ id }) => id),
          ),
          name: "新合集",
          description: "说明这个合集最适合什么主题。",
        },
      ];
    });
  return (
    <Section
      eyebrow="03 / PUBLISHING"
      title="发布合集"
      description="Agent 必须根据描述，从此数组中选择且只选择一个最合适的合集。"
    >
      <div className="collection-list">
        {config.publishingCollections.map((collection, index) => (
          <div className="collection-row" key={`${collection.id}-${index}`}>
            <span className="row-index">
              {String(index + 1).padStart(2, "0")}
            </span>
            <Field label="ID">
              <input
                value={collection.id}
                onChange={(event) =>
                  update((draft) => {
                    draft.publishingCollections[index] = {
                      ...draft.publishingCollections[index]!,
                      id: event.target.value,
                    };
                  })
                }
              />
            </Field>
            <Field label="名称">
              <input
                value={collection.name}
                onChange={(event) =>
                  update((draft) => {
                    draft.publishingCollections[index] = {
                      ...draft.publishingCollections[index]!,
                      name: event.target.value,
                    };
                  })
                }
              />
            </Field>
            <Field label="适用描述">
              <textarea
                value={collection.description}
                onChange={(event) =>
                  update((draft) => {
                    draft.publishingCollections[index] = {
                      ...draft.publishingCollections[index]!,
                      description: event.target.value,
                    };
                  })
                }
              />
            </Field>
            <button
              className="icon-button"
              aria-label={`删除 ${collection.name}`}
              disabled={config.publishingCollections.length === 1}
              onClick={() =>
                update((draft) => {
                  draft.publishingCollections =
                    draft.publishingCollections.filter(
                      (_, itemIndex) => itemIndex !== index,
                    );
                })
              }
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <button className="secondary-button" onClick={addCollection}>
        ＋ 添加合集
      </button>
    </Section>
  );
};

const Tts = ({
  config,
  provider,
  update,
}: EditorProps & { readonly provider: VoxcpmProviderConfig }) => {
  const replaceProvider = (next: VoxcpmProviderConfig) =>
    update((draft) => {
      draft.tts.providers = draft.tts.providers.map((item) =>
        item.id === provider.id ? next : item,
      );
      if (
        draft.tts.defaultProviderId === next.id &&
        !next.voiceProfiles.some(
          ({ id }) => id === draft.tts.defaultVoiceProfileId,
        )
      ) {
        const first = next.voiceProfiles[0];
        if (first === undefined) {
          throw new Error("Provider 必须至少保留一个声线。");
        }
        draft.tts.defaultVoiceProfileId = first.id;
      }
    });
  const patchProvider = (patch: Partial<VoxcpmProviderConfig>) =>
    replaceProvider({ ...provider, ...patch });
  const addProfile = () =>
    patchProvider({
      voiceProfiles: [
        ...provider.voiceProfiles,
        {
          id: nextUniqueId(
            "voice",
            provider.voiceProfiles.map(({ id }) => id),
          ),
          name: "新声线",
          mode: "controllable-clone",
          referenceAudioPath: "voxcpm/voice_profile/reference.wav",
          controlInstruction: "自然、清晰。",
        },
      ],
    });
  return (
    <>
      <Section
        eyebrow="04 / SPEECH"
        title="TTS 默认策略"
        description="上层只认识 provider、声线、语速与目标响度；VoxCPM 是当前一个具体适配器。"
      >
        <FieldRow>
          <Field label="默认服务">
            <select
              value={config.tts.defaultProviderId}
              onChange={(event) =>
                update((draft) => {
                  selectProviderAndVoice(draft, event.target.value);
                })
              }
            >
              {config.tts.providers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="默认声线">
            <select
              value={config.tts.defaultVoiceProfileId}
              onChange={(event) =>
                update((draft) => {
                  draft.tts.defaultVoiceProfileId = event.target.value;
                })
              }
            >
              {provider.voiceProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="语速" hint="0.5–2.0，服务返回后统一处理">
            <input
              type="number"
              min="0.5"
              max="2"
              step="0.05"
              value={config.tts.speech.rate}
              onChange={(event) =>
                update((draft) => {
                  draft.tts.speech.rate = numberValue(event.target.value);
                })
              }
            />
          </Field>
          <Field label="音量 / 目标响度" hint="LUFS，默认 -16">
            <input
              type="number"
              min="-30"
              max="-8"
              step="0.5"
              value={config.tts.speech.targetLoudnessLufs}
              onChange={(event) =>
                update((draft) => {
                  draft.tts.speech.targetLoudnessLufs = numberValue(
                    event.target.value,
                  );
                })
              }
            />
          </Field>
        </FieldRow>
      </Section>
      <Section
        eyebrow="ADAPTER / VOXCPM"
        title={provider.name}
        description="连接与模型参数属于适配器；克隆方式决定接口路由，不会把 mode 字段发给服务。"
      >
        <FieldRow>
          <Field label="服务地址">
            <input
              value={provider.connection.baseUrl}
              onChange={(event) =>
                patchProvider({
                  connection: {
                    ...provider.connection,
                    baseUrl: event.target.value,
                  },
                })
              }
            />
          </Field>
          <Field label="Token" hint="完整显示、可直接修改">
            <input
              value={provider.connection.token ?? ""}
              onChange={(event) =>
                patchProvider({
                  connection: {
                    ...provider.connection,
                    ...(event.target.value === ""
                      ? { token: undefined }
                      : { token: event.target.value }),
                  },
                })
              }
            />
          </Field>
          <Field label="超时 / ms">
            <input
              type="number"
              value={provider.connection.timeoutMs}
              onChange={(event) =>
                patchProvider({
                  connection: {
                    ...provider.connection,
                    timeoutMs: numberValue(event.target.value),
                  },
                })
              }
            />
          </Field>
          <Field label="模型 ID">
            <input
              value={provider.modelId}
              onChange={(event) =>
                patchProvider({ modelId: event.target.value })
              }
            />
          </Field>
        </FieldRow>
        <div className="route-table">
          <div>
            <span>可控克隆</span>
            <code>POST {provider.routes.controllableClone}</code>
          </div>
          <div>
            <span>高品质克隆</span>
            <code>POST {provider.routes.highFidelityClone}</code>
          </div>
        </div>
        <details>
          <summary>生成参数</summary>
          <FieldRow>
            <Field label="CFG">
              <input
                type="number"
                step="0.1"
                value={provider.parameters.cfgValue}
                onChange={(event) =>
                  patchProvider({
                    parameters: {
                      ...provider.parameters,
                      cfgValue: numberValue(event.target.value),
                    },
                  })
                }
              />
            </Field>
            <Field label="推理步数">
              <input
                type="number"
                value={provider.parameters.inferenceTimesteps}
                onChange={(event) =>
                  patchProvider({
                    parameters: {
                      ...provider.parameters,
                      inferenceTimesteps: numberValue(event.target.value),
                    },
                  })
                }
              />
            </Field>
            <Field label="最短文本">
              <input
                type="number"
                value={provider.parameters.minLen}
                onChange={(event) =>
                  patchProvider({
                    parameters: {
                      ...provider.parameters,
                      minLen: numberValue(event.target.value),
                    },
                  })
                }
              />
            </Field>
            <Field label="最长文本">
              <input
                type="number"
                value={provider.parameters.maxLen}
                onChange={(event) =>
                  patchProvider({
                    parameters: {
                      ...provider.parameters,
                      maxLen: numberValue(event.target.value),
                    },
                  })
                }
              />
            </Field>
          </FieldRow>
          <FieldRow>
            <Field label="文本规范化">
              <select
                value={String(provider.parameters.normalize)}
                onChange={(event) =>
                  patchProvider({
                    parameters: {
                      ...provider.parameters,
                      normalize: event.target.value === "true",
                    },
                  })
                }
              >
                <option value="true">开启</option>
                <option value="false">关闭</option>
              </select>
            </Field>
            <Field label="参考音频降噪">
              <select
                value={String(provider.parameters.denoise)}
                onChange={(event) =>
                  patchProvider({
                    parameters: {
                      ...provider.parameters,
                      denoise: event.target.value === "true",
                    },
                  })
                }
              >
                <option value="true">开启</option>
                <option value="false">关闭</option>
              </select>
            </Field>
            <Field label="坏例重试">
              <select
                value={String(provider.parameters.retryBadcase)}
                onChange={(event) =>
                  patchProvider({
                    parameters: {
                      ...provider.parameters,
                      retryBadcase: event.target.value === "true",
                    },
                  })
                }
              >
                <option value="true">开启</option>
                <option value="false">关闭</option>
              </select>
            </Field>
            <Field label="坏例最多重试次数">
              <input
                type="number"
                value={provider.parameters.retryBadcaseMaxTimes}
                onChange={(event) =>
                  patchProvider({
                    parameters: {
                      ...provider.parameters,
                      retryBadcaseMaxTimes: numberValue(event.target.value),
                    },
                  })
                }
              />
            </Field>
          </FieldRow>
          <FieldRow>
            <Field label="坏例比率阈值">
              <input
                type="number"
                step="0.1"
                value={provider.parameters.retryBadcaseRatioThreshold}
                onChange={(event) =>
                  patchProvider({
                    parameters: {
                      ...provider.parameters,
                      retryBadcaseRatioThreshold: numberValue(
                        event.target.value,
                      ),
                    },
                  })
                }
              />
            </Field>
          </FieldRow>
        </details>
      </Section>
      <Section
        eyebrow="VOICE PROFILES"
        title="声线配置"
        description="两种克隆共享服务适配器，但使用不同接口和不同必填输入。"
      >
        <div className="profile-list">
          {provider.voiceProfiles.map((profile, index) => (
            <div className="profile-row" key={`${profile.id}-${index}`}>
              <span className="row-index">
                {String(index + 1).padStart(2, "0")}
              </span>
              <Field label="声线 ID">
                <input
                  value={profile.id}
                  onChange={(event) =>
                    replaceProvider({
                      ...provider,
                      voiceProfiles: provider.voiceProfiles.map(
                        (item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, id: event.target.value }
                            : item,
                      ),
                    })
                  }
                />
              </Field>
              <Field label="显示名称">
                <input
                  value={profile.name}
                  onChange={(event) =>
                    replaceProvider({
                      ...provider,
                      voiceProfiles: provider.voiceProfiles.map(
                        (item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, name: event.target.value }
                            : item,
                      ),
                    })
                  }
                />
              </Field>
              <Field label="克隆方式">
                <select
                  value={profile.mode}
                  onChange={(event) =>
                    replaceProvider({
                      ...provider,
                      voiceProfiles: provider.voiceProfiles.map(
                        (item, itemIndex) =>
                          itemIndex !== index
                            ? item
                            : event.target.value === "high-fidelity-clone"
                              ? {
                                  id: item.id,
                                  name: item.name,
                                  mode: "high-fidelity-clone",
                                  promptAudioPath:
                                    "voxcpm/voice_profile/prompt.wav",
                                  promptTextPath:
                                    "voxcpm/voice_profile/prompt.txt",
                                  promptTranscriptConfirmed: true,
                                }
                              : {
                                  id: item.id,
                                  name: item.name,
                                  mode: "controllable-clone",
                                  referenceAudioPath:
                                    "voxcpm/voice_profile/reference.wav",
                                  controlInstruction: "自然、清晰。",
                                },
                      ),
                    })
                  }
                >
                  <option value="controllable-clone">可控克隆</option>
                  <option value="high-fidelity-clone">高品质克隆</option>
                </select>
              </Field>
              <Field
                label={
                  profile.mode === "controllable-clone"
                    ? "参考音频"
                    : "Prompt 音频"
                }
                hint="仓库根目录相对路径"
              >
                <input
                  value={
                    profile.mode === "controllable-clone"
                      ? profile.referenceAudioPath
                      : profile.promptAudioPath
                  }
                  onChange={(event) =>
                    replaceProvider({
                      ...provider,
                      voiceProfiles: provider.voiceProfiles.map(
                        (item, itemIndex) =>
                          itemIndex !== index
                            ? item
                            : item.mode === "controllable-clone"
                              ? {
                                  ...item,
                                  referenceAudioPath: event.target.value,
                                }
                              : {
                                  ...item,
                                  promptAudioPath: event.target.value,
                                },
                      ),
                    })
                  }
                />
              </Field>
              <button
                className="icon-button"
                aria-label={`删除 ${profile.name}`}
                disabled={provider.voiceProfiles.length === 1}
                onClick={() =>
                  update((draft) => {
                    removeVoiceProfile(draft, provider.id, profile.id);
                  })
                }
              >
                ×
              </button>
              {profile.mode === "controllable-clone" ? (
                <Field label="控制提示">
                  <textarea
                    value={profile.controlInstruction}
                    onChange={(event) =>
                      replaceProvider({
                        ...provider,
                        voiceProfiles: provider.voiceProfiles.map(
                          (item, itemIndex) =>
                            itemIndex === index &&
                            item.mode === "controllable-clone"
                              ? {
                                  ...item,
                                  controlInstruction: event.target.value,
                                }
                              : item,
                        ),
                      })
                    }
                  />
                </Field>
              ) : (
                <Field label="Prompt 文本文件" hint="仓库根目录相对路径">
                  <input
                    value={profile.promptTextPath}
                    onChange={(event) =>
                      replaceProvider({
                        ...provider,
                        voiceProfiles: provider.voiceProfiles.map(
                          (item, itemIndex) =>
                            itemIndex === index &&
                            item.mode === "high-fidelity-clone"
                              ? { ...item, promptTextPath: event.target.value }
                              : item,
                        ),
                      })
                    }
                  />
                </Field>
              )}
            </div>
          ))}
        </div>
        <button className="secondary-button" onClick={addProfile}>
          ＋ 添加声线
        </button>
      </Section>
    </>
  );
};

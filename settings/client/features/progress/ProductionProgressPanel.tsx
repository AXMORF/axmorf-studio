import { useState } from "react";

import type {
  ProductionProgressResponse,
  ProductionProgressStepStatus,
} from "../../../contracts/api";
import { Section } from "../../components/Form";
import { projectDeletionErrorMessage } from "../../model";

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

export const ProductionProgressPanel = ({
  progress,
  status,
  error,
  refresh,
  deleteProject,
}: {
  readonly progress: ProductionProgressResponse | null;
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

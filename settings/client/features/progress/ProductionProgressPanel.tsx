import { useState } from "react";

import type {
  ProductionProgressResponse,
  ProductionProgressStepStatus,
  ProjectBuildStatus,
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

const buildStatusLabels: Record<ProjectBuildStatus, string> = {
  "not-built": "尚未构建",
  building: "正在构建",
  current: "交付完成",
  stale: "待重新构建",
  failed: "构建失败",
  error: "交付状态异常",
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
      eyebrow="PROJECT BUILDS"
      title="各 Project 当前交付"
      description="默认展示固定 project:build 的六个阶段与四文件交付；可选 audited production 独立折叠，每 3 秒自动刷新。"
    >
      <div className="progress-toolbar">
        <div>
          <span>CURRENT DELIVERY</span>
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
              : "Project 交付状态暂不可用"}
          </strong>
          <p>
            {error === null
              ? "创建 Project 后，这里会展示固定构建与当前交付状态。"
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
                  <small>{buildStatusLabels[project.status]}</small>
                </span>
              </button>
            ))}
          </nav>
          {selectedProject === null
            ? null
            : (() => {
                const project = selectedProject;
                const build = project.build;
                const run = project.auditedRun;
                const percent = Math.round(
                  (build.completedSteps / build.totalSteps) * 100,
                );
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
                        {build.buildId === null ? null : (
                          <code>{build.buildId}</code>
                        )}
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

                    <div className={`build-state-banner ${project.status}`}>
                      <span>DEFAULT BUILD</span>
                      <strong>{buildStatusLabels[project.status]}</strong>
                      <p>{project.error ?? build.detail}</p>
                      <code>
                        npm run project:build -- --project {project.projectId}
                      </code>
                    </div>

                    <div className="progress-summary">
                      <div>
                        <span>当前状态</span>
                        <strong>{buildStatusLabels[project.status]}</strong>
                      </div>
                      <div>
                        <span>构建阶段</span>
                        <strong>
                          {build.completedSteps} / {build.totalSteps}
                        </strong>
                      </div>
                      <div>
                        <span>最近更新</span>
                        <strong>{formatTimestamp(build.updatedAt)}</strong>
                      </div>
                    </div>
                    <div
                      className="progress-meter"
                      role="progressbar"
                      aria-label={`${project.projectId} 构建阶段已完成 ${percent}%`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={percent}
                    >
                      <span style={{ width: `${percent}%` }} />
                    </div>
                    <div className="progress-steps">
                      {build.steps.map((step, index) => (
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
                              <span>{progressStatusLabels[step.status]}</span>
                              {step.reused === true ? <em>REUSED</em> : null}
                            </div>
                            <p>{step.detail}</p>
                          </div>
                          <time dateTime={step.occurredAt ?? undefined}>
                            {formatTimestamp(step.occurredAt)}
                          </time>
                        </article>
                      ))}
                    </div>

                    {build.delivery === null ? null : (
                      <div className="delivery-stamp">
                        <div>
                          <span>VERIFIED DELIVERY</span>
                          <strong>
                            {build.delivery.sourceCurrent
                              ? "对应当前源码"
                              : "保留的上一版交付"}
                          </strong>
                        </div>
                        <div className="delivery-files" aria-label="四文件完整">
                          <span>VIDEO</span>
                          <span>COVER 4:3</span>
                          <span>COVER 3:4</span>
                          <span>PUBLISH</span>
                        </div>
                        <small>{build.delivery.frameCount} frames</small>
                      </div>
                    )}

                    <div className={`progress-footnote ${project.status}`}>
                      {project.status === "stale"
                        ? "上一版四文件交付保持有效；重新执行固定命令后才会与当前源码对齐。"
                        : project.status === "failed"
                          ? "上一版交付未被替换；重新运行同一命令会复用同 buildId 的已验证 staging。"
                          : project.status === "building"
                            ? "页面只读观察前台构建；若终端已退出而状态未更新，请按中断构建诊断。"
                            : project.status === "current"
                              ? "成功以当前源码对应的 video、两个 Cover 与 publish.json 全部验证并提升为准。"
                              : project.status === "error"
                                ? "交付合同、文件类型、大小或 checksum 未通过，页面不会显示成功。"
                                : "执行固定 project:build 命令后，这里会显示完整阶段。"}
                    </div>

                    <details className="audited-progress">
                      <summary>
                        <span>AUDITED PRODUCTION · 可选</span>
                        <strong>
                          {project.auditedRunError ??
                            (run === null
                              ? "未启动，不影响普通构建"
                              : (progressStateLabels[run.state] ?? run.state))}
                        </strong>
                      </summary>
                      {project.auditedRunError !== null ? (
                        <p className="audited-empty">
                          {project.auditedRunError}
                        </p>
                      ) : run === null ? (
                        <p className="audited-empty">
                          仅在缺少内容或需要严格过程证据时使用 audited
                          production。
                        </p>
                      ) : (
                        <div className="audited-body">
                          <code>{run.runId}</code>
                          <div className="progress-steps compact">
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
                            “已启动”只表示 Remotion 收到 OS spawn 确认，不表示
                            MP4 已渲染完成。
                          </div>
                        </div>
                      )}
                    </details>
                  </article>
                );
              })()}
        </div>
      )}
    </Section>
  );
};

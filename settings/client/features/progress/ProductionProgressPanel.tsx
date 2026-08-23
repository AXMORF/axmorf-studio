import { useState } from "react";

import type {
  ProductionProgressResponse,
  ProjectProductionStatus,
} from "../../../contracts/api";
import { Section } from "../../components/Form";
import { projectDeletionErrorMessage } from "../../model";

const labels: Record<ProjectProductionStatus, string> = {
  "not-produced": "尚未生产",
  "needs-agent": "等待 Agent 任务",
  converging: "正在收敛",
  "source-current": "Source 已就绪",
  current: "交付完成",
  stale: "Revision 已变化",
  failed: "本次 attempt 失败",
  error: "本地状态异常",
};

const taskLabel = ({
  taskKind,
  subjectId,
}: {
  readonly taskKind: string;
  readonly subjectId: string;
}) => `${taskKind} · ${subjectId}`;

const taskActionLabels = {
  reuse: "复用",
  "dispatch-agent": "派发 Agent",
  "prepare-fixed": "固定准备",
  blocked: "阻塞",
  converge: "收敛",
} as const;

const sourceStateLabels = {
  "configured-authoring": "待准备旁白",
  "timing-ready": "待补 authoring",
  "production-inputs-ready": "生产输入已就绪",
} as const;

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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const projects = progress?.projects ?? [];
  const selected =
    projects.find(({ projectId }) => projectId === selectedId) ??
    projects[0] ??
    null;
  const taskExplanations =
    selected?.inspection?.tasks ?? selected?.attempt?.taskExplanations ?? [];
  const confirmDelete = async () => {
    if (selected === null) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteProject(selected.projectId, confirmation);
      setPendingDelete(false);
      setConfirmation("");
    } catch (caught) {
      setDeleteError(projectDeletionErrorMessage(caught));
    } finally {
      setDeleting(false);
    }
  };
  return (
    <Section
      eyebrow="PROJECT PRODUCTION"
      title="Revision / Task / Delivery"
      description="展示 current Revision、Artifact 复用、当前 attempt 诊断与同步四文件交付。"
    >
      <div className="progress-toolbar">
        <div>
          <span>CONTENT-ADDRESSED PRODUCTION</span>
          <strong>{error ?? status}</strong>
          <small>{projects.length} 个 Project</small>
        </div>
        <button
          className="secondary-button"
          disabled={deleting}
          onClick={() => void refresh()}
        >
          刷新进度
        </button>
      </div>
      {projects.length === 0 ? (
        <div className="progress-empty">
          <strong>
            {error === null ? "还没有可展示的 Project" : "Project 状态暂不可用"}
          </strong>
        </div>
      ) : (
        <div className="project-progress-layout">
          <nav className="project-list" aria-label="Project 列表">
            {projects.map((project) => (
              <button
                className={
                  selected?.projectId === project.projectId ? "active" : ""
                }
                key={project.projectId}
                onClick={() => {
                  setSelectedId(project.projectId);
                  setPendingDelete(false);
                }}
              >
                <i className={project.status} />
                <span>
                  <strong>{project.projectId}</strong>
                  <small>{labels[project.status]}</small>
                </span>
              </button>
            ))}
          </nav>
          {selected === null ? null : (
            <article className="project-progress-card">
              <div className="project-progress-heading">
                <div>
                  <span>REVISION</span>
                  <h3>{selected.projectId}</h3>
                  <code>{selected.revisionId ?? "尚无 Revision"}</code>
                </div>
                <button
                  className="danger-button"
                  onClick={() => setPendingDelete(true)}
                >
                  删除 Project
                </button>
              </div>
              {pendingDelete ? (
                <div className="project-delete-confirmation" role="alert">
                  <strong>这会删除该 Project 的全部本地生产数据。</strong>
                  <p>
                    输入 <code>{selected.projectId}</code> 确认；其他
                    Project、私有配置和 voice profile 不受影响。
                  </p>
                  <input
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    aria-label={`输入 ${selected.projectId} 确认删除`}
                  />
                  {deleteError === null ? null : (
                    <p className="delete-error">{deleteError}</p>
                  )}
                  <div>
                    <button
                      className="secondary-button"
                      onClick={() => setPendingDelete(false)}
                    >
                      取消
                    </button>
                    <button
                      className="danger-button solid"
                      disabled={deleting || confirmation !== selected.projectId}
                      onClick={() => void confirmDelete()}
                    >
                      {deleting ? "删除中…" : "永久删除"}
                    </button>
                  </div>
                </div>
              ) : null}
              <div className={`build-state-banner ${selected.status}`}>
                <span>PRODUCTION STATUS</span>
                <strong>{labels[selected.status]}</strong>
                <p>
                  {selected.error ??
                    "ArtifactAttestation 是创作产物 authority；attempt 仅用于诊断。"}
                </p>
                <code>
                  npm run project:produce:inspect -- --project{" "}
                  {selected.projectId}
                </code>
                <code>
                  npm run project:produce:prepare -- --project{" "}
                  {selected.projectId}
                </code>
              </div>
              <div className="progress-summary">
                <div>
                  <span>复用任务</span>
                  <strong>{selected.tasks.reusedTaskCount}</strong>
                </div>
                <div>
                  <span>Dirty Agent</span>
                  <strong>{selected.tasks.dirtyAgentTaskCount}</strong>
                </div>
                <div>
                  <span>Dirty Fixed</span>
                  <strong>{selected.tasks.dirtyFixedTaskCount}</strong>
                </div>
                <div>
                  <span>Blocked</span>
                  <strong>{selected.tasks.blockedTaskCount}</strong>
                </div>
              </div>
              {selected.inspection === null ? null : (
                <div className="progress-footnote">
                  <strong>只读生产检查</strong>
                  <p>
                    {sourceStateLabels[selected.inspection.sourceState]}
                    {" · 下一步 "}
                    <code>{selected.inspection.nextAction}</code>
                  </p>
                  <p>
                    预计成本 · Provider requests{" "}
                    {selected.inspection.estimatedCost.providerRequests ??
                      "未知"}
                    {" · "}cache hits{" "}
                    {selected.inspection.estimatedCost.providerCacheHits}
                    {" · "}Agent tasks{" "}
                    {selected.inspection.estimatedCost.agentTasks ?? "未知"}
                    {" · "}delivery{" "}
                    {selected.inspection.estimatedCost.deliveryMedia?.join(
                      "、",
                    ) ?? "未知"}
                  </p>
                </div>
              )}
              {selected.attempt === null ? null : (
                <div className="progress-footnote">
                  <strong>Attempt diagnostic</strong>
                  <p>
                    {selected.attempt.state} · {selected.attempt.attemptId}
                  </p>
                  <p>
                    task committed{" "}
                    {selected.attempt.taskOutcomes.committedTaskCount}
                    {" · "}current{" "}
                    {selected.attempt.taskOutcomes.currentTaskCount}
                    {" · "}failed{" "}
                    {selected.attempt.taskOutcomes.failedTaskCount}
                    {" · "}terminal {selected.attempt.terminalResult}
                  </p>
                  <p>
                    预计成本 · Provider requests{" "}
                    {selected.attempt.estimatedCost.providerRequests ?? "未知"}
                    {" · "}cache hits{" "}
                    {selected.attempt.estimatedCost.providerCacheHits}
                    {" · "}Agent tasks{" "}
                    {selected.attempt.estimatedCost.agentTasks ?? "未知"}
                    {" · "}delivery{" "}
                    {selected.attempt.estimatedCost.deliveryMedia?.join("、") ??
                      "未知"}
                  </p>
                  <p>
                    实际成本 · Provider requests{" "}
                    {selected.attempt.actualCost.providerRequests}
                    {" · "}cache hits {selected.attempt.actualCost.providerCacheHits}
                    {" · "}Agent tasks {selected.attempt.actualCost.agentTasks}
                    {" · "}delivery{" "}
                    {selected.attempt.actualCost.deliveryMedia.length === 0
                      ? "无"
                      : selected.attempt.actualCost.deliveryMedia.join("、")}
                  </p>
                  {selected.attempt.diagnosticCode === null ? null : (
                    <p>{selected.attempt.diagnosticCode}</p>
                  )}
                </div>
              )}
              {taskExplanations.map((task) => (
                <div
                  className="progress-footnote"
                  key={`${task.taskKind}:${task.subject.kind}:${task.subject.id}`}
                >
                  <strong>
                    {taskLabel({
                      taskKind: task.taskKind,
                      subjectId: task.subject.id,
                    })}
                  </strong>
                  <p>
                    决策：{taskActionLabels[task.action]} · Artifact{" "}
                    {task.artifactState}
                  </p>
                  <p>
                    直接变化：
                    {task.directChanges.length === 0
                      ? "无"
                      : task.directChanges.map(({ id }) => id).join("、")}
                  </p>
                  <p>
                    被阻塞：
                    {task.blockedBy.length === 0
                      ? "无"
                      : task.blockedBy
                          .map(({ taskKind, subjectId }) =>
                            taskLabel({ taskKind, subjectId }),
                          )
                          .join("、")}
                  </p>
                </div>
              ))}
              {selected.delivery === null ? null : (
                <div className="delivery-stamp">
                  <div>
                    <span>VERIFIED DELIVERY</span>
                    <strong>
                      {selected.delivery.current
                        ? "对应 current Revision"
                        : "保留的上一版交付"}
                    </strong>
                  </div>
                  <div className="delivery-files" aria-label="四文件完整">
                    <span>VIDEO</span>
                    <span>COVER 4:3</span>
                    <span>COVER 3:4</span>
                    <span>PUBLISH</span>
                  </div>
                  <small>{selected.delivery.frameCount} frames</small>
                </div>
              )}
            </article>
          )}
        </div>
      )}
    </Section>
  );
};

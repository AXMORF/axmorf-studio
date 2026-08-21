import type { ExecutionPreferences } from "../../../contracts/api";
import { Field, FieldRow, Section } from "../../components/Form";

export const ExecutionSettings = ({
  config,
  update,
}: Readonly<{
  config: ExecutionPreferences;
  update: (next: ExecutionPreferences) => void;
}>) => {
  const execution = config.creativeTaskExecution;
  return (
    <Section
      eyebrow="AGENT / EXECUTION"
      title="Agent 任务执行"
      description="控制本机默认采用 Root 串行执行，还是受限并发派发子 Agent。用户在当前对话中的明确要求按字段覆盖这里的默认值，但不会自动回写配置。"
    >
      <FieldRow>
        <Field label="执行模式" hint="Root 串行不创建子 Agent；受限并发使用独立 task workspace">
          <select
            value={execution.mode}
            onChange={(event) => {
              update({
                ...config,
                creativeTaskExecution:
                  event.target.value === "inline"
                    ? { mode: "inline" }
                    : { mode: "subagents", maxConcurrency: 4 },
              });
            }}
          >
            <option value="inline">Root 串行执行</option>
            <option value="subagents">受限并发子 Agent</option>
          </select>
        </Field>
        <Field
          label="最大并发子 Agent"
          hint="仓库安全上限为 4；实际值还会受当前运行时容量限制"
        >
          <input
            aria-label="最大并发子 Agent"
            type="number"
            min="1"
            max="4"
            step="1"
            disabled={execution.mode === "inline"}
            value={execution.mode === "subagents" ? execution.maxConcurrency : 1}
            onChange={(event) => {
              if (execution.mode !== "subagents") return;
              update({
                ...config,
                creativeTaskExecution: {
                  mode: "subagents",
                  maxConcurrency: Number(event.target.value),
                },
              });
            }}
          />
        </Field>
      </FieldRow>
      <div className="spec-strip">
        <span>当前默认</span>
        <strong>
          {execution.mode === "inline" ? "ROOT · SEQUENTIAL" : "SUBAGENTS · BOUNDED"}
        </strong>
        <strong>
          {execution.mode === "inline" ? "0 CHILD" : `MAX ${execution.maxConcurrency}`}
        </strong>
        <strong>TASK TERMINAL DEADLINE · 1H</strong>
      </div>
      <p className="execution-precedence-note">
        生效顺序：当前用户提示词 → 本页保存值 → 内置默认值。若用户要求的精确并发超过运行时或仓库上限，生产会明确阻塞，不会静默降级为 Root 执行。
      </p>
    </Section>
  );
};

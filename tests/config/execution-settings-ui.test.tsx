import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { ExecutionSettings } from "../../settings/client/features/config/ExecutionSettings";

test("execution settings explain precedence, bounded capacity, and attempt deadline", () => {
  const markup = renderToStaticMarkup(
    <ExecutionSettings
      config={{
        schemaVersion: 1,
        contractVersion: "execution-preferences-v1",
        creativeTaskExecution: { mode: "subagents", maxConcurrency: 3 },
      }}
      update={() => undefined}
    />,
  );

  assert.match(markup, /Root 串行执行/u);
  assert.match(markup, /受限并发子 Agent/u);
  assert.match(markup, /max="4"/u);
  assert.match(markup, /当前用户提示词 → 本页保存值 → 内置 inline/u);
  assert.match(markup, /transport 由当前 Agent 宿主按本次生产声明/u);
  assert.match(markup, /App 不提供 transport 配置项/u);
  assert.match(markup, /TASK TERMINAL DEADLINE · 1H/u);
});

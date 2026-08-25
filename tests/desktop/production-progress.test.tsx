import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { DesktopProductionProgressSchema } from "../../desktop/contracts/production-progress";
import {
  ProductionProgressSummary,
  productionTaskPercent,
} from "../../desktop/renderer/App";

const completed = DesktopProductionProgressSchema.parse({
  storyId: "story-example",
  attemptId: "881cec29-5440-4b2f-b0fe-e967a8dbfc64",
  revisionId: `revision-${"1".repeat(64)}`,
  state: "succeeded",
  updatedAt: "2026-08-26T12:00:00.000Z",
  dirtyAgentTaskCount: 5,
  reusedTaskCount: 0,
  committedTaskCount: 5,
  currentTaskCount: 0,
  failedTaskCount: 0,
  terminalResult: "delivery-current",
  deliveryBuildId: `delivery-${"2".repeat(64)}`,
  diagnosticCode: null,
  deliveryFilesComplete: true,
});

test("Desktop production summary exposes exact successful attempt and Delivery", () => {
  assert.equal(productionTaskPercent(completed), 100);
  const html = renderToStaticMarkup(
    <ProductionProgressSummary progress={completed} />,
  );
  assert.match(html, /制作完成/u);
  assert.match(html, /5\/5 · failed 0/u);
  assert.match(html, /delivery-current/u);
  assert.match(html, /Diagnostic<\/dt><dd>null/u);
  assert.match(html, new RegExp(`delivery-${"2".repeat(64)}`, "u"));
  assert.match(html, /video · cover 4:3 · cover 3:4 · publish/u);
});

test("Desktop production progress rejects incomplete delivery-current claims", () => {
  assert.throws(() =>
    DesktopProductionProgressSchema.parse({
      ...completed,
      deliveryFilesComplete: false,
    }),
  );
});

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  ProducerTaskSpecSchema,
  StoryIdSchema,
  TaskExecutionContractSchema,
  serializeCanonicalJson,
} from "../../src/contracts";
import { validProjectCreateInput } from "../../tests/fixtures/project-create";

export const DESKTOP_NATIVE_STORY_ID = "desktop-native-fixture" as const;

const json = (value: unknown) => `${serializeCanonicalJson(value)}\n`;

const write = async (path: string, value: string) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, value, { flag: "wx" });
};

export const createDesktopNativeProjectInput = () => {
  const { sceneTemplates: _fixtureTemplates, ...baseInput } =
    validProjectCreateInput;
  void _fixtureTemplates;
  return {
    ...baseInput,
    storyId: DESKTOP_NATIVE_STORY_ID,
    brief: {
      ...validProjectCreateInput.brief,
      storyId: DESKTOP_NATIVE_STORY_ID,
      title: "AXMORF native production proof",
      targetDurationSeconds: 4,
    },
    story: {
      schemaVersion: 3,
      storyId: DESKTOP_NATIVE_STORY_ID,
      title: "AXMORF native production proof",
      beats: [
        {
          kind: "narrated-scene",
          meaningId: "opening",
          narrativePurpose: "Prove the first native production Scene.",
          ttsChunks: [
            { chunkId: "opening-01", ttsText: "Native production starts." },
          ],
          explicitPauses: [{ afterChunkId: "opening-01", pauseMs: 500 }],
        },
        {
          kind: "narrated-scene",
          meaningId: "closing",
          narrativePurpose: "Prove the current Delivery boundary.",
          ttsChunks: [
            { chunkId: "closing-01", ttsText: "Native delivery is current." },
          ],
          explicitPauses: [],
        },
      ],
    },
    scenes: [
      {
        ...validProjectCreateInput.scenes[0],
        meaningId: "opening",
        visualIntent: "Show a restrained native production state.",
      },
      {
        ...validProjectCreateInput.scenes[0],
        meaningId: "closing",
        visualIntent: "Show a distinct current Delivery state.",
        continuityBrief: "Cut cleanly from the opening proof.",
      },
    ],
    render: {
      ...validProjectCreateInput.render,
      compositionId: "DesktopNativeFixture",
      leadInFrames: 15,
      tailFrames: 15,
    },
    publishing: {
      ...validProjectCreateInput.publishing,
      description:
        "A real four-file Delivery produced by the packaged native gate.",
      chapters: [
        { meaningId: "opening", name: "开场" },
        { meaningId: "closing", name: "交付" },
      ],
    },
  };
};

const outputBytes = ({
  format,
  example,
  sceneMeaningId,
}: {
  readonly format: "json" | "tsx" | "ts";
  readonly example: unknown;
  readonly sceneMeaningId?: string;
}) => {
  if (format === "json") return json(example);
  if (typeof example !== "string") {
    throw new Error("desktop-native-fixture-source-example-required");
  }
  const source =
    sceneMeaningId === undefined
      ? example
      : example.replace(
          "<div style=",
          `<div aria-label="${sceneMeaningId}" style=`,
        );
  return source.endsWith("\n") ? source : `${source}\n`;
};

type DirtyTask = Readonly<{
  taskRevision: string;
  taskKind: string;
}>;

const parsePreparation = (raw: unknown) => {
  const value = raw as {
    status?: unknown;
    storyId?: unknown;
    dirtyAgentTasks?: readonly DirtyTask[];
  };
  if (value.status !== "project-production-prepared") {
    throw new Error("desktop-native-fixture-preparation-required");
  }
  const storyId = StoryIdSchema.parse(value.storyId);
  if (!Array.isArray(value.dirtyAgentTasks)) {
    throw new Error("desktop-native-fixture-dirty-tasks-required");
  }
  return { storyId, dirtyAgentTasks: value.dirtyAgentTasks } as const;
};

export const executeDesktopNativeAgentTasks = async ({
  workspaceRoot,
  preparation,
}: {
  readonly workspaceRoot: string;
  readonly preparation: unknown;
}) => {
  if (!isAbsolute(workspaceRoot)) {
    throw new Error("desktop-native-fixture-workspace-absolute-required");
  }
  const prepared = parsePreparation(preparation);
  const completed: string[] = [];
  for (const dirty of prepared.dirtyAgentTasks) {
    const taskRoot = join(
      workspaceRoot,
      ".rsp/work",
      prepared.storyId,
      dirty.taskRevision,
    );
    const task = ProducerTaskSpecSchema.parse(
      JSON.parse(await readFile(join(taskRoot, "task.json"), "utf8")),
    );
    if (
      task.taskRevision !== dirty.taskRevision ||
      task.storyId !== prepared.storyId ||
      task.taskKind !== dirty.taskKind
    ) {
      throw new Error("desktop-native-fixture-task-cross-bound");
    }
    const contract = TaskExecutionContractSchema.parse(
      JSON.parse(
        await readFile(join(taskRoot, "inputs/task-contract.json"), "utf8"),
      ),
    );
    if (contract.taskKind !== task.taskKind) {
      throw new Error("desktop-native-fixture-task-contract-cross-bound");
    }
    const actual = contract.outputs.map(({ path }) => path).sort();
    const declared = [...task.declaredOutputSet].sort();
    if (json(actual) !== json(declared)) {
      throw new Error("desktop-native-fixture-output-authority-mismatch");
    }
    for (const output of contract.outputs) {
      if (output.owner === "rsp-finalize") continue;
      if (output.example === undefined) {
        throw new Error("desktop-native-fixture-output-example-required");
      }
      await write(
        join(taskRoot, output.path),
        outputBytes({
          format: output.format,
          example: output.example,
          sceneMeaningId:
            task.taskKind === "scene-owner" &&
            output.path === "src/Renderer.tsx" &&
            task.semanticId !== null
              ? task.semanticId
              : undefined,
        }),
      );
    }
    completed.push(task.taskRevision);
  }
  return {
    storyId: prepared.storyId,
    completedTaskRevisions: completed.sort(),
  } as const;
};

const readStdinJson = async () => {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
};

const main = async () => {
  const [command, ...args] = process.argv.slice(2);
  if (command === undefined || command === "create-input") {
    process.stdout.write(json(createDesktopNativeProjectInput()));
    return;
  }
  if (command === "execute-agent-tasks") {
    const workspaceIndex = args.indexOf("--workspace");
    const workspaceRoot = args[workspaceIndex + 1];
    if (workspaceIndex === -1 || workspaceRoot === undefined) {
      throw new Error("desktop-native-fixture-workspace-required");
    }
    process.stdout.write(
      json(
        await executeDesktopNativeAgentTasks({
          workspaceRoot,
          preparation: await readStdinJson(),
        }),
      ),
    );
    return;
  }
  throw new Error("desktop-native-fixture-command-invalid");
};

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  void main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "desktop-native-fixture-failed"}\n`,
    );
    process.exitCode = 1;
  });
}

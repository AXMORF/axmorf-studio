import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

import {
  DoctorResponseSchema,
  EngineToMainMessageSchema,
  RSP_PROTOCOL_VERSION,
  type DoctorResponse,
  type EngineToMainMessage,
} from "../../desktop/contracts/protocol";
import {
  createEngineController,
  type EngineMessageEvent,
} from "../../desktop/engine/entry";

const execFileAsync = promisify(execFile);

const tokenEvent = ({
  workspaceRoot,
  repositoryRoot,
  expiresAt,
  token,
}: {
  readonly workspaceRoot: string;
  readonly repositoryRoot: string;
  readonly expiresAt: string;
  readonly token: Uint8Array;
}): EngineMessageEvent => {
  let listener: ((event: MessageEvent<unknown>) => void) | undefined;
  let closed = false;
  return {
    data: {
      protocolVersion: RSP_PROTOCOL_VERSION,
      requestId: "integration-initialize",
      type: "initialize",
      workspaceRoot,
      repositoryRoot,
      appPid: process.pid,
      sessionExpiresAt: expiresAt,
    },
    ports: [
      {
        on: (_type, nextListener) => {
          listener = nextListener;
        },
        off: () => {
          listener = undefined;
        },
        start: () => {
          queueMicrotask(() => {
            if (!closed) listener?.({ data: token } as MessageEvent<unknown>);
          });
        },
        close: () => {
          closed = true;
        },
      },
    ],
  };
};

export type DesktopIntegrationSmokeResult = Readonly<{
  workspaceInitialized: true;
  discoveryFilesReadable: true;
  rspExitCode: 0;
  doctor: DoctorResponse;
  sessionCleaned: true;
}>;

export const runDesktopIntegrationSmoke = async ({
  repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../.."),
}: {
  readonly repositoryRoot?: string;
} = {}): Promise<DesktopIntegrationSmokeResult> => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "axmorf-desktop-smoke-"));
  const workspaceRoot = join(fixtureRoot, "AXMORF Studio");
  const messages: EngineToMainMessage[] = [];
  const controller = createEngineController({
    parentPort: {
      postMessage: (message) => {
        messages.push(EngineToMainMessageSchema.parse(message));
      },
    },
  });
  try {
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    await controller.handleMessageEvent(
      tokenEvent({
        workspaceRoot,
        repositoryRoot,
        expiresAt,
        token: randomBytes(32),
      }),
    );
    assert.deepEqual(
      messages.map(({ type }) => type),
      ["initialized", "doctor-state"],
    );

    const agents = await readFile(join(workspaceRoot, "AGENTS.md"), "utf8");
    const skill = await readFile(
      join(
        workspaceRoot,
        ".agents/skills/remotion-story-producer-video/SKILL.md",
      ),
      "utf8",
    );
    assert.match(agents, /\.rsp\/bin\/rsp doctor/u);
    assert.match(skill, /\.rsp\/bin\/rsp doctor/u);

    const rspPath = join(workspaceRoot, ".rsp/bin/rsp");
    const execution = await execFileAsync(rspPath, ["doctor"], {
      cwd: workspaceRoot,
      encoding: "utf8",
      timeout: 10_000,
    });
    const doctor = DoctorResponseSchema.parse(JSON.parse(execution.stdout));
    assert.equal(execution.stderr, "");
    assert.equal(doctor.desktopTcpListeners, false);
    assert.equal(doctor.repositoryMode, "build-time-checkout");
    assert.equal(doctor.productionAvailable, false);

    await controller.handleMessageEvent({
      data: {
        protocolVersion: RSP_PROTOCOL_VERSION,
        requestId: "integration-shutdown",
        type: "shutdown",
      },
    });
    assert.equal(messages.at(-1)?.type, "stopped");
    for (const ownedPath of ["session.json", "token", "rsp.sock"]) {
      await assert.rejects(
        access(join(workspaceRoot, ".rsp/session", ownedPath)),
        { code: "ENOENT" },
      );
    }
    return {
      workspaceInitialized: true,
      discoveryFilesReadable: true,
      rspExitCode: 0,
      doctor,
      sessionCleaned: true,
    };
  } finally {
    await controller.stopOwnedResources();
    await rm(fixtureRoot, { recursive: true, force: true });
  }
};

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  void runDesktopIntegrationSmoke()
    .then((result) => {
      process.stdout.write(`${JSON.stringify(result)}\n`);
    })
    .catch((error: unknown) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : "Desktop integration smoke failed."}\n`,
      );
      process.exitCode = 1;
    });
}

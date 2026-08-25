import { z } from "zod";

import {
  RspPublicCommandError,
  rspZodIssues,
  type RspFieldIssue,
} from "../contracts/issues";

type TaskOperation = "describe" | "finalize" | "check" | "commit";

const prepareIssue = (error: unknown): RspFieldIssue => {
  const message = error instanceof Error ? error.message : "";
  if (/scene template|scene task compile/iu.test(message)) {
    return {
      path: "$.storyId",
      code: "rsp-prepare-scene-template-failed",
      message: "A configured Scene template failed fixed preparation.",
      ownerAction:
        "Do not retry this stopped lifecycle. Update AXMORF Studio to a compatible Runtime Pack, then start a new prepare attempt.",
    };
  }
  if (/narration|audio|ffmpeg|ffprobe|pcm|wav/iu.test(message)) {
    return {
      path: "$.storyId",
      code: "rsp-prepare-narration-failed",
      message: "Narration failed fixed preparation or validation.",
      ownerAction:
        "Do not retry this stopped lifecycle. Preserve rsp inspect output and verify the installed Runtime Pack before starting a new prepare attempt.",
    };
  }
  return {
    path: "$.storyId",
    code: "rsp-prepare-internal-failed",
    message: "Production preparation failed before completion.",
    ownerAction:
      "Do not retry this stopped lifecycle. Preserve rsp inspect output and report this issue code before starting a new prepare attempt.",
  };
};

const taskIssue = ({
  operation,
  error,
}: {
  readonly operation: TaskOperation;
  readonly error: unknown;
}): RspFieldIssue => {
  const message = error instanceof Error ? error.message : "";
  const ownerAction =
    "Read inputs/task-contract.json, correct only declared output paths, then rerun rsp task finalize and rsp task check.";
  if (/missing|ambiguous|unsafe|exact file set/iu.test(message)) {
    return {
      path: "$.workspace",
      code: "rsp-task-workspace-invalid",
      message: "Task workspace files do not match the exact task authority.",
      ownerAction,
    };
  }
  if (/network|css animation|css transition|forbidden|boundary/iu.test(message)) {
    return {
      path: "$.outputs",
      code: "rsp-task-policy-invalid",
      message: "Task output violates a fixed runtime or ownership policy.",
      ownerAction,
    };
  }
  if (/source|compile|component|renderer|cover|globalvisual/iu.test(message)) {
    return {
      path: "$.outputs",
      code: "rsp-task-source-invalid",
      message: "Task source does not satisfy its fixed component or source contract.",
      ownerAction,
    };
  }
  if (/fingerprint|stale|identity|order|resource|plan|receipt|selection/iu.test(message)) {
    return {
      path: "$.outputs",
      code: "rsp-task-contract-invalid",
      message: "Task artifacts do not satisfy their frozen identity or cross-file contract.",
      ownerAction,
    };
  }
  return {
    path: "$.outputs",
    code: `rsp-task-${operation}-failed`,
    message: `Task ${operation} failed fixed validation.`,
    ownerAction,
  };
};

export const publicTaskCommandError = ({
  operation,
  error,
}: {
  readonly operation: TaskOperation;
  readonly error: unknown;
}) => {
  const issues =
    error instanceof z.ZodError
      ? rspZodIssues({
          error,
          codePrefix: "rsp-task-contract",
          ownerAction:
            "Correct the named output field, rerun rsp task finalize, then rerun rsp task check.",
        })
      : [taskIssue({ operation, error })];
  return new RspPublicCommandError(
    "rsp-command-failed",
    `Task ${operation} failed fixed validation.`,
    issues,
  );
};

export const publicPrepareCommandError = (error: unknown) => {
  const failure = new RspPublicCommandError(
    "rsp-command-failed",
    "Production preparation failed.",
    [prepareIssue(error)],
  );
  Object.defineProperty(failure, "cause", {
    value: error,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return failure;
};
